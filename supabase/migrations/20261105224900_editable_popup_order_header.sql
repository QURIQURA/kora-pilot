-- Keep the original RPC available for older clients.
create or replace function public.save_popup_order_details(
 p_order_id uuid,p_expected_updated_at timestamptz,p_plan jsonb,
 p_start timestamptz,p_status text,p_order_number text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; renamed public.orders%rowtype; number text:=btrim(p_order_number);
begin
 if number is null or length(number)=0 or length(number)>200 then
  raise exception '오더 번호를 1–200자로 입력하세요';
 end if;
 saved:=public.save_popup_order(p_order_id,p_expected_updated_at,p_plan,p_start,p_status);
 if saved->>'order_number' is distinct from number then
  if exists(select 1 from public.orders where user_id=auth.uid() and id<>p_order_id and lower(order_number)=lower(number)) then
   raise exception '이미 사용 중인 오더 번호입니다';
  end if;
  update public.orders set order_number=number where id=p_order_id and user_id=auth.uid() and order_kind='POPUP' returning * into renamed;
  if not found then raise exception '팝업에 접근할 수 없습니다'; end if;
  insert into public.order_production_sync_log(user_id,order_id,source,before_value,after_value)
   values(auth.uid(),p_order_id,'popup_order_number',saved,to_jsonb(renamed));
  saved:=to_jsonb(renamed);
 end if;
 return saved;
end; $$;
revoke all on function public.save_popup_order_details(uuid,timestamptz,jsonb,timestamptz,text,text) from public,anon;
grant execute on function public.save_popup_order_details(uuid,timestamptz,jsonb,timestamptz,text,text) to authenticated;
