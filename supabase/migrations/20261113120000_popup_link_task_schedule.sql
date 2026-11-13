-- 2026-11-13: 팝업의 점유 시간(시작 pickup_at ~ 종료 popup_plan.ends_at)을 WANN 오더 링크 태스크("SND-001")의
-- due_date / due_time / end_time 으로 같이 보낸다. 그래야 WANN Daily Focus 가로 타임라인에 팝업이 바(bar)로 뜬다.
-- 제목은 그대로 order_number 유지(프로젝트 이름과 중복이라 사용자 결정). WANN 쪽 sync_kora_popup 은
-- 이 세 키를 선택적으로 받도록 먼저 갱신돼 있다(supabase/wann-os/sync_kora_popup.sql).
-- 이미 운영 DB에 적용된 변경을 저장소에 기록한 파일이다(재실행해도 안전하게 작성).
create or replace function public.sync_popup_order_to_planner()
returns trigger language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint; task_ids uuid[]; first_sync boolean;
  popup_start timestamptz; popup_end timestamptz;
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

  -- 팝업 점유 시간: 시작 = pickup_at, 종료 = popup_plan.ends_at (없으면 null → WANN 쪽 기본 1시간 표시)
  popup_start:=new.pickup_at;
  popup_end:=nullif(new.popup_plan->>'ends_at','')::timestamptz;

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
        'end_date',(coalesce(popup_end,new.pickup_at) at time zone 'Australia/Sydney')::date::text,
        'product_line',new.product_line),
      'p_order_link_task',jsonb_build_object(
        'id',new.wann_order_link_task_id,'user_id','1f1dd73b-cfa9-47d3-855b-f1d58283885f',
        'title',new.order_number,'multiple_task_id',new.wann_project_id,
        'category_id','c8068046-5bb0-4043-acbb-60f862fcad52',
        'link_url','https://id-preview--e2009f44-8619-4e71-8a9f-20dc744ceeb9.lovable.app/orders/'||new.id::text,
        'due_date',(popup_start at time zone 'Australia/Sydney')::date::text,
        'due_time',to_char(popup_start at time zone 'Australia/Sydney','HH24:MI'),
        'end_time',to_char(popup_end at time zone 'Australia/Sydney','HH24:MI')),
      'p_production_task_ids',to_jsonb(task_ids)));
  return new;
end; $$;

drop trigger if exists b_sync_popup_order_to_planner on public.orders;
create trigger b_sync_popup_order_to_planner before insert or update on public.orders
  for each row execute function public.sync_popup_order_to_planner();
revoke all on function public.sync_popup_order_to_planner() from public, anon;
