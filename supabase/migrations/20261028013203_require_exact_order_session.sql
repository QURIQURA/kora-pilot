-- Require one exact linked session; never pick an arbitrary row.
create or replace function public.pilot_sync_order_slot(p_order uuid,p_user uuid,p_slot text,p_formula uuid)
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
  begin
    select * into strict s from public.work_sessions where order_id=p_order and user_id=p_user;
  exception when no_data_found then return;
    when too_many_rows then raise exception '이 주문에 여러 Work Session이 연결되어 있습니다. 세션을 먼저 확인해 주세요.';
  end;
  if s.status in ('COMPLETED','CANCELLED') then return; end if;
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

