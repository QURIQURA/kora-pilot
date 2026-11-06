-- 기준중량 × 개수 = 목표 g 방정식 저장 회귀 테스트. 항상 ROLLBACK(예외로 끝남).
-- 기준중량 기준 소수점 배수(예: 1100g ÷ 700g = 1.5714)가 v2/v3 모두에서 저장되고,
-- 목표 없는 직접 입력의 소수점 배수는 계속 거부되는지 확인한다.
do $$
declare r record; res jsonb; bw uuid; rejected boolean := false;
begin
  select w.id, w.updated_at, w.user_id, w.formula_version_id into r
    from public.work_session_formula_versions w limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
  select id into bw from public.base_weight_presets limit 1;
  res := public.save_order_component_plan_v3(r.id, r.updated_at, r.formula_version_id, 1.5714, 1100, true, null, null, bw, 1);
  assert (res->>'multiplier')::numeric = 1.5714, 'v3 must keep fractional multiplier';
  assert res->>'base_weight_id' = bw::text, 'v3 must store base_weight_id';
  begin
    perform public.save_order_component_plan_v3(r.id, (res->>'updated_at')::timestamptz, r.formula_version_id, 1.5, null, true, null, null, null, null);
  exception when others then rejected := true; end;
  assert rejected, 'direct fractional multiplier without target must be rejected';
  raise exception 'ROLLBACK_OK';
end $$;
