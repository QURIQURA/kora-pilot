create or replace function public.assign_snl_number()
returns trigger language plpgsql security invoker set search_path='' as $$
declare next_no integer; existing_no integer;
begin
  if new.order_kind<>'POPUP' then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception '팝업 소유권을 확인하세요'; end if;
  insert into public.pilot_settings(user_id) values(new.user_id) on conflict(user_id) do nothing;
  select popup_next_number into next_no from public.pilot_settings where user_id=new.user_id for update;
  select coalesce(max(substring(order_number from '^SN[LD]-([0-9]+)$')::integer),0)+1 into existing_no
    from public.orders where user_id=new.user_id and order_kind='POPUP' and order_number ~ '^SN[LD]-[0-9]+$';
  next_no:=greatest(next_no,existing_no);
  new.order_number:='SND-'||lpad(next_no::text,greatest(3,length(next_no::text)),'0');
  update public.pilot_settings set popup_next_number=next_no+1 where user_id=new.user_id;
  if new.popup_plan->>'title'='토요일 팝업' then new.popup_plan:=jsonb_set(new.popup_plan,'{title}','"Saturday Night Live"'::jsonb); end if;
  return new;
end; $$;

revoke all on function public.assign_snl_number() from public,anon;
