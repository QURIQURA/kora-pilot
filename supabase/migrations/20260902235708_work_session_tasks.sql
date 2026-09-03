-- PRODUCTION WORKFLOW TIMELINE — Work Session Task 구조
-- AUDIT + DESIGN 단계에서 합의된 설계를 그대로 구현한다.
-- 기존 formulas/formula_versions/formula_version_ingredients/ingredients/work_sessions/
-- work_session_progress/work_session_multiplier_history/process_events는 전혀 건드리지 않는다.
-- 순수 추가(additive) — 새 테이블 1개만 생성한다.

CREATE TABLE public.work_session_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_session_id uuid NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  formula_version_id uuid REFERENCES public.formula_versions(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  task_type text,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'SKIPPED')),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  predecessor_task_id uuid REFERENCES public.work_session_tasks(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_session_tasks_user_idx ON public.work_session_tasks (user_id);
CREATE INDEX work_session_tasks_session_idx ON public.work_session_tasks (work_session_id);
CREATE INDEX work_session_tasks_formula_version_idx ON public.work_session_tasks (formula_version_id);
CREATE INDEX work_session_tasks_predecessor_idx ON public.work_session_tasks (predecessor_task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_session_tasks TO authenticated;
GRANT ALL ON public.work_session_tasks TO service_role;

ALTER TABLE public.work_session_tasks ENABLE ROW LEVEL SECURITY;

-- 기존 work_session_progress/work_session_formula_versions과 동일한 user-owned 패턴
CREATE POLICY "own work_session_tasks" ON public.work_session_tasks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER work_session_tasks_updated_at
  BEFORE UPDATE ON public.work_session_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
