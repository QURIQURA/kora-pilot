-- 블렌드(합성) 포뮬라를 WORK SESSION에서 원본별 하위 행으로 분리한다.
-- 부모 선택 행은 그대로(주문 계획·풀·타임라인 기준), 원본 포뮬라마다 하위 선택 행이 자동 생성/동기화된다.
alter table public.work_session_formula_versions
  add column if not exists parent_selection_id uuid references public.work_session_formula_versions(id) on delete cascade,
  add column if not exists source_index integer;

create unique index if not exists work_session_formula_versions_parent_source_uq
  on public.work_session_formula_versions(parent_selection_id, source_index)
  where parent_selection_id is not null;
create index if not exists work_session_formula_versions_parent_idx
  on public.work_session_formula_versions(parent_selection_id) where parent_selection_id is not null;

create or replace function public.sync_blend_child_selections()
returns trigger language plpgsql set search_path = '' as $$
declare src jsonb; srcs jsonb; n int; i int := 0; f numeric; vid uuid;
begin
  select v.component_sources into srcs from public.formula_versions v
    where v.id = new.formula_version_id and v.user_id = new.user_id;
  n := case when jsonb_typeof(srcs) = 'array' then jsonb_array_length(srcs) else 0 end;
  if n = 0 then
    delete from public.work_session_formula_versions where parent_selection_id = new.id;
    return null;
  end if;
  delete from public.work_session_formula_versions where parent_selection_id = new.id and source_index >= n;
  for src in select * from jsonb_array_elements(srcs) loop
    vid := nullif(src->>'version_id','')::uuid;
    f := case when coalesce((src->>'base_weight_g')::numeric,0) > 0
              then (src->>'amount_g')::numeric / (src->>'base_weight_g')::numeric * new.multiplier
              else new.multiplier end;
    if vid is not null and f > 0 and exists(select 1 from public.formula_versions where id = vid and user_id = new.user_id) then
      insert into public.work_session_formula_versions
        (user_id, work_session_id, formula_version_id, multiplier, sort_order, kind, slot, parent_selection_id, source_index, version_pinned)
      values (new.user_id, new.work_session_id, vid, f, new.sort_order, 'DECORATIVE', new.slot, new.id, i, true)
      on conflict (parent_selection_id, source_index) where parent_selection_id is not null
      do update set multiplier = excluded.multiplier, formula_version_id = excluded.formula_version_id,
                    slot = excluded.slot, sort_order = excluded.sort_order;
    end if;
    i := i + 1;
  end loop;
  return null;
end $$;

drop trigger if exists blend_child_sync on public.work_session_formula_versions;
create trigger blend_child_sync
  after insert or update of formula_version_id, multiplier on public.work_session_formula_versions
  for each row when (new.parent_selection_id is null)
  execute function public.sync_blend_child_selections();

-- 기존 블렌드 선택 행 변환
update public.work_session_formula_versions set multiplier = multiplier
  where parent_selection_id is null
    and formula_version_id in (select id from public.formula_versions
      where jsonb_typeof(component_sources)='array' and jsonb_array_length(component_sources)>0);
