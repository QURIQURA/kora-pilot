-- Component blends: freeze source recipes and flatten their raw ingredients.
-- Existing recipes are never mapped or modified automatically.
alter table public.formula_versions
  add column if not exists component_sources jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.formula_versions'::regclass and conname='component_sources_array') then
    alter table public.formula_versions add constraint component_sources_array
      check (jsonb_typeof(component_sources) = 'array');
  end if;
end $$;

create or replace function public.create_component_blend(
  p_name text, p_sources jsonb, p_technique_category_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  fid uuid;
  vid uuid;
  src jsonb;
  source_record record;
  weight numeric;
  base numeric;
  snapshots jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception '이름을 입력하세요'; end if;
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception '컴포넌트를 선택하세요';
  end if;
  if jsonb_array_length(p_sources) < 2 or jsonb_array_length(p_sources) > 20 then
    raise exception '컴포넌트를 2–20개 선택하세요';
  end if;
  -- Serialize same-owner names, including concurrent requests to this RPC.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || lower(trim(p_name)), 0));
  if exists(select 1 from public.components where user_id=uid and lower(trim(name))=lower(trim(p_name)))
    or exists(select 1 from public.formulas where user_id=uid and lower(trim(name))=lower(trim(p_name))) then
    raise exception '같은 이름의 Component 또는 Formula가 있습니다';
  end if;
  if p_technique_category_id is not null and not exists(
    select 1 from public.technique_categories where id=p_technique_category_id and user_id=uid
  ) then raise exception '분류에 접근할 수 없습니다'; end if;
  if (select count(distinct s->>'version_id') from jsonb_array_elements(p_sources) s)
      <> jsonb_array_length(p_sources) then raise exception '같은 버전을 중복 선택할 수 없습니다'; end if;

  for src in select value from jsonb_array_elements(p_sources) loop
    weight := (src->>'amount_g')::numeric;
    if weight is null or weight <= 0 or weight::text in ('NaN','Infinity','-Infinity') then
      raise exception '사용량은 0보다 큰 g 값이어야 합니다';
    end if;
    select v.id, v.version_number, v.status, f.id formula_id, f.name formula_name,
      c.id component_id, c.name component_name, v.notes
    into source_record
    from public.formula_versions v
    join public.formulas f on f.id=v.formula_id and f.user_id=uid
    join public.components c on c.id=f.component_id and c.user_id=uid
    where v.id=(src->>'version_id')::uuid and v.user_id=uid
      and v.status not in ('ARCHIVED','SUPERSEDED');
    if not found then raise exception '사용 가능한 원본 버전을 찾을 수 없습니다'; end if;
    if exists(select 1 from public.formula_version_ingredients i
      where i.formula_version_id=source_record.id and
      (i.user_id<>uid or i.unit not in ('g','kg') or i.amount<0
       or i.amount::text in ('NaN','Infinity','-Infinity')
       or not exists(select 1 from public.ingredients r where r.id=i.ingredient_id and r.user_id=uid))) then
      raise exception '원본 재료를 모두 g/kg으로 계량하고 소유권을 확인하세요';
    end if;
    select sum(amount * case when unit='kg' then 1000 else 1 end) into base
      from public.formula_version_ingredients where formula_version_id=source_record.id and user_id=uid;
    if base is null or base<=0 then raise exception '원본에 중량 배합이 없습니다'; end if;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object(
      'component_id',source_record.component_id,'component_name',source_record.component_name,
      'formula_id',source_record.formula_id,'formula_name',source_record.formula_name,
      'version_id',source_record.id,'version_number',source_record.version_number,
      'amount_g',weight,'base_weight_g',base,'notes',source_record.notes,
      'ingredients',(select jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,
        'amount_g',amount * case when unit='kg' then 1000 else 1 end,
        'note',note) order by sort_order,id)
        from public.formula_version_ingredients where formula_version_id=source_record.id and user_id=uid)
    ));
  end loop;

  insert into public.components(user_id,name,technique_category_id,scaling_mode,description)
    values(uid,trim(p_name),p_technique_category_id,'BASE_WEIGHT','컴포넌트 조합 — 원본 배합을 보존한 스냅샷') returning id into cid;
  insert into public.formulas(user_id,name,component_id,technique_category_id)
    values(uid,trim(p_name),cid,p_technique_category_id) returning id into fid;
  insert into public.formula_versions(user_id,formula_id,status,component_sources,notes,change_summary)
    values(uid,fid,'DRAFT',snapshots,'각 원본을 따로 제조한 뒤 지정 g만큼 혼합. 생성 당시 원재료 중량 기준이며 제조 손실은 반영하지 않음. 원본 수정은 자동 반영되지 않음.',
      '컴포넌트 조합으로 자동 생성') returning id into vid;
  insert into public.formula_version_ingredients(user_id,formula_version_id,ingredient_id,amount,unit,sort_order,note)
    select uid,vid,(i->>'ingredient_id')::uuid,
      sum((i->>'amount_g')::numeric * (s->>'amount_g')::numeric / (s->>'base_weight_g')::numeric),
      'g',row_number() over(order by i->>'ingredient_id')::integer-1,
      string_agg(distinct s->>'component_name',' + ')
    from jsonb_array_elements(snapshots) s
    cross join lateral jsonb_array_elements(s->'ingredients') i
    group by i->>'ingredient_id';
  return jsonb_build_object('component_id',cid,'formula_id',fid,'version_id',vid);
end;
$$;
revoke all on function public.create_component_blend(text,jsonb,uuid) from public,anon;
grant execute on function public.create_component_blend(text,jsonb,uuid) to authenticated;
