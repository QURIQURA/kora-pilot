-- 2026-10-20 사용자 요청: WORK SESSION 생산일정이 잡히면 ORDER의 WANN 프로젝트 하위에
-- SHEET/CREAM/FILLING(CORE) 별로 TASK를 생성하도록 재설계(이전에 제거한 "단독 TASK" 방식을
-- 대체). WANN OS planner_tasks에는 FK를 걸 수 없으므로(별도 Supabase 프로젝트), 어떤
-- work_session_formula_versions 행이 어떤 planner_tasks.id와 매칭되는지 KORA 쪽에
-- 기록해서 재동기화 시 새로 만들지 말고 UPDATE하도록 한다(완료 체크 등 WANN 쪽 상태 보존).
alter table public.work_session_formula_versions
  add column if not exists planner_task_id uuid;
