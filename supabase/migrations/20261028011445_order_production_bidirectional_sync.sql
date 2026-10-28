-- Explicit order_id + user_id + CORE slot links only. No size/name-based mapping.
create table public.order_production_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid,
  selection_id uuid,
  source text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.order_production_sync_log enable row level security;
grant select, insert on public.order_production_sync_log to authenticated;
grant all on public.order_production_sync_log to service_role;
create policy own_sync_log_select on public.order_production_sync_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_sync_log_insert on public.order_production_sync_log for insert to authenticated
  with check ((select auth.uid()) = user_id);
create index order_production_sync_log_owner on public.order_production_sync_log(user_id,created_at);

create function public.pilot_sync_order_slot(p_order uuid,p_user uuid,p_slot text,p_formula uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  o public.orders%rowtype; s public.work_sessions%rowtype;
  r public.work_session_formula_versions%rowtype;
  chosen uuid; ids uuid[]; count_formulas integer; prev_guard text;
begin
  if auth.uid() is distinct from p_user and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Order access denied';
  end if;
  if p_slot not in ('SHEET','CREAM','FILLING') then raise exception 'Invalid CORE slot'; end if;
  select * into strict o from public.orders where id=p_order and user_id=p_user;
  if o.status in ('COMPLETED','CANCELLED') then return; end if;
  select * into s from public.work_sessions where order_id=p_order and user_id=p_user;
  if not found or s.status in ('COMPLETED','CANCELLED') then return; end if;
  if p_formula is null then
    if exists(select 1 from public.work_session_formula_versions where work_session_id=s.id and user_id=p_user and kind='CORE' and slot=p_slot) then
      raise exception '기존 작업을 보존하려면 Production에서 해당 % 선택을 개별 삭제해 주세요.',p_slot;
    end if;
    return;
  end if;
  perform 1 from public.formulas where id=p_formula and user_id=p_user;
  if not found then raise exception 'Formula access denied'; end if;
  if o.dietary_build_id is not null then
    select array_agg(distinct v.id) into ids from public.dietary_build_items b
      join public.formula_versions v on v.id=b.formula_version_id and v.user_id=p_user
      where b.build_id=o.dietary_build_id and b.user_id=p_user and v.formula_id=p_formula;
    if coalesce(cardinality(ids),0) <> 1 then raise exception '선택한 식이 Build에 이 Formula의 정확한 버전이 없습니다.'; end if;
    chosen := ids[1];
  else
    select array_agg(id) into ids from public.formula_versions where formula_id=p_formula and user_id=p_user and status='CURRENT';
    if cardinality(ids)>1 then raise exception 'CURRENT Formula 버전이 여러 개입니다.'; end if;
    chosen := ids[1];
    if chosen is null then
      select id into chosen from public.formula_versions where formula_id=p_formula and user_id=p_user
        and status not in ('SUPERSEDED','ARCHIVED') order by version_number desc limit 1;
    end if;
    if chosen is null then raise exception '사용할 수 있는 Formula 버전이 없습니다.'; end if;
  end if;
  select count(distinct v.formula_id) into count_formulas
    from public.work_session_formula_versions w join public.formula_versions v on v.id=w.formula_version_id and v.user_id=p_user
    where w.work_session_id=s.id and w.user_id=p_user and w.kind='CORE' and w.slot=p_slot;
  if count_formulas>1 then raise exception '이 % 슬롯에는 서로 다른 Formula가 여러 개입니다. Production에서 개별 선택을 수정해 주세요.',p_slot; end if;
  prev_guard := coalesce(current_setting('pilot.core_sync_source',true),'');
  perform set_config('pilot.core_sync_source','order',true);
  if not exists(select 1 from public.work_session_formula_versions where work_session_id=s.id and user_id=p_user and kind='CORE' and slot=p_slot) then
    insert into public.work_session_formula_versions(user_id,work_session_id,formula_version_id,kind,slot,multiplier,sort_order)
      select p_user,s.id,chosen,'CORE',p_slot,1,coalesce(max(sort_order),-1)+1
      from public.work_session_formula_versions where work_session_id=s.id and user_id=p_user;
  else
    for r in select * from public.work_session_formula_versions
      where work_session_id=s.id and user_id=p_user and kind='CORE' and slot=p_slot order by id
    loop
      if r.formula_version_id is distinct from chosen then
        update public.work_session_formula_versions set formula_version_id=chosen
          where id=r.id and user_id=p_user;
      end if;
    end loop;
  end if;
  perform set_config('pilot.core_sync_source',prev_guard,true);
end $$;

create function public.pilot_order_to_production() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare slots text[]:=array['SHEET','CREAM','FILLING']; fields text[]:=array['flavoring_sheet_formula_id','flavoring_cream_formula_id','flavoring_filling_formula_id']; i integer;
begin
  if coalesce(current_setting('pilot.core_sync_source',true),'')='selection' then return new; end if;
  for i in 1..3 loop
    if tg_op='INSERT' or (to_jsonb(old)->fields[i]) is distinct from (to_jsonb(new)->fields[i]) or old.dietary_build_id is distinct from new.dietary_build_id then
      perform public.pilot_sync_order_slot(new.id,new.user_id,slots[i],(to_jsonb(new)->>fields[i])::uuid);
    end if;
  end loop;
  return new;
end $$;
create trigger pilot_order_core_sync after insert or update of flavoring_sheet_formula_id,flavoring_cream_formula_id,flavoring_filling_formula_id,dietary_build_id
  on public.orders for each row execute function public.pilot_order_to_production();

create function public.pilot_seed_session_formulas() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype;
begin
  if new.order_id is null then return new; end if;
  select * into o from public.orders where id=new.order_id and user_id=new.user_id;
  if not found then raise exception 'Order/session owner mismatch'; end if;
  perform public.pilot_sync_order_slot(o.id,o.user_id,'SHEET',o.flavoring_sheet_formula_id);
  perform public.pilot_sync_order_slot(o.id,o.user_id,'CREAM',o.flavoring_cream_formula_id);
  perform public.pilot_sync_order_slot(o.id,o.user_id,'FILLING',o.flavoring_filling_formula_id);
  return new;
end $$;
create trigger pilot_seed_session_formulas after insert on public.work_sessions for each row execute function public.pilot_seed_session_formulas();

create function public.pilot_selection_to_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare w public.work_session_formula_versions%rowtype; s public.work_sessions%rowtype;
  ids uuid[]; formula_id uuid; field_name text; old_field uuid; prev_guard text;
begin
  if tg_op='DELETE' then w:=old; else w:=new; end if;
  select * into s from public.work_sessions where id=w.work_session_id and user_id=w.user_id;
  if not found then return null; end if;
  if tg_op<>'DELETE' and not exists(select 1 from public.formula_versions where id=w.formula_version_id and user_id=w.user_id) then raise exception 'Formula owner mismatch'; end if;
  insert into public.order_production_sync_log(user_id,order_id,selection_id,source,before_value,after_value)
    values(w.user_id,s.order_id,w.id,coalesce(nullif(current_setting('pilot.core_sync_source',true),''),'selection'),
      case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
  -- Keep task IDs, timings, outputs and block links. Rebind only tasks attributable to this selection.
  if tg_op='UPDATE' and old.formula_version_id is distinct from new.formula_version_id then
    update public.work_session_tasks t set formula_version_id=new.formula_version_id
      where t.user_id=w.user_id and t.work_session_id=w.work_session_id and t.formula_version_id=old.formula_version_id
      and (exists(select 1 from public.work_blocks b where b.work_session_formula_version_id=w.id and b.user_id=w.user_id and b.work_session_task_id=t.id)
        or not exists(select 1 from public.work_session_formula_versions sibling where sibling.work_session_id=w.work_session_id and sibling.user_id=w.user_id and sibling.id<>w.id and sibling.formula_version_id=old.formula_version_id));
  end if;
  if coalesce(current_setting('pilot.core_sync_source',true),'')='order' or s.order_id is null
    or s.status in ('COMPLETED','CANCELLED') or w.kind<>'CORE' or w.slot is null then return null; end if;
  if exists(select 1 from public.orders where id=s.order_id and user_id=w.user_id and status in('COMPLETED','CANCELLED')) then return null; end if;
  select array_agg(distinct v.formula_id) into ids from public.work_session_formula_versions x
    join public.formula_versions v on v.id=x.formula_version_id and v.user_id=w.user_id
    where x.work_session_id=s.id and x.user_id=w.user_id and x.kind='CORE' and x.slot=w.slot;
  -- A single order dropdown cannot represent multiple different formulas. The UI shows the full selection list.
  formula_id:=case when cardinality(ids)=1 then ids[1] else null end;
  field_name:=case w.slot when 'SHEET' then 'flavoring_sheet_formula_id' when 'CREAM' then 'flavoring_cream_formula_id' when 'FILLING' then 'flavoring_filling_formula_id' end;
  execute format('select %I from public.orders where id=$1 and user_id=$2',field_name) into old_field using s.order_id,w.user_id;
  if old_field is distinct from formula_id then
    prev_guard:=coalesce(current_setting('pilot.core_sync_source',true),'');
    perform set_config('pilot.core_sync_source','selection',true);
    execute format('update public.orders set %I=$1 where id=$2 and user_id=$3',field_name) using formula_id,s.order_id,w.user_id;
    perform set_config('pilot.core_sync_source',prev_guard,true);
  end if;
  return null;
end $$;
create trigger pilot_selection_core_sync after insert or update or delete on public.work_session_formula_versions
  for each row execute function public.pilot_selection_to_order();

-- Promotion refreshes active CORE selections of this exact formula, unless pinned by a dietary build.
create function public.pilot_current_version_to_production() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r record;
begin
  if new.status<>'CURRENT' then return new; end if;
  if tg_op='UPDATE' and old.status='CURRENT' then return new; end if;
  for r in select w.id from public.work_session_formula_versions w
    join public.formula_versions v on v.id=w.formula_version_id and v.user_id=new.user_id
    join public.work_sessions s on s.id=w.work_session_id and s.user_id=new.user_id
    join public.orders o on o.id=s.order_id and o.user_id=new.user_id
    where w.user_id=new.user_id and w.kind='CORE' and v.formula_id=new.formula_id and w.formula_version_id<>new.id
      and s.status not in('COMPLETED','CANCELLED') and o.status not in('COMPLETED','CANCELLED')
      and o.dietary_build_id is null
  loop
    update public.work_session_formula_versions set formula_version_id=new.id
      where id=r.id and user_id=new.user_id;
  end loop;
  return new;
end $$;
create trigger pilot_current_version_sync after insert or update of status on public.formula_versions
  for each row execute function public.pilot_current_version_to_production();

revoke all on function public.pilot_sync_order_slot(uuid,uuid,text,uuid),public.pilot_order_to_production(),public.pilot_seed_session_formulas(),public.pilot_selection_to_order(),public.pilot_current_version_to_production() from public,anon;
grant execute on function public.pilot_sync_order_slot(uuid,uuid,text,uuid) to authenticated,service_role;
-- Only triggers execute trigger functions; no RPC grants needed.

do $$ declare t text; begin
  foreach t in array array['orders','work_sessions','work_session_formula_versions','formula_versions','formula_version_ingredients','work_session_tasks','work_blocks','order_production_sync_log'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
