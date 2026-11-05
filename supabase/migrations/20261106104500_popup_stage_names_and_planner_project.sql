-- 2026-11-06: 팝업 진행 단계 이름 + CONFIRMED(첫 단계)부터 WANN 프로젝트 자동 생성.
-- 이미 운영 DB에 적용된 변경을 저장소에 기록한 파일이다(재실행해도 안전하게 작성).
--
-- 단계 id는 그대로 두고 이름만 바꾼다: PLANNING→CONFIRMED, PREPARING→MENU PLANNING,
-- PRODUCTION→ORDER REVIEW, READY→PREP, LIVE→POP-UP, COMPLETED→COMPLETED.
update public.pilot_settings
set popup_workflow = '[{"id":"PLANNING","label":"CONFIRMED"},{"id":"PREPARING","label":"MENU PLANNING"},{"id":"PRODUCTION","label":"ORDER REVIEW"},{"id":"READY","label":"PREP"},{"id":"LIVE","label":"POP-UP"},{"id":"COMPLETED","label":"COMPLETED"}]'::jsonb
where popup_workflow = '[{"id":"PLANNING","label":"기획"},{"id":"PREPARING","label":"준비"},{"id":"PRODUCTION","label":"생산"},{"id":"READY","label":"준비 완료"},{"id":"LIVE","label":"판매 중"},{"id":"COMPLETED","label":"완료"}]'::jsonb;

-- 팝업이 CONFIRMED(첫 단계)가 되면 WANN 프로젝트("SND-001 — 제목")와 오더 링크 태스크를 만든다.
-- 이후 PREP/POP-UP 등으로 넘어가도 같은 프로젝트를 유지하고, 제목·날짜·품목 변경은 기존 프로젝트에 반영한다.
-- 팝업 생산 태스크는 sync_kora_popup(WANN 쪽, supabase/wann-os/sync_kora_popup.sql)이 프로젝트 아래로 옮긴다.
-- 케이크용 sync_confirmed_order_to_planner 는 팝업을 건너뛴다(팝업에는 Delivery 태스크가 없다).
create or replace function public.sync_popup_order_to_planner()
returns trigger language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint; task_ids uuid[]; first_sync boolean;
begin
  if new.order_kind<>'POPUP' then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception '팝업 소유권을 확인하세요';
  end if;
  -- This deployment is the existing single-user Pilot/Wann integration.
  if new.user_id <> '53e168e4-72aa-418e-812a-6caaf315a205'::uuid then return new; end if;
  if new.wann_project_id is null and new.status not in ('CONFIRMED','PRODUCTION') then return new; end if;
  if tg_op='UPDATE' and new.wann_project_id is not null
    and new.wann_order_link_task_id is not null
    and new.status is not distinct from old.status
    and new.order_number is not distinct from old.order_number
    and new.pickup_at is not distinct from old.pickup_at
    and new.product_line is not distinct from old.product_line
    and new.popup_plan is not distinct from old.popup_plan then return new; end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name='wann_os_secret_key';
  if secret is null then raise exception 'Wann Planner 연결 설정을 확인하세요'; end if;
  first_sync:=new.wann_project_id is null;
  new.wann_project_id:=coalesce(new.wann_project_id,gen_random_uuid());
  new.wann_order_link_task_id:=coalesce(new.wann_order_link_task_id,gen_random_uuid());

  select coalesce(array_agg(distinct task_id),'{}'::uuid[]) into task_ids from (
    select r.planner_task_id as task_id
      from jsonb_array_elements(new.popup_plan->'items') i
      join public.work_sessions s on s.id=nullif(i->>'work_session_id','')::uuid and s.user_id=new.user_id
      join public.work_session_formula_versions r on r.work_session_id=s.id
    union
    select b.planner_task_id
      from jsonb_array_elements(new.popup_plan->'items') i
      join public.work_sessions s on s.id=nullif(i->>'work_session_id','')::uuid and s.user_id=new.user_id
      join public.work_session_formula_versions r on r.work_session_id=s.id
      join public.work_blocks b on b.work_session_formula_version_id=r.id
  ) tasks where task_id is not null;

  request_id:=net.http_post(
    url:='https://txrxzsrjqwhvjosutotp.supabase.co/rest/v1/rpc/sync_kora_popup',
    headers:=jsonb_build_object('Content-Type','application/json','apikey',secret,'Authorization','Bearer '||secret),
    timeout_milliseconds:=10000,
    body:=jsonb_build_object(
      'p_project',jsonb_build_object(
        'id',new.wann_project_id,'user_id','1f1dd73b-cfa9-47d3-855b-f1d58283885f',
        'name',concat_ws(' — ',new.order_number,new.popup_plan->>'title'),
        'category_id','c8068046-5bb0-4043-acbb-60f862fcad52',
        'date',case when first_sync then (now() at time zone 'Australia/Sydney')::date::text else null end,
        'end_date',(coalesce(nullif(new.popup_plan->>'ends_at','')::timestamptz,new.pickup_at) at time zone 'Australia/Sydney')::date::text,
        'product_line',new.product_line),
      'p_order_link_task',jsonb_build_object(
        'id',new.wann_order_link_task_id,'user_id','1f1dd73b-cfa9-47d3-855b-f1d58283885f',
        'title',new.order_number,'multiple_task_id',new.wann_project_id,
        'category_id','c8068046-5bb0-4043-acbb-60f862fcad52',
        'link_url','https://id-preview--e2009f44-8619-4e71-8a9f-20dc744ceeb9.lovable.app/orders/'||new.id::text),
      'p_production_task_ids',to_jsonb(task_ids)));
  return new;
end; $$;

drop trigger if exists b_sync_popup_order_to_planner on public.orders;
create trigger b_sync_popup_order_to_planner before insert or update on public.orders
  for each row execute function public.sync_popup_order_to_planner();
revoke all on function public.sync_popup_order_to_planner() from public, anon;
