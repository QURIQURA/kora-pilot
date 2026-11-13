-- 세션 상태(PLANNED/IN_PROGRESS/COMPLETED/CANCELLED) 기능 제거(2026-11-13):
-- WORK SESSION 목록이 아니라 DASHBOARD 데일리 타임라인으로 운영하므로, 세션 상태로 막거나 거르던 DB 함수를
-- 모두 오더(주문) 상태 기준으로만 동작하게 바꾼다. status 컬럼 자체는 보존(되돌리기 쉽게)하되 더 이상 쓰지 않는다.
DO $mig$
DECLARE
  r record; d text; nd text;
  pairs text[][] := ARRAY[
    -- save_order_component_plan / _v2 / _v3
    ARRAY['s.status in(''COMPLETED'',''CANCELLED'') or o.status in(''COMPLETED'',''CANCELLED'')', 'o.status in(''COMPLETED'',''CANCELLED'')'],
    -- pilot_selection_to_order
    ARRAY['or s.status in (''COMPLETED'',''CANCELLED'') or w.kind', 'or w.kind'],
    -- pilot_sync_order_slot
    ARRAY['  if s.status in (''COMPLETED'',''CANCELLED'') then return; end if;', ''],
    -- pilot_current_version_to_production
    ARRAY['and s.status not in(''COMPLETED'',''CANCELLED'') and o.status not in', 'and o.status not in'],
    -- save_popup_order
    ARRAY['where id=(i->>''work_session_id'')::uuid and user_id=auth.uid() and status not in (''COMPLETED'',''CANCELLED'');', 'where id=(i->>''work_session_id'')::uuid and user_id=auth.uid();']
  ];
  i int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('save_order_component_plan','save_order_component_plan_v2','save_order_component_plan_v3',
        'pilot_selection_to_order','pilot_sync_order_slot','pilot_current_version_to_production','save_popup_order')
  LOOP
    d := pg_get_functiondef(r.oid);
    nd := d;
    FOR i IN 1..array_length(pairs,1) LOOP
      nd := replace(nd, pairs[i][1], pairs[i][2]);
    END LOOP;
    IF nd <> d THEN
      EXECUTE nd;
    END IF;
  END LOOP;
END
$mig$;
