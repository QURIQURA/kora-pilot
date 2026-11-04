-- Transactional smoke test against an existing owned two-source snapshot. Always ROLLBACK.
select set_config('request.jwt.claim.sub', (select user_id::text from public.formula_versions where jsonb_array_length(component_sources)=2 limit 1), true);
set local role authenticated;
do $$
declare
  original public.formula_versions%rowtype;
  revised public.formula_versions%rowtype;
  result jsonb;
  target jsonb;
  original_grams numeric;
  grams numeric;
  source_count integer;
  failed boolean;
begin
  select * into strict original from public.formula_versions
    where user_id=auth.uid() and jsonb_array_length(component_sources)=2 limit 1;
  select sum((s->>'amount_g')::numeric) into original_grams from jsonb_array_elements(original.component_sources) s;
  target := case when abs((original.component_sources->0->>'amount_g')::numeric/original_grams-0.5)<0.00001 then '[37.125,62.875]'::jsonb else '[50,50]'::jsonb end;
  select count(*) into source_count from public.formula_versions where formula_id=original.formula_id;
  result := public.revise_component_blend(original.id,original.updated_at,target,'transactional ratio test');
  select * into strict revised from public.formula_versions where id=(result->>'version_id')::uuid;
  if revised.formula_id<>original.formula_id or revised.status<>'DRAFT' or revised.id=original.id
    or revised.version_number <= original.version_number then raise exception 'new draft/version failed'; end if;
  if (select count(*) from public.formula_versions where formula_id=original.formula_id) <> source_count+1 then raise exception 'unexpected version count'; end if;
  if (select component_sources from public.formula_versions where id=original.id) <> original.component_sources
    or (select status from public.formula_versions where id=original.id)<>original.status then raise exception 'original mutated'; end if;
  if revised.component_sources->0->'ingredients' <> original.component_sources->0->'ingredients' then raise exception 'snapshot mutated'; end if;
  select sum(amount) into grams from public.formula_version_ingredients where formula_version_id=revised.id;
  if abs(grams-original_grams)>0.000001 then raise exception 'total weight not conserved'; end if;
  if not exists(select 1 from public.order_production_sync_log where source='component_blend_ratio' and after_value->>'version_id'=revised.id::text and before_value->>'version_id'=original.id::text) then raise exception 'audit missing'; end if;
  -- Endpoint percentages are valid, and can be revised again from their saved snapshots.
  result := public.revise_component_blend(original.id,original.updated_at,'[0,100]');
  select * into strict revised from public.formula_versions where id=(result->>'version_id')::uuid;
  if (revised.component_sources->0->>'amount_g')::numeric<>0 then raise exception 'zero endpoint failed'; end if;
  perform public.revise_component_blend(revised.id,revised.updated_at,'[25,75]');
  failed := false;
  begin perform public.revise_component_blend(original.id,original.updated_at,'[30,30]'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'invalid total accepted'; end if;
  failed := false;
  begin perform public.revise_component_blend(original.id,original.updated_at,'[-1,101]'); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'invalid percentage accepted'; end if;
  failed := false;
  begin perform public.revise_component_blend(original.id,original.updated_at-interval '1 second',target); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'stale version accepted'; end if;
  failed := false;
  begin perform public.revise_component_blend(gen_random_uuid(),original.updated_at,target); exception when raise_exception then failed:=true; end;
  if not failed then raise exception 'inaccessible version accepted'; end if;
  if (select count(*) from public.formula_versions where formula_id=original.formula_id) <> source_count+3 then raise exception 'failed saves left partial versions'; end if;
end $$;
select 'PASS: version history, snapshots, grams, endpoints, audit, validation and stale/ownership guards' as result;
