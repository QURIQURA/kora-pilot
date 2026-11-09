-- 2026-11-09: 재료 기준 생산 계획(예: 버터 420g)의 기준 재료/목표 g를 저장해 요약에 그대로 보여준다.
alter table public.work_session_formula_versions
  add column plan_ingredient_id uuid references public.ingredients(id) on delete set null,
  add column plan_ingredient_g numeric;
