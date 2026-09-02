-- PRODUCTION / WEIGHING DASHBOARD — Work Session 구조
-- 원본 formula_versions/formula_version_ingredients/formulas/ingredients는 전혀 변경하지 않는다.
-- multiplier/checklist/history는 모두 work_session_* 신규 테이블에서만 관리한다.

/* ── work_sessions ───────────────────────────────────────────── */

CREATE TABLE public.work_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','PAUSED','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_sessions_user_idx ON public.work_sessions (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_sessions TO authenticated;
GRANT ALL ON public.work_sessions TO service_role;

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own work_sessions" ON public.work_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER work_sessions_updated_at
  BEFORE UPDATE ON public.work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* ── work_session_formula_versions ──────────────────────────────
   Work Session에 선택된 Formula Version + 현재 multiplier.
   Working quantity(= original_amount × multiplier)는 저장하지 않고 read-time 계산한다. */

CREATE TABLE public.work_session_formula_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_session_id uuid NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  formula_version_id uuid NOT NULL REFERENCES public.formula_versions(id) ON DELETE CASCADE,
  multiplier numeric NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  sort_order integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_session_formula_versions_unique UNIQUE (work_session_id, formula_version_id)
);

CREATE INDEX work_session_formula_versions_session_idx
  ON public.work_session_formula_versions (work_session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_session_formula_versions TO authenticated;
GRANT ALL ON public.work_session_formula_versions TO service_role;

ALTER TABLE public.work_session_formula_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own work_session_formula_versions" ON public.work_session_formula_versions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER work_session_formula_versions_updated_at
  BEFORE UPDATE ON public.work_session_formula_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* ── work_session_multiplier_history ────────────────────────────
   Multiplier 변경 이력. Append-only — UPDATE/DELETE 정책을 만들지 않아
   authenticated 권한으로는 수정/삭제가 불가능하다(서비스 롤 제외).
   resulting_working_quantity_snapshot: 적용 당시 계산된 working quantity 배열을
   그대로 저장해, 이후 원본 Formula Version이 바뀌어도 당시 기록을 재현할 수 있게 한다. */

CREATE TABLE public.work_session_multiplier_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_session_id uuid NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  formula_version_id uuid NOT NULL REFERENCES public.formula_versions(id) ON DELETE CASCADE,
  previous_multiplier numeric NOT NULL,
  applied_multiplier numeric NOT NULL,
  resulting_working_quantity_snapshot jsonb,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_session_multiplier_history_positive CHECK (previous_multiplier > 0 AND applied_multiplier > 0)
);

CREATE INDEX work_session_multiplier_history_session_idx
  ON public.work_session_multiplier_history (work_session_id, formula_version_id, applied_at DESC);

-- append-only: authenticated는 SELECT/INSERT만 가능, UPDATE/DELETE 정책 없음
GRANT SELECT, INSERT ON public.work_session_multiplier_history TO authenticated;
GRANT ALL ON public.work_session_multiplier_history TO service_role;

ALTER TABLE public.work_session_multiplier_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own work_session_multiplier_history select" ON public.work_session_multiplier_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own work_session_multiplier_history insert" ON public.work_session_multiplier_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

/* ── work_session_progress ──────────────────────────────────────
   Checklist grain = formula_version_ingredient_id × work_session_id (정확한 원본 recipe line 기준). */

CREATE TABLE public.work_session_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_session_id uuid NOT NULL REFERENCES public.work_sessions(id) ON DELETE CASCADE,
  formula_version_ingredient_id uuid NOT NULL REFERENCES public.formula_version_ingredients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','DONE','SHORTAGE','SKIPPED')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_session_progress_unique UNIQUE (work_session_id, formula_version_ingredient_id)
);

CREATE INDEX work_session_progress_session_idx
  ON public.work_session_progress (work_session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_session_progress TO authenticated;
GRANT ALL ON public.work_session_progress TO service_role;

ALTER TABLE public.work_session_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own work_session_progress" ON public.work_session_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER work_session_progress_updated_at
  BEFORE UPDATE ON public.work_session_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- work_session_progress가 실제로 그 work_session에 포함된 Formula Version의 ingredient line만 가리키도록 검증
CREATE OR REPLACE FUNCTION public.validate_work_session_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_formula_version_id uuid;
  v_exists boolean;
BEGIN
  SELECT formula_version_id INTO v_formula_version_id
  FROM public.formula_version_ingredients
  WHERE id = NEW.formula_version_ingredient_id;

  IF v_formula_version_id IS NULL THEN
    RAISE EXCEPTION 'formula_version_ingredient_id % not found', NEW.formula_version_ingredient_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.work_session_formula_versions
    WHERE work_session_id = NEW.work_session_id
      AND formula_version_id = v_formula_version_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'formula_version_ingredient_id % does not belong to a formula version included in work_session %',
      NEW.formula_version_ingredient_id, NEW.work_session_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER work_session_progress_validate
  BEFORE INSERT OR UPDATE ON public.work_session_progress
  FOR EACH ROW EXECUTE FUNCTION public.validate_work_session_progress();

/* ── experiments.work_session_id (nullable, 추가만) ─────────────
   같은 Work Session에서 승급된 Experiment임을 추적하기 위한 컬럼.
   baseline_experiment_id/variables/sensory/yield-loss/process events 등
   기존 experiments 구조는 전혀 변경하지 않는다. */

ALTER TABLE public.experiments
  ADD COLUMN work_session_id uuid REFERENCES public.work_sessions(id) ON DELETE SET NULL;

CREATE INDEX experiments_work_session_idx ON public.experiments (work_session_id);
