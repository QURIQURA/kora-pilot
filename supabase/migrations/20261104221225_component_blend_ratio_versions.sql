-- A ratio revision is atomic: old versions and their source snapshots stay unchanged.
create or replace function public.revise_component_blend(
  p_version_id uuid, p_expected_updated_at timestamptz, p_percentages jsonb,
  p_reason text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  old_version public.formula_versions%rowtype;
  fid uuid;
  vid uuid;
  next_number integer;
  src jsonb;
  ing jsonb;
  pct numeric;
  pct_sum numeric := 0;
  total_g numeric := 0;
  base_g numeric;
  actual_base numeric;
  source_g numeric;
  changed boolean := false;
  snapshots jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  select formula_id into fid from public.formula_versions where id=p_version_id and user_id=uid;
  if not found then raise exception '버전에 접근할 수 없습니다'; end if;
  -- Serializes numbering for concurrent revisions of the same formula.
  perform 1 from public.formulas where id=fid and user_id=uid for update;
  if not found then raise exception 'Formula에 접근할 수 없습니다'; end if;
  select * into old_version from public.formula_versions where id=p_version_id and user_id=uid for update;
  if not found then raise exception '버전에 접근할 수 없습니다'; end if;
  if p_expected_updated_at is null or old_version.updated_at <> p_expected_updated_at then
    raise exception '버전이 변경되었습니다. 새로고침 후 다시 조정하세요';
  end if;
  if jsonb_array_length(old_version.component_sources) < 2
    or jsonb_array_length(old_version.component_sources) > 20 then
    raise exception '조합된 컴포넌트 버전만 비율을 변경할 수 있습니다';
  end if;
  if p_percentages is null or jsonb_typeof(p_percentages) <> 'array' then
    raise exception '비율을 배열로 전달하세요';
  end if;
  if jsonb_array_length(p_percentages) <> jsonb_array_length(old_version.component_sources) then
    raise exception '모든 컴포넌트의 비율을 입력하세요';
  end if;
  for ing in select value from jsonb_array_elements(p_percentages) loop
    if jsonb_typeof(ing) <> 'number' then raise exception '비율은 숫자여야 합니다'; end if;
    pct := ing::text::numeric;
    if pct < 0 or pct > 100 or pct::text in ('NaN','Infinity','-Infinity') then
      raise exception '비율은 0–100%%여야 합니다';
    end if;
    pct_sum := pct_sum+pct;
  end loop;
  if abs(pct_sum-100) > 0.000001 then raise exception '비율 합계는 100%%여야 합니다'; end if;
  for src in select value from jsonb_array_elements(old_version.component_sources) loop
    source_g := (src->>'amount_g')::numeric;
    base_g := (src->>'base_weight_g')::numeric;
    if source_g is null or source_g < 0 or source_g::text in ('NaN','Infinity','-Infinity')
      or base_g is null or base_g <= 0 or base_g::text in ('NaN','Infinity','-Infinity')
      or jsonb_typeof(src->'ingredients') is distinct from 'array' then
      raise exception '저장 당시 원본 배합이 올바르지 않습니다';
    end if;
    actual_base := 0;
    for ing in select value from jsonb_array_elements(src->'ingredients') loop
      if (ing->>'amount_g') is null or (ing->>'amount_g')::numeric < 0
        or (ing->>'amount_g')::numeric::text in ('NaN','Infinity','-Infinity')
        or not exists(select 1 from public.ingredients where id=(ing->>'ingredient_id')::uuid and user_id=uid) then
        raise exception '원본 재료 중량 또는 소유권을 확인하세요';
      end if;
      actual_base := actual_base + (ing->>'amount_g')::numeric;
    end loop;
    if abs(actual_base-base_g) > greatest(0.000001,base_g*0.00000001) then
      raise exception '저장 당시 원본 재료 합계가 기준 중량과 다릅니다';
    end if;
    total_g := total_g+source_g;
  end loop;
  if total_g <= 0 then raise exception '총중량이 0입니다'; end if;
  for src, pct in
    select s.value, (p_percentages->>(s.ordinality::integer-1))::numeric
    from jsonb_array_elements(old_version.component_sources) with ordinality s
  loop
    source_g := total_g*pct/pct_sum;
    if abs(source_g-(src->>'amount_g')::numeric) > 0.00000001 then changed := true; end if;
    snapshots := snapshots || jsonb_build_array(jsonb_set(src,'{amount_g}',to_jsonb(source_g)));
  end loop;
  if not changed then raise exception '비율이 변경되지 않았습니다'; end if;
  select coalesce(max(version_number),0)+1 into next_number from public.formula_versions where formula_id=fid;
  insert into public.formula_versions(user_id,formula_id,version_number,status,
    default_mould_id,default_base_weight_id,default_capacity_id,yield_quantity,
    notes,bath_water_g,basis_overrides,component_sources,change_summary,change_reason)
  values(uid,fid,next_number,'DRAFT',old_version.default_mould_id,old_version.default_base_weight_id,
    old_version.default_capacity_id,old_version.yield_quantity,old_version.notes,
    old_version.bath_water_g,old_version.basis_overrides,snapshots,
    'V'||old_version.version_number||' 컴포넌트 혼합 비율 변경',nullif(trim(p_reason),'')) returning id into vid;
  insert into public.formula_version_ingredients(user_id,formula_version_id,ingredient_id,amount,unit,sort_order,note,amount_source)
    select uid,vid,(i->>'ingredient_id')::uuid,
      sum((i->>'amount_g')::numeric*(s->>'amount_g')::numeric/(s->>'base_weight_g')::numeric),
      'g',row_number() over(order by i->>'ingredient_id')::integer-1,
      string_agg(distinct s->>'component_name',' + '),'copied'
    from jsonb_array_elements(snapshots) s
    cross join lateral jsonb_array_elements(s->'ingredients') i
    group by i->>'ingredient_id';
  -- New versions require their own dietary review, matching the existing version workflow.
  insert into public.order_production_sync_log(user_id,source,before_value,after_value)
    values(uid,'component_blend_ratio',
      jsonb_build_object('version_id',old_version.id,'component_sources',old_version.component_sources),
      jsonb_build_object('version_id',vid,'component_sources',snapshots));
  return jsonb_build_object('formula_id',fid,'version_id',vid,'version_number',next_number);
end;
$$;
revoke all on function public.revise_component_blend(uuid,timestamptz,jsonb,text) from public,anon;
grant execute on function public.revise_component_blend(uuid,timestamptz,jsonb,text) to authenticated;
