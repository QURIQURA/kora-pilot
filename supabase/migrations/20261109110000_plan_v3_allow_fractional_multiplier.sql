-- 2026-11-09: 재료 기준 자동 배수(소수) 허용. save_order_component_plan_v3의 "몰드/기준중량 없을 때 정수 배수만"
-- 서버 검사를 제거한다. 직접 입력의 정수 규칙은 클라이언트(parseComponentPlan)에서 그대로 유지.
do $$
declare def text; old text; begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='save_order_component_plan_v3';
  old := E'  if p_mould_id is null and p_base_weight_id is null\n     and ((p_multiplier<1 or trunc(p_multiplier)<>p_multiplier) and p_multiplier is distinct from r.multiplier) then\n    raise exception ''생산 배수는 1 이상의 정수로 입력하세요'';\n  end if;\n';
  if position(old in def) = 0 then raise exception 'pattern not found'; end if;
  execute replace(def, old, E'  -- 소수 배수 허용(재료 기준 자동 배수)\n');
end $$;
