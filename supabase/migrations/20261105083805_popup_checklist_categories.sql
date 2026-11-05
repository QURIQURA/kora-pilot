-- Per-popup categories; no existing items or check states are rewritten.
create or replace function public.validate_popup_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare i jsonb; c jsonb; q numeric; ready numeric; sid uuid; categories jsonb; category_entry jsonb;
begin
  if new.order_kind<>'POPUP' then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception '팝업 소유권을 확인하세요'; end if;
  if jsonb_typeof(new.popup_plan->'title') is distinct from 'string' then raise exception '팝업 이름을 확인하세요'; end if;
  if coalesce(length(trim(new.popup_plan->>'title')),0) not between 1 and 200 then raise exception '팝업 이름을 입력하세요 (200자 이내)'; end if;
  if jsonb_typeof(new.popup_plan->'items') is distinct from 'array' or jsonb_typeof(new.popup_plan->'checklist') is distinct from 'array' then raise exception '품목과 준비 목록을 확인하세요'; end if;
  if jsonb_array_length(new.popup_plan->'items')>100 or jsonb_array_length(new.popup_plan->'checklist')>300 then raise exception '품목/준비 목록이 너무 많습니다'; end if;
  if (select count(distinct (v->>'id')::uuid) from jsonb_array_elements(new.popup_plan->'items') v)<>jsonb_array_length(new.popup_plan->'items')
    or (select count(distinct (v->>'id')::uuid) from jsonb_array_elements(new.popup_plan->'checklist') v)<>jsonb_array_length(new.popup_plan->'checklist') then raise exception '중복 또는 누락된 항목 ID'; end if;
  for i in select value from jsonb_array_elements(new.popup_plan->'items') loop
    if coalesce(length(trim(i->>'label')),0) not between 1 and 300 or coalesce(length(trim(i->>'unit')),0) not between 1 and 40 then raise exception '품목 이름과 단위를 입력하세요'; end if;
    if jsonb_typeof(i->'quantity') is distinct from 'number' or jsonb_typeof(i->'ready_quantity') is distinct from 'number' then raise exception '수량은 숫자로 입력하세요'; end if;
    q:=(i->>'quantity')::numeric; ready:=(i->>'ready_quantity')::numeric;
    if q<1 or q<>trunc(q) or q>2147483647 or ready<0 or ready<>trunc(ready) or ready>2147483647 then raise exception '계획 수량은 1 이상, 준비 수량은 0 이상의 정수여야 합니다'; end if;
    if nullif(i->>'product_id','') is not null and not exists(select 1 from public.products where id=(i->>'product_id')::uuid and user_id=new.user_id) then raise exception '제품에 접근할 수 없습니다'; end if;
    if nullif(i->>'standard_id','') is not null and not exists(select 1 from public.cake_sizes where id=(i->>'standard_id')::uuid and user_id=new.user_id) then raise exception '공용 규격에 접근할 수 없습니다'; end if;
    sid:=nullif(i->>'work_session_id','')::uuid;
    if sid is not null then
      if not exists(select 1 from public.work_sessions where id=sid and user_id=new.user_id and order_id is null) then raise exception '팝업 생산 세션에 접근할 수 없습니다'; end if;
      if (select count(*) from jsonb_array_elements(new.popup_plan->'items') v where v->>'work_session_id'=sid::text)>1
        or exists(select 1 from public.orders o cross join lateral jsonb_array_elements(coalesce(o.popup_plan->'items','[]'::jsonb)) v where o.id<>new.id and o.user_id=new.user_id and v->>'work_session_id'=sid::text) then raise exception '생산 세션이 다른 품목에 연결되어 있습니다'; end if;
    end if;
  end loop;
  -- Preserve category metadata when an older client submits only the original fields.
  if tg_op='UPDATE' and old.popup_plan ? 'check_categories' and not (new.popup_plan ? 'check_categories') then
    new.popup_plan:=jsonb_set(new.popup_plan,'{check_categories}',old.popup_plan->'check_categories');
  end if;
  categories:=coalesce(new.popup_plan->'check_categories','[{"id":"ORDER","label":"주문 확인"},{"id":"PACKAGING","label":"포장 준비"},{"id":"INGREDIENT","label":"재료 구비"},{"id":"OTHER","label":"기타 준비"}]'::jsonb);
  if jsonb_typeof(categories)<>'array' then raise exception '카테고리 목록을 확인하세요'; end if;
  if jsonb_array_length(categories)>30 then raise exception '카테고리는 30개까지 추가할 수 있습니다'; end if;
  if (select count(distinct v->>'id') from jsonb_array_elements(categories) v)<>jsonb_array_length(categories)
    or (select count(distinct lower(trim(v->>'label'))) from jsonb_array_elements(categories) v)<>jsonb_array_length(categories) then
    raise exception '같은 이름 또는 ID의 카테고리가 있습니다';
  end if;
  for category_entry in select value from jsonb_array_elements(categories) loop
    if jsonb_typeof(category_entry->'id') is distinct from 'string' or (category_entry->>'id') !~ '^[A-Za-z0-9_-]{1,80}$'
      or jsonb_typeof(category_entry->'label') is distinct from 'string' or length(trim(category_entry->>'label')) not between 1 and 80 then
      raise exception '카테고리 이름은 1–80자로 입력하세요';
    end if;
  end loop;
  for c in select value from jsonb_array_elements(new.popup_plan->'checklist') loop
    if not exists(select 1 from jsonb_array_elements(categories) category_row where category_row->>'id'=c->>'group')
      or coalesce(length(trim(c->>'label')),0) not between 1 and 1000 or jsonb_typeof(c->'done') is distinct from 'boolean' then
      raise exception '준비 항목의 내용과 카테고리를 확인하세요. 삭제한 카테고리의 항목은 먼저 옮겨야 합니다';
    end if;
  end loop;
  if nullif(new.popup_plan->>'ends_at','') is not null then
    if not isfinite((new.popup_plan->>'ends_at')::timestamptz) or new.pickup_at is null or (new.popup_plan->>'ends_at')::timestamptz<=new.pickup_at then raise exception '종료 시각은 시작 시각 이후여야 합니다'; end if;
  end if;
  return new;
end; $$;

revoke all on function public.validate_popup_order() from public,anon;
