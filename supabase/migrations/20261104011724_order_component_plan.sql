-- Order and Production edit the same selection. No duplicate plan rows or legacy mappings.
alter table public.work_session_formula_versions
  add column if not exists target_quantity_g numeric,
  add column if not exists version_pinned boolean not null default false;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.work_session_formula_versions'::regclass and conname='selection_target_quantity_g_check') then
    alter table public.work_session_formula_versions add constraint selection_target_quantity_g_check
      check(target_quantity_g is null or (target_quantity_g>=0 and target_quantity_g::text not in ('NaN','Infinity','-Infinity')));
  end if;
end $$;

create or replace function public.save_order_component_plan(
  p_selection_id uuid, p_expected_updated_at timestamptz, p_version_id uuid,
  p_multiplier numeric, p_target_quantity_g numeric, p_version_pinned boolean default true
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  uid uuid:=auth.uid(); r public.work_session_formula_versions%rowtype;
  s public.work_sessions%rowtype; o public.orders%rowtype;
  v public.formula_versions%rowtype; updated public.work_session_formula_versions%rowtype;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  select * into r from public.work_session_formula_versions where id=p_selection_id and user_id=uid for update;
  if not found then raise exception '작업 항목에 접근할 수 없습니다'; end if;
  if r.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 화면에서 변경되었습니다. 최신 계획을 불러온 뒤 다시 저장하세요';
  end if;
  select * into s from public.work_sessions where id=r.work_session_id and user_id=uid;
  if not found or s.order_id is null then raise exception '주문에 연결된 세션이 필요합니다'; end if;
  select * into o from public.orders where id=s.order_id and user_id=uid;
  if not found then raise exception '주문에 접근할 수 없습니다'; end if;
  if s.status in('COMPLETED','CANCELLED') or o.status in('COMPLETED','CANCELLED') then
    raise exception '완료·취소된 주문의 생산 계획은 변경할 수 없습니다';
  end if;
  if p_multiplier is null or p_multiplier::text in('NaN','Infinity','-Infinity')
    or p_multiplier<=0 or ((p_multiplier<1 or trunc(p_multiplier)<>p_multiplier) and p_multiplier is distinct from r.multiplier) then
    raise exception '생산 배수는 1 이상의 정수로 입력하세요';
  end if;
  if p_target_quantity_g is not null and
    (p_target_quantity_g<0 or p_target_quantity_g::text in('NaN','Infinity','-Infinity')) then
    raise exception '사용 목표는 0 이상의 g 값으로 입력하세요';
  end if;
  select * into v from public.formula_versions where id=p_version_id and user_id=uid;
  if not found then raise exception '레시피 버전에 접근할 수 없습니다'; end if;
  if v.status in('ARCHIVED','SUPERSEDED') and v.id<>r.formula_version_id then
    raise exception '보관·대체된 버전은 새로 선택할 수 없습니다';
  end if;
  if o.dietary_build_id is not null and not exists(
    select 1 from public.dietary_build_items where build_id=o.dietary_build_id and user_id=uid and formula_version_id=v.id
  ) then raise exception '이 주문의 식이 Build에 포함된 버전을 선택하세요'; end if;
  update public.work_session_formula_versions set
    formula_version_id=p_version_id,multiplier=p_multiplier,target_quantity_g=p_target_quantity_g,
    version_pinned=coalesce(p_version_pinned,true)
    where id=r.id and user_id=uid returning * into updated;
  -- Existing selection trigger records full before/after values in order_production_sync_log.
  if r.multiplier is distinct from p_multiplier then
    insert into public.work_session_multiplier_history(user_id,work_session_id,formula_version_id,
      work_session_formula_version_id,previous_multiplier,applied_multiplier,resulting_working_quantity_snapshot)
    values(uid,s.id,p_version_id,r.id,r.multiplier,p_multiplier,
      coalesce((select jsonb_agg(jsonb_build_object('ingredient_line_id',i.id,'ingredient_id',i.ingredient_id,
        'ingredient_name',raw.name,'original_amount',i.amount,'unit',i.unit,'working_amount',i.amount*p_multiplier)
        order by i.sort_order,i.id)
        from public.formula_version_ingredients i join public.ingredients raw on raw.id=i.ingredient_id and raw.user_id=uid
        where i.formula_version_id=p_version_id and i.user_id=uid),'[]'::jsonb));
  end if;
  return to_jsonb(updated);
end $$;
revoke all on function public.save_order_component_plan(uuid,timestamptz,uuid,numeric,numeric,boolean) from public,anon;
grant execute on function public.save_order_component_plan(uuid,timestamptz,uuid,numeric,numeric,boolean) to authenticated;

-- Explicitly selected order-specific versions must survive future CURRENT promotions.
create or replace function public.pilot_current_version_to_production() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r record;
begin
  if new.status<>'CURRENT' then return new; end if;
  if tg_op='UPDATE' and old.status='CURRENT' then return new; end if;
  for r in select w.id from public.work_session_formula_versions w
    join public.formula_versions v on v.id=w.formula_version_id and v.user_id=new.user_id
    join public.work_sessions s on s.id=w.work_session_id and s.user_id=new.user_id
    join public.orders o on o.id=s.order_id and o.user_id=new.user_id
    where w.user_id=new.user_id and w.kind='CORE' and v.formula_id=new.formula_id and w.formula_version_id<>new.id
      and not w.version_pinned
      and s.status not in('COMPLETED','CANCELLED') and o.status not in('COMPLETED','CANCELLED')
      and o.dietary_build_id is null
      and (case w.slot when 'SHEET' then o.flavoring_sheet_formula_id when 'CREAM' then o.flavoring_cream_formula_id when 'FILLING' then o.flavoring_filling_formula_id end is null
        or case w.slot when 'SHEET' then o.flavoring_sheet_formula_id when 'CREAM' then o.flavoring_cream_formula_id when 'FILLING' then o.flavoring_filling_formula_id end=new.formula_id)
  loop
    update public.work_session_formula_versions set formula_version_id=new.id where id=r.id and user_id=new.user_id;
  end loop;
  return new;
end $$;
