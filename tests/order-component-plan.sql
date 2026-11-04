-- Run against a disposable DB, or after approval in ONE rollback-only production transaction.
begin;
select set_config('request.jwt.claim.sub',public.shco_owner_id()::text,true);
set local role authenticated;
do $$
declare
  u uuid:=auth.uid(); fa uuid; fb uuid; va uuid; va2 uuid; va3 uuid; vb uuid;
  o uuid; s uuid; w uuid; task uuid; iid uuid; ts timestamptz; result jsonb; msg text;
begin
  insert into public.formulas(user_id,name) values(u,'PLAN TEST A '||gen_random_uuid()) returning id into fa;
  insert into public.formulas(user_id,name) values(u,'PLAN TEST B '||gen_random_uuid()) returning id into fb;
  insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fa,1,'CURRENT') returning id into va;
  insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fa,2,'DRAFT') returning id into va2;
  insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fb,1,'DRAFT') returning id into vb;
  select id into iid from public.ingredients where user_id=u order by id limit 1;
  insert into public.formula_version_ingredients(user_id,formula_version_id,ingredient_id,amount,unit)
    values(u,va,iid,342.5,'g'),(u,va2,iid,400,'g'),(u,vb,iid,500,'g');
  insert into public.orders(user_id,order_number,status,flavoring_cream_formula_id)
    values(u,'PLAN-TEST-'||gen_random_uuid(),'INTAKE',fa) returning id into o;
  insert into public.work_sessions(user_id,order_id,name,status) values(u,o,'PLAN TEST','PLANNED') returning id into s;
  select id,updated_at into strict w,ts from public.work_session_formula_versions where work_session_id=s and slot='CREAM' and user_id=u;
  insert into public.work_session_tasks(user_id,work_session_id,formula_version_id,task_name,status,actual_started_at)
    values(u,s,va,'PRESERVE PLAN TASK','IN_PROGRESS','2026-11-04T00:00:00Z') returning id into task;
  result:=public.save_order_component_plan(w,ts,va,2,500,true);
  if (result->>'multiplier')::numeric<>2 or (result->>'target_quantity_g')::numeric<>500 then raise exception 'plan save failed'; end if;
  if not exists(select 1 from public.work_session_multiplier_history where work_session_formula_version_id=w and applied_multiplier=2) then raise exception 'missing multiplier history'; end if;
  -- Production updates batches on exactly the same row; demand must survive.
  update public.work_session_formula_versions set multiplier=4 where id=w and user_id=u;
  if not exists(select 1 from public.work_session_formula_versions where id=w and target_quantity_g=500 and multiplier=4) then raise exception 'production demand mismatch'; end if;
  -- Explicit per-order draft is pinned; publishing another CURRENT must not replace it.
  select updated_at into ts from public.work_session_formula_versions where id=w;
  perform public.save_order_component_plan(w,ts,va2,4,500,true);
  insert into public.formula_versions(user_id,formula_id,version_number,status) values(u,fa,3,'CURRENT') returning id into va3;
  if not exists(select 1 from public.work_session_formula_versions where id=w and formula_version_id=va2 and version_pinned and multiplier=4 and target_quantity_g=500) then raise exception 'pinned draft changed'; end if;
  if not exists(select 1 from public.work_session_tasks where id=task and actual_started_at='2026-11-04T00:00:00Z' and status='IN_PROGRESS') then raise exception 'task record lost'; end if;
  -- A newly assigned Formula flows back to the order without cloning or resetting quantity.
  select updated_at into ts from public.work_session_formula_versions where id=w;
  perform public.save_order_component_plan(w,ts,vb,4,600,true);
  if not exists(select 1 from public.orders where id=o and flavoring_cream_formula_id=fb) then raise exception 'reverse formula sync failed'; end if;
  -- Conflict, fractional manual change and negative demand must leave the plan intact.
  begin
    perform public.save_order_component_plan(w,'2000-01-01T00:00:00Z',vb,1,100,true);
    raise exception 'TEST_FAILED stale accepted';
  exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like '%다른 화면%' then raise exception 'Unexpected conflict result: %',msg; end if;
  end;
  select updated_at into ts from public.work_session_formula_versions where id=w;
  begin
    perform public.save_order_component_plan(w,ts,vb,1.5,100,true);
    raise exception 'TEST_FAILED fractional accepted';
  exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like '%정수%' then raise exception 'Unexpected multiplier result: %',msg; end if;
  end;
  begin
    perform public.save_order_component_plan(w,ts,vb,4,-1,true);
    raise exception 'TEST_FAILED negative demand accepted';
  exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like '%사용 목표%' then raise exception 'Unexpected demand result: %',msg; end if;
  end;
  if not exists(select 1 from public.work_session_formula_versions where id=w and multiplier=4 and target_quantity_g=600) then raise exception 'rejected save mutated plan'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
  begin
    perform public.save_order_component_plan(w,ts,vb,1,0,true);
    raise exception 'TEST_FAILED foreign owner accepted';
  exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like '%접근할 수%' then raise exception 'Unexpected owner result: %',msg; end if;
  end;
  perform set_config('request.jwt.claim.sub',u::text,true);
  update public.orders set status='COMPLETED' where id=o;
  begin
    perform public.save_order_component_plan(w,ts,vb,1,0,true);
    raise exception 'TEST_FAILED completed accepted';
  exception when others then
    get stacked diagnostics msg=message_text;
    if msg not like '%완료%' then raise exception 'Unexpected completed result: %',msg; end if;
  end;
  if not exists(select 1 from public.order_production_sync_log where selection_id=w and after_value->>'target_quantity_g'='600') then raise exception 'missing recovery log'; end if;
end $$;
select 'PASS Order/Production shared quantity, reverse Formula sync, pinned draft, retained tasks, conflict and validation' result;
rollback;
