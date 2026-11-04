-- Shared finished standards are the only selectable geometry.
-- Retain existing product profile IDs for prices, component targets and stock history.
-- No existing records are mapped, overwritten or deleted by this migration.
create or replace function public.ensure_product_standard_profile(
  p_product_id uuid, p_cake_size_id uuid, p_preferred_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  standard public.cake_sizes%rowtype;
  profile public.product_sizes%rowtype;
  matches integer;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  perform 1 from public.products where id=p_product_id and user_id=uid for update;
  if not found then raise exception '제품에 접근할 수 없습니다'; end if;
  select * into standard from public.cake_sizes where id=p_cake_size_id and user_id=uid;
  if not found then raise exception '공용 완성 규격에 접근할 수 없습니다'; end if;
  if p_preferred_id is not null then
    select * into profile from public.product_sizes where id=p_preferred_id and user_id=uid
      and product_id=p_product_id and cake_size_id=p_cake_size_id;
    if found then return profile.id; end if;
  end if;
  select count(*) into matches from public.product_sizes
    where user_id=uid and product_id=p_product_id and cake_size_id=p_cake_size_id;
  if matches>1 then raise exception '같은 공용 규격에 중복된 제품 가격·구성 기록이 있습니다'; end if;
  if matches=1 then
    select id into profile.id from public.product_sizes
      where user_id=uid and product_id=p_product_id and cake_size_id=p_cake_size_id;
    return profile.id;
  end if;
  -- An incomplete catalog entry can still be recorded on an order. No shape is guessed.
  if standard.shape is null or standard.shape not in ('ROUND','RECTANGLE','SQUARE') then return null; end if;
  insert into public.product_sizes(user_id,product_id,cake_size_id,shape,diameter_mm,length_mm,width_mm,height_mm)
    values(uid,p_product_id,p_cake_size_id,
      case when standard.shape='SQUARE' then 'RECTANGLE' else standard.shape end,
      standard.diameter_mm,standard.length_mm,standard.width_mm,standard.height_mm)
    returning * into profile;
  insert into public.order_production_sync_log(user_id,source,before_value,after_value)
    values(uid,'shared_standard_profile',null,to_jsonb(profile));
  return profile.id;
end;
$$;
revoke all on function public.ensure_product_standard_profile(uuid,uuid,uuid) from public,anon;
grant execute on function public.ensure_product_standard_profile(uuid,uuid,uuid) to authenticated;

create or replace function public.validate_shared_standard_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare standard public.cake_sizes%rowtype;
begin
  if new.user_id is distinct from auth.uid() then raise exception '제품 규격 소유권을 확인하세요'; end if;
  select * into standard from public.cake_sizes where id=new.cake_size_id and user_id=new.user_id;
  if not found then raise exception '치수는 공용 완성 규격에서만 지정할 수 있습니다'; end if;
  if not exists(select 1 from public.products where id=new.product_id and user_id=new.user_id) then
    raise exception '제품 소유권을 확인하세요';
  end if;
  if new.shape is distinct from (case when standard.shape='SQUARE' then 'RECTANGLE' else standard.shape end)
    or new.diameter_mm is distinct from standard.diameter_mm
    or new.length_mm is distinct from standard.length_mm
    or new.width_mm is distinct from standard.width_mm
    or new.height_mm is distinct from standard.height_mm then
    raise exception '제품 전용 치수는 사용할 수 없습니다. 공용 완성 규격을 선택하세요';
  end if;
  return new;
end;
$$;
create trigger shared_standard_profile_guard before insert or update of cake_size_id,product_id,user_id,shape,diameter_mm,length_mm,width_mm,height_mm
on public.product_sizes for each row execute function public.validate_shared_standard_profile();
revoke all on function public.validate_shared_standard_profile() from public,anon;
