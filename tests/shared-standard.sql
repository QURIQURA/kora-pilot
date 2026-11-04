select set_config('request.jwt.claim.sub', (select user_id::text from public.products limit 1), true);
set local role authenticated;
do $$
declare
  pid uuid;
  sid uuid;
  first_id uuid;
  second_id uuid;
  old_data jsonb;
  initial_count integer;
  failed boolean;
begin
  select id into strict pid from public.products where user_id=auth.uid() limit 1;
  select id into strict sid from public.cake_sizes where user_id=auth.uid() and shape in ('ROUND','SQUARE','RECTANGLE') limit 1;
  select jsonb_agg(to_jsonb(s) order by s.id) into old_data from public.product_sizes s where user_id=auth.uid();
  select count(*) into initial_count from public.product_sizes where product_id=pid and cake_size_id=sid;
  first_id:=public.ensure_product_standard_profile(pid,sid);
  second_id:=public.ensure_product_standard_profile(pid,sid);
  if first_id is distinct from second_id or first_id is null then raise exception 'profile resolution not stable'; end if;
  if (select count(*) from public.product_sizes where product_id=pid and cake_size_id=sid)<>greatest(1,initial_count) then raise exception 'duplicate profile'; end if;
  if exists(select 1 from jsonb_array_elements(old_data) old_row join public.product_sizes s on s.id=(old_row->>'id')::uuid where old_row<>to_jsonb(s)) then raise exception 'historical data mutated'; end if;
  failed:=false;
  begin perform public.ensure_product_standard_profile(gen_random_uuid(),sid); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'inaccessible product accepted'; end if;
  failed:=false;
  begin perform public.ensure_product_standard_profile(pid,gen_random_uuid()); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'inaccessible standard accepted'; end if;
  failed:=false;
  begin insert into public.product_sizes(user_id,product_id,shape) values(auth.uid(),pid,'ROUND'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'standalone product geometry accepted'; end if;
  failed:=false;
  begin update public.product_sizes set height_mm=123456 where id=first_id; exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'private geometry edit accepted'; end if;
end $$;
select 'PASS: canonical selection, stable internal links, immutable legacy records, ownership and no private geometry' as result;
