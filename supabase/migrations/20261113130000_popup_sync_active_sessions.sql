-- 팝업 저장 시 세션 동기화 보강(2026-11-13):
-- 기존에는 status='PLANNED'인 세션만 갱신해서, 생산이 시작된(IN_PROGRESS) 세션은 품목 수량/제품/규격/날짜가
-- 팝업과 어긋났고 품목 이름이 바뀌어도 세션 이름은 그대로였다. 완료·취소만 제외하고 모두 갱신하고 이름도 맞춘다.
-- 레시피 배수와 생산 기록은 여전히 건드리지 않는다.
CREATE OR REPLACE FUNCTION public.save_popup_order(p_order_id uuid, p_expected_updated_at timestamp with time zone, p_plan jsonb, p_start timestamp with time zone, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old_order public.orders%rowtype; saved public.orders%rowtype; i jsonb; profile_id uuid;
begin
  select * into old_order from public.orders where id=p_order_id and user_id=auth.uid() and order_kind='POPUP' for update;
  if not found then raise exception '팝업에 접근할 수 없습니다'; end if;
  if p_expected_updated_at is null or old_order.updated_at<>p_expected_updated_at then raise exception '다른 화면에서 변경되었습니다. 최신 값을 불러오세요'; end if;
  if p_status is null or p_status not in ('INTAKE','CONFIRMED','DESIGN','PRODUCTION','FINAL_TOUCH','DELIVERY','COMPLETED') then raise exception '팝업 상태를 확인하세요'; end if;
  if p_start is not null and not isfinite(p_start) then raise exception '시작 시각을 확인하세요'; end if;
  update public.orders set popup_plan=p_plan,pickup_at=p_start,
    event_date=(p_start at time zone 'Australia/Sydney')::date,status=p_status where id=p_order_id and user_id=auth.uid() returning * into saved;
  for i in select value from jsonb_array_elements(p_plan->'items') loop
    if nullif(i->>'work_session_id','') is not null then
      profile_id:=null;
      if nullif(i->>'product_id','') is not null and nullif(i->>'standard_id','') is not null then
        profile_id:=public.ensure_product_standard_profile((i->>'product_id')::uuid,(i->>'standard_id')::uuid);
      end if;
      -- Only planning metadata changes. Recipe multipliers and recorded production never change.
      update public.work_sessions set product_id=nullif(i->>'product_id','')::uuid,
        product_size_id=profile_id,cake_size_id=nullif(i->>'standard_id','')::uuid,
        target_unit_count=(i->>'quantity')::numeric,scheduled_date=saved.event_date,
        name='POP UP · '||(p_plan->>'title')||' · '||(i->>'label')
        where id=(i->>'work_session_id')::uuid and user_id=auth.uid() and status not in ('COMPLETED','CANCELLED');
    end if;
  end loop;
  insert into public.order_production_sync_log(user_id,order_id,source,before_value,after_value)
    values(auth.uid(),p_order_id,'popup_plan',to_jsonb(old_order),to_jsonb(saved));
  return to_jsonb(saved);
end; $function$;
