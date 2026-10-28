-- Run after the migration in ONE transaction, always followed by ROLLBACK.
select set_config('request.jwt.claims',jsonb_build_object('sub',public.shco_owner_id(),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare
 u uuid:=auth.uid(); fa uuid; fb uuid; va uuid; vb uuid; vb2 uuid;
 o uuid; s uuid; w uuid; task uuid; iid uuid; n numeric; found_id uuid; original_count integer;
begin
 insert into public.formulas(user_id,name) values(u,'SYNC TEST A '||gen_random_uuid()) returning id into fa;
 insert into public.formulas(user_id,name) values(u,'SYNC TEST B '||gen_random_uuid()) returning id into fb;
 insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fa,1,'CURRENT') returning id into va;
 insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fb,1,'CURRENT') returning id into vb;
 select id into iid from public.ingredients where user_id=u order by id limit 1;
 insert into public.formula_version_ingredients(user_id,formula_version_id,ingredient_id,amount,unit) values(u,va,iid,100,'g'),(u,vb,iid,200,'g');
 insert into public.orders(user_id,order_number,status,flavoring_cream_formula_id) values(u,'SYNC-TEST-'||gen_random_uuid(),'INTAKE',fa) returning id into o;
 insert into public.work_sessions(user_id,order_id,name,status) values(u,o,'SYNC TEST','PLANNED') returning id into s;
 select id into strict w from public.work_session_formula_versions where work_session_id=s and slot='CREAM' and user_id=u;
 if not exists(select 1 from public.work_session_formula_versions where id=w and formula_version_id=va) then raise exception 'session seed failed'; end if;
 insert into public.work_session_tasks(user_id,work_session_id,formula_version_id,task_name,status,actual_started_at) values(u,s,va,'PRESERVE TASK','IN_PROGRESS','2026-10-28T00:00:00Z') returning id into task;
 update public.work_session_formula_versions set multiplier=4 where id=w and user_id=u;
 update public.orders set flavoring_cream_formula_id=fb where id=o and user_id=u;
 select multiplier,formula_version_id into n,found_id from public.work_session_formula_versions where id=w;
 if n<>4 or found_id<>vb then raise exception 'order -> production failed'; end if;
 if not exists(select 1 from public.work_session_tasks where id=task and formula_version_id=vb and status='IN_PROGRESS' and actual_started_at='2026-10-28T00:00:00Z') then raise exception 'task history was lost'; end if;
 update public.work_session_formula_versions set formula_version_id=va where id=w and user_id=u;
 if not exists(select 1 from public.orders where id=o and flavoring_cream_formula_id=fa) then raise exception 'production -> order failed'; end if;
 update public.work_session_formula_versions set formula_version_id=vb,multiplier=4 where id=w and user_id=u;
 insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fb,2,'DRAFT') returning id into vb2;
 insert into public.formula_version_ingredients(user_id,formula_version_id,ingredient_id,amount,unit) values(u,vb2,iid,400,'g');
 update public.formula_versions set status='CURRENT' where id=vb2 and user_id=u;
 if not exists(select 1 from public.work_session_formula_versions where id=w and formula_version_id=vb2 and multiplier=4) then raise exception 'CURRENT promotion multiplier preservation failed'; end if;
 -- Multiple formulas must remain separate and must not be chosen arbitrarily.
 insert into public.work_session_formula_versions(user_id,work_session_id,formula_version_id,kind,slot,multiplier) values(u,s,va,'CORE','CREAM',1);
 if (select flavoring_cream_formula_id from public.orders where id=o) is not null then raise exception 'ambiguous slot chose a formula'; end if;
 begin
   update public.orders set flavoring_cream_formula_id=fb where id=o;
   raise exception 'ambiguous update should fail';
 exception when raise_exception then
   if sqlerrm='ambiguous update should fail' then raise; end if;
 end;
 if (select count(*) from public.work_session_formula_versions where work_session_id=s)<>2 then raise exception 'duplicate selections lost'; end if;
 -- Finished work remains pinned.
 update public.orders set status='COMPLETED' where id=o;
 update public.orders set flavoring_cream_formula_id=fa where id=o;
 if not exists(select 1 from public.work_session_formula_versions where id=w and formula_version_id=vb2) then raise exception 'completed history changed'; end if;
 if not exists(select 1 from public.order_production_sync_log where selection_id=w and user_id=u) then raise exception 'missing recovery log'; end if;
 begin
   perform public.pilot_sync_order_slot(o,'00000000-0000-0000-0000-000000000001','CREAM',fa);
   raise exception 'foreign owner should fail';
 exception when raise_exception then
   if sqlerrm='foreign owner should fail' then raise; end if;
 end;
 raise notice 'PASS: session seed, Order -> Production, Production -> Order, CURRENT promotion, simple recipe multiples, task history, duplicate ambiguity, completed history and audit log';
end $$;
select 'PASS order/production SQL integration' as result;
