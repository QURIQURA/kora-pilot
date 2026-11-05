alter table public.pilot_settings add column popup_workflow jsonb not null default '[{"id":"PLANNING","label":"기획"},{"id":"PREPARING","label":"준비"},{"id":"PRODUCTION","label":"생산"},{"id":"READY","label":"준비 완료"},{"id":"LIVE","label":"판매 중"},{"id":"COMPLETED","label":"완료"}]'::jsonb;
alter table public.pilot_settings add column popup_next_number integer not null default 1 check(popup_next_number>0);

create or replace function public.validate_popup_workflow()
returns trigger language plpgsql security invoker set search_path='' as $$
declare stage jsonb; n integer;
begin
  if new.user_id is distinct from auth.uid() then raise exception '팝업 설정 소유권을 확인하세요'; end if;
  if jsonb_typeof(new.popup_workflow) is distinct from 'array' then raise exception '진행 단계 목록을 확인하세요'; end if;
  n:=jsonb_array_length(new.popup_workflow);
  if n not between 2 and 30 or new.popup_workflow->(n-1)->>'id' is distinct from 'COMPLETED' then raise exception '완료 단계를 마지막에 유지하고 2–30개의 단계를 입력하세요'; end if;
  if (select count(distinct v->>'id') from jsonb_array_elements(new.popup_workflow) v)<>n
    or (select count(distinct lower(trim(v->>'label'))) from jsonb_array_elements(new.popup_workflow) v)<>n then raise exception '같은 이름의 진행 단계가 있습니다'; end if;
  for stage in select value from jsonb_array_elements(new.popup_workflow) loop
    if jsonb_typeof(stage->'id') is distinct from 'string' or (stage->>'id') !~ '^[A-Za-z0-9_-]{1,80}$'
      or jsonb_typeof(stage->'label') is distinct from 'string' or length(trim(stage->>'label')) not between 1 and 80 then raise exception '단계 이름은 1–80자로 입력하세요'; end if;
  end loop;
  if tg_op='UPDATE' and exists(select 1 from public.orders o where o.user_id=new.user_id and o.order_kind='POPUP' and nullif(o.popup_plan->>'stage_id','') is not null
    and not exists(select 1 from jsonb_array_elements(new.popup_workflow) stage_row where stage_row->>'id'=o.popup_plan->>'stage_id')) then
    raise exception '사용 중인 단계는 팝업을 다른 단계로 옮긴 뒤 삭제하세요';
  end if;
  if tg_op='UPDATE' and old.popup_workflow is distinct from new.popup_workflow then
    insert into public.order_production_sync_log(user_id,source,before_value,after_value)
      values(new.user_id,'popup_workflow',old.popup_workflow,new.popup_workflow);
  end if;
  return new;
end; $$;
create trigger validate_popup_workflow before insert or update of popup_workflow,user_id on public.pilot_settings for each row execute function public.validate_popup_workflow();
revoke all on function public.validate_popup_workflow() from public,anon;


create or replace function public.assign_snl_number()
returns trigger language plpgsql security invoker set search_path='' as $$
declare next_no integer; existing_no integer;
begin
  if new.order_kind<>'POPUP' then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception '팝업 소유권을 확인하세요'; end if;
  insert into public.pilot_settings(user_id) values(new.user_id) on conflict(user_id) do nothing;
  select popup_next_number into next_no from public.pilot_settings where user_id=new.user_id for update;
  select coalesce(max(substring(order_number from '^SNL-([0-9]+)$')::integer),0)+1 into existing_no
    from public.orders where user_id=new.user_id and order_kind='POPUP' and order_number ~ '^SNL-[0-9]+$';
  next_no:=greatest(next_no,existing_no);
  new.order_number:='SNL-'||lpad(next_no::text,greatest(3,length(next_no::text)),'0');
  update public.pilot_settings set popup_next_number=next_no+1 where user_id=new.user_id;
  if new.popup_plan->>'title'='토요일 팝업' then new.popup_plan:=jsonb_set(new.popup_plan,'{title}','"Saturday Night Live"'::jsonb); end if;
  return new;
end; $$;
-- Runs before the cake numbering trigger, which skips an already assigned number.
create trigger assign_snl_number before insert on public.orders for each row execute function public.assign_snl_number();
revoke all on function public.assign_snl_number() from public,anon;


create or replace function public.save_popup_stage(p_order_id uuid,p_stage_id text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_order public.orders%rowtype; saved public.orders%rowtype;
begin
  select * into old_order from public.orders where id=p_order_id and user_id=auth.uid() and order_kind='POPUP' for update;
  if not found then raise exception '팝업에 접근할 수 없습니다'; end if;
  if p_expected_updated_at is null or old_order.updated_at<>p_expected_updated_at then raise exception '다른 화면에서 변경됐습니다. 최신 값을 불러오세요'; end if;
  update public.orders set popup_plan=jsonb_set(popup_plan,'{stage_id}',to_jsonb(p_stage_id)) where id=p_order_id and user_id=auth.uid() returning * into saved;
  insert into public.order_production_sync_log(user_id,order_id,source,before_value,after_value)
    values(auth.uid(),p_order_id,'popup_stage',to_jsonb(old_order),to_jsonb(saved));
  return to_jsonb(saved);
end; $$;
revoke all on function public.save_popup_stage(uuid,text,timestamptz) from public,anon;
grant execute on function public.save_popup_stage(uuid,text,timestamptz) to authenticated;


create or replace function public.normalize_snl_stage()
returns trigger language plpgsql security invoker set search_path='' as $$
declare stages jsonb; stage_id text;
begin
  if new.order_kind<>'POPUP' then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception '팝업 소유권을 확인하세요'; end if;
  insert into public.pilot_settings(user_id) values(new.user_id) on conflict(user_id) do nothing;
  select popup_workflow into stages from public.pilot_settings where user_id=new.user_id for update;
  stage_id:=nullif(new.popup_plan->>'stage_id','');
  if stage_id is null and tg_op='UPDATE' then stage_id:=nullif(old.popup_plan->>'stage_id',''); end if;
  stage_id:=coalesce(stage_id,case when new.status='COMPLETED' then 'COMPLETED' else stages->0->>'id' end);
  if not exists(select 1 from jsonb_array_elements(stages) stage_row where stage_row->>'id'=stage_id) then raise exception '사용 가능한 팝업 진행 단계를 선택하세요'; end if;
  new.popup_plan:=jsonb_set(new.popup_plan,'{stage_id}',to_jsonb(stage_id));
  new.status:=case when stage_id='COMPLETED' then 'COMPLETED' when stage_id=stages->0->>'id' then 'INTAKE' else 'PRODUCTION' end;
  return new;
end; $$;
create trigger a_normalize_snl_stage before insert or update of order_kind,popup_plan,status,user_id on public.orders for each row execute function public.normalize_snl_stage();
revoke all on function public.normalize_snl_stage() from public,anon;
