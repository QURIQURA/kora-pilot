-- WANN OS 프로젝트(txrxzsrjqwhvjosutotp)에 적용된 함수 — KORA의 sync_popup_order_to_planner 트리거가 호출한다.
-- (KORA 마이그레이션이 아니라 WANN 쪽 DB에서 실행하는 SQL의 기록용 사본)
create or replace function public.sync_kora_popup(p_project jsonb, p_order_link_task jsonb, p_production_task_ids uuid[] default '{}'::uuid[])
returns void language plpgsql set search_path='' as $$
declare uid uuid := (p_project->>'user_id')::uuid; pid uuid := (p_project->>'id')::uuid;
begin
  if uid is null or uid is distinct from (p_order_link_task->>'user_id')::uuid
    or pid is distinct from (p_order_link_task->>'multiple_task_id')::uuid then
    raise exception 'Popup project ownership mismatch';
  end if;
  if exists(select 1 from public.planner_multiple_tasks where id=pid and user_id<>uid)
    or exists(select 1 from public.planner_tasks where id=(p_order_link_task->>'id')::uuid and user_id<>uid) then
    raise exception 'Popup project ownership mismatch';
  end if;
  insert into public.planner_multiple_tasks(id,user_id,name,category_id,date,end_date,product_line)
    values(pid,uid,p_project->>'name',(p_project->>'category_id')::uuid,
      nullif(p_project->>'date','')::date,nullif(p_project->>'end_date','')::date,p_project->>'product_line')
    on conflict(id) do update set name=excluded.name,end_date=excluded.end_date,
      product_line=excluded.product_line,updated_at=now();
  insert into public.planner_tasks(id,user_id,title,multiple_task_id,category_id,link_url)
    values((p_order_link_task->>'id')::uuid,uid,p_order_link_task->>'title',pid,
      (p_order_link_task->>'category_id')::uuid,p_order_link_task->>'link_url')
    on conflict(id) do update set title=excluded.title,link_url=excluded.link_url,updated_at=now();
  -- Move already-synced popup production tasks without changing checks or schedules.
  update public.planner_tasks set multiple_task_id=pid,updated_at=now()
    where id=any(p_production_task_ids) and user_id=uid
      and subtag_id='ce89b071-61c5-4378-8403-99b93990598f';
end; $$;
