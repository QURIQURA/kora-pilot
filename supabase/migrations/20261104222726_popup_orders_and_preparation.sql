-- Pop-ups share the order list/calendar; each production item has its own optional session.
alter table public.orders add column order_kind text not null default 'CAKE' check(order_kind in ('CAKE','POPUP'));
alter table public.orders add column popup_plan jsonb not null default '{}'::jsonb check(jsonb_typeof(popup_plan)='object');

create or replace function public.validate_popup_order()
returns trigger language plpgsql security invoker set search_path='' as $$
declare i jsonb; c jsonb; q numeric; ready numeric; sid uuid;
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
  for c in select value from jsonb_array_elements(new.popup_plan->'checklist') loop
    if c->>'group' is null or c->>'group' not in ('ORDER','PACKAGING','INGREDIENT','OTHER')
      or coalesce(length(trim(c->>'label')),0) not between 1 and 1000 or jsonb_typeof(c->'done') is distinct from 'boolean' then raise exception '준비 항목의 분류, 내용, 체크 상태를 확인하세요'; end if;
  end loop;
  if nullif(new.popup_plan->>'ends_at','') is not null then
    if not isfinite((new.popup_plan->>'ends_at')::timestamptz) or new.pickup_at is null or (new.popup_plan->>'ends_at')::timestamptz<=new.pickup_at then raise exception '종료 시각은 시작 시각 이후여야 합니다'; end if;
  end if;
  return new;
end; $$;
create trigger validate_popup_order before insert or update of order_kind,popup_plan,pickup_at,user_id on public.orders
for each row execute function public.validate_popup_order();
revoke all on function public.validate_popup_order() from public,anon;

create or replace function public.save_popup_order(p_order_id uuid,p_expected_updated_at timestamptz,p_plan jsonb,p_start timestamptz,p_status text)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
        target_unit_count=(i->>'quantity')::numeric,scheduled_date=saved.event_date
        where id=(i->>'work_session_id')::uuid and user_id=auth.uid() and status='PLANNED';
    end if;
  end loop;
  insert into public.order_production_sync_log(user_id,order_id,source,before_value,after_value)
    values(auth.uid(),p_order_id,'popup_plan',to_jsonb(old_order),to_jsonb(saved));
  return to_jsonb(saved);
end; $$;
revoke all on function public.save_popup_order(uuid,timestamptz,jsonb,timestamptz,text) from public,anon;
grant execute on function public.save_popup_order(uuid,timestamptz,jsonb,timestamptz,text) to authenticated;

create or replace function public.create_popup_item_session(p_order_id uuid,p_item_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; i jsonb; n integer; sid uuid; profile_id uuid;
begin
  select * into o from public.orders where id=p_order_id and user_id=auth.uid() and order_kind='POPUP' for update;
  if not found then raise exception '팝업에 접근할 수 없습니다'; end if;
  if o.status in ('COMPLETED','CANCELLED') then raise exception '완료/취소된 팝업에는 세션을 생성할 수 없습니다'; end if;
  select value,ordinality::integer-1 into i,n from jsonb_array_elements(o.popup_plan->'items') with ordinality where value->>'id'=p_item_id::text;
  if not found then raise exception '품목을 찾을 수 없습니다'; end if;
  sid:=nullif(i->>'work_session_id','')::uuid;
  if sid is not null then return jsonb_build_object('session_id',sid); end if;
  if p_expected_updated_at is null or o.updated_at<>p_expected_updated_at then raise exception '최신 팝업을 불러온 후 다시 시도하세요'; end if;
  if nullif(i->>'product_id','') is not null and nullif(i->>'standard_id','') is not null then
    profile_id:=public.ensure_product_standard_profile((i->>'product_id')::uuid,(i->>'standard_id')::uuid);
  end if;
  insert into public.work_sessions(user_id,name,status,product_id,product_size_id,cake_size_id,target_unit_count,scheduled_date,notes)
    values(auth.uid(),'POP UP · '||(o.popup_plan->>'title')||' · '||(i->>'label'),'PLANNED',
      nullif(i->>'product_id','')::uuid,profile_id,nullif(i->>'standard_id','')::uuid,(i->>'quantity')::numeric,o.event_date,
      '팝업 '||o.order_number||' / 품목 '||p_item_id::text) returning id into sid;
  update public.orders set popup_plan=jsonb_set(popup_plan,array['items',n::text,'work_session_id'],to_jsonb(sid::text)) where id=o.id and user_id=auth.uid();
  insert into public.order_production_sync_log(user_id,order_id,source,before_value,after_value)
    values(auth.uid(),o.id,'popup_item_session',i,jsonb_build_object('item_id',p_item_id,'session_id',sid));
  return jsonb_build_object('session_id',sid);
end; $$;
revoke all on function public.create_popup_item_session(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.create_popup_item_session(uuid,uuid,timestamptz) to authenticated;

-- Permit the same production editor for explicitly linked popup item sessions.
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
  if s.order_id is null then
    insert into public.order_production_sync_log(user_id,order_id,selection_id,source,before_value,after_value)
      values(uid,o.id,r.id,'popup_component_plan',to_jsonb(r),to_jsonb(updated));
  end if;
  -- Existing selection trigger records ordinary order changes.
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


-- Shared standard changes refresh every open production screen for the owner.
do $$ declare t text; begin
  foreach t in array array['cake_sizes','product_sizes'] loop
    if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
