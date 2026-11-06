-- 2026-11-06: 포뮬라 R&D 실험.
-- 실험 = 기준 버전을 복사한 DRAFT 버전 + 결과 기록(구운 높이/메모). 결과를 본 뒤
--   PROMOTED  → 그 버전을 CURRENT로(기존 CURRENT는 트리거가 SUPERSEDED로)
--   KEPT      → 실험 기록으로 ARCHIVED 보관(생산에는 안 씀)
--   DISCARDED → 폐기(ARCHIVED, 결과 메모만 남김)
create table if not exists public.formula_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  formula_id uuid not null references public.formulas(id) on delete cascade,
  base_version_id uuid references public.formula_versions(id) on delete set null,
  version_id uuid references public.formula_versions(id) on delete set null,
  title text not null,
  hypothesis text,
  result_height_mm numeric check (result_height_mm is null or result_height_mm > 0),
  result_notes text,
  status text not null default 'OPEN' check (status in ('OPEN','PROMOTED','KEPT','DISCARDED')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists formula_experiments_user_status_idx on public.formula_experiments(user_id, status);
create index if not exists formula_experiments_version_idx on public.formula_experiments(version_id);
alter table public.formula_experiments enable row level security;
drop policy if exists "own formula_experiments" on public.formula_experiments;
create policy "own formula_experiments" on public.formula_experiments for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists update_formula_experiments_updated_at on public.formula_experiments;
create trigger update_formula_experiments_updated_at before update on public.formula_experiments
  for each row execute function public.update_updated_at_column();

-- 실험 시작: 기준 버전을 복사한 DRAFT 버전과 실험 행을 만든다.
create or replace function public.start_formula_experiment(
  p_formula_id uuid, p_base_version_id uuid, p_title text, p_hypothesis text default null)
returns uuid language plpgsql set search_path = '' as $$
declare uid uuid := auth.uid(); base public.formula_versions; new_version uuid; exp_id uuid; next_no int;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  if nullif(btrim(p_title), '') is null then raise exception '실험 이름을 입력하세요'; end if;
  select * into base from public.formula_versions
    where id = p_base_version_id and formula_id = p_formula_id and user_id = uid;
  if not found then raise exception '기준 버전을 찾을 수 없습니다'; end if;
  select coalesce(max(version_number), 0) + 1 into next_no
    from public.formula_versions where formula_id = p_formula_id;
  insert into public.formula_versions(user_id, formula_id, version_number, status, default_mould_id,
      default_base_weight_id, default_capacity_id, yield_quantity, component_sources, notes,
      change_summary, change_reason, bath_water_g, basis_overrides)
    values (uid, p_formula_id, next_no, 'DRAFT', base.default_mould_id, base.default_base_weight_id,
      base.default_capacity_id, base.yield_quantity, base.component_sources, base.notes,
      'R&D: ' || btrim(p_title), nullif(btrim(coalesce(p_hypothesis, '')), ''), base.bath_water_g,
      base.basis_overrides)
    returning id into new_version;
  insert into public.formula_version_ingredients(user_id, formula_version_id, ingredient_id, amount, unit,
      sort_order, note, secondary_amount, secondary_unit, amount_source)
    select uid, new_version, ingredient_id, amount, unit, sort_order, note, secondary_amount,
      secondary_unit, 'copied'
    from public.formula_version_ingredients where formula_version_id = base.id;
  insert into public.formula_experiments(user_id, formula_id, base_version_id, version_id, title, hypothesis)
    values (uid, p_formula_id, base.id, new_version, btrim(p_title), nullif(btrim(coalesce(p_hypothesis, '')), ''))
    returning id into exp_id;
  return exp_id;
end; $$;

-- 결정: PROMOTED(생산용 CURRENT로) / KEPT(실험 기록으로 보관) / DISCARDED(폐기)
create or replace function public.decide_formula_experiment(p_id uuid, p_decision text)
returns void language plpgsql set search_path = '' as $$
declare uid uuid := auth.uid(); e public.formula_experiments;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_decision not in ('PROMOTED','KEPT','DISCARDED') then raise exception '알 수 없는 결정입니다'; end if;
  select * into e from public.formula_experiments where id = p_id and user_id = uid for update;
  if not found then raise exception '실험을 찾을 수 없습니다'; end if;
  if e.status <> 'OPEN' then raise exception '이미 결정된 실험입니다'; end if;
  if e.version_id is null then raise exception '실험 버전이 없어 적용할 수 없습니다'; end if;
  update public.formula_versions
    set status = case when p_decision = 'PROMOTED' then 'CURRENT' else 'ARCHIVED' end::public.formula_status
    where id = e.version_id and user_id = uid;
  update public.formula_experiments set status = p_decision, decided_at = now() where id = e.id;
end; $$;
revoke all on function public.start_formula_experiment(uuid,uuid,text,text) from public, anon;
revoke all on function public.decide_formula_experiment(uuid,text) from public, anon;
grant execute on function public.start_formula_experiment(uuid,uuid,text,text) to authenticated;
grant execute on function public.decide_formula_experiment(uuid,text) to authenticated;

-- 기존 DRAFT 중 아직 어디에도 쓰이지 않은 것은 보관으로 옮긴다(생산 세션·상품·식이 구성에 쓰인 DRAFT는 그대로).
update public.formula_versions fv set status = 'ARCHIVED'
where fv.status = 'DRAFT'
  and not exists (select 1 from public.formula_experiments x where x.version_id = fv.id and x.status = 'OPEN')
  and not exists (select 1 from public.work_session_formula_versions w where w.formula_version_id = fv.id)
  and not exists (select 1 from public.work_session_tasks t where t.formula_version_id = fv.id)
  and not exists (select 1 from public.product_components p where p.formula_version_id = fv.id)
  and not exists (select 1 from public.dietary_build_items d where d.formula_version_id = fv.id);
