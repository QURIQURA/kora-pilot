-- 주문 컴포넌트 생산 계획 v3 — 기준중량(SETTINGS > BASE WEIGHTS) × 개수 = 목표 중량 방정식을 저장한다.
-- v2는 몰드 기준만 정수 배수 규칙에서 빠져 있어, 기준중량 기준 소수점 배수(예: 700g × 1.5)가 저장되지 않았다.
create or replace function public.save_order_component_plan_v3(
  p_selection_id uuid,
  p_expected_updated_at timestamptz,
  p_version_id uuid,
  p_multiplier numeric,
  p_target_quantity_g numeric,
  p_version_pinned boolean,
  p_mould_id uuid,
  p_mould_qty numeric,
  p_base_weight_id uuid default null,
  p_base_weight_qty numeric default null
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  uid uuid:=auth.uid(); r public.work_session_formula_versions%rowtype;
  s public.work_sessions%rowtype; o public.orders%rowtype;
  v public.formula_versions%rowtype; updated public.work_session_formula_versions%rowtype;
  v_cap uuid; v_cap_qty numeric;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  select * into r from public.work_session_formula_versions where id=p_selection_id and user_id=uid for update;
  if not found then raise exception '작업 항목에 접근할 수 없습니다'; end if;
  if r.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 화면에서 변경되었습니다. 최신 계획을 불러온 뒤 다시 저장하세요';
  end if;
  select * into s from public.work_sessions where id=r.work_session_id and user_id=uid;
  if not found then raise exception '세션에 접근할 수 없습니다'; end if;
  if s.order_id is not null then
    select * into o from public.orders where id=s.order_id and user_id=uid;
  else
    select * into o from public.orders popup where popup.user_id=uid and popup.order_kind='POPUP'
      and exists(select 1 from jsonb_array_elements(popup.popup_plan->'items') i where i->>'work_session_id'=s.id::text);
  end if;
  if not found then raise exception '주문에 접근할 수 없습니다'; end if;
  if s.status in('COMPLETED','CANCELLED') or o.status in('COMPLETED','CANCELLED') then
    raise exception '완료·취소된 주문의 생산 계획은 변경할 수 없습니다';
  end if;
  if p_mould_id is not null and p_base_weight_id is not null then
    raise exception '몰드와 기준중량은 함께 지정할 수 없습니다';
  end if;
  if p_multiplier is null or p_multiplier::text in('NaN','Infinity','-Infinity') or p_multiplier<=0 then
    raise exception '생산 배수는 0보다 큰 숫자여야 합니다';
  end if;
  -- 몰드 또는 기준중량 기준이면 배수가 정수가 아닐 수 있다. 둘 다 없이 직접 입력할 때만 정수 규칙.
  if p_mould_id is null and p_base_weight_id is null
     and ((p_multiplier<1 or trunc(p_multiplier)<>p_multiplier) and p_multiplier is distinct from r.multiplier) then
    raise exception '생산 배수는 1 이상의 정수로 입력하세요';
  end if;
  if p_mould_id is not null and (p_mould_qty is null or p_mould_qty<=0) then
    raise exception '몰드 개수는 0보다 큰 숫자여야 합니다';
  end if;
  if p_base_weight_id is not null then
    if p_base_weight_qty is null or p_base_weight_qty<=0 then
      raise exception '기준중량 개수는 0보다 큰 숫자여야 합니다';
    end if;
    if not exists(select 1 from public.base_weight_presets where id=p_base_weight_id and user_id=uid) then
      raise exception '기준중량을 찾을 수 없습니다';
    end if;
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
  v_cap := case
    when p_mould_id is not null and exists(select 1 from public.capacities where id=p_mould_id) then p_mould_id
    when p_base_weight_id is not null and exists(select 1 from public.capacities where id=p_base_weight_id) then p_base_weight_id
    else null end;
  v_cap_qty := case when p_mould_id is not null then p_mould_qty when p_base_weight_id is not null then p_base_weight_qty else null end;
  update public.work_session_formula_versions set
    formula_version_id=p_version_id,multiplier=p_multiplier,target_quantity_g=p_target_quantity_g,
    version_pinned=coalesce(p_version_pinned,true),
    mould_id=p_mould_id, mould_qty=case when p_mould_id is null then null else p_mould_qty end,
    base_weight_id=p_base_weight_id, base_weight_qty=case when p_base_weight_id is null then null else p_base_weight_qty end,
    capacity_id=case when v_cap is null then null else v_cap end,
    capacity_qty=case when v_cap is null then null else v_cap_qty end
    where id=r.id and user_id=uid returning * into updated;
  if s.order_id is null then
    insert into public.order_production_sync_log(user_id,order_id,selection_id,source,before_value,after_value)
      values(uid,o.id,r.id,'popup_component_plan',to_jsonb(r),to_jsonb(updated));
  end if;
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
end $function$;
