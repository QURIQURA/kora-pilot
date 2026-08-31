-- PROCESS PARAMETERS: 구조화된 공정 파라미터 (마스터 데이터 + 링크 테이블 패턴)
-- 기존 process_events(action/note/timeline)는 전혀 변경하지 않는다. 순수 additive.

CREATE TABLE public.process_parameter_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_category_id uuid REFERENCES public.process_categories(id) ON DELETE SET NULL,
  key text NOT NULL,
  label text NOT NULL,
  label_en text,
  value_type text NOT NULL CHECK (value_type IN ('NUMERIC','TEXT','BOOLEAN')),
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_parameter_definitions_user_key_unique UNIQUE (user_id, key)
);

CREATE INDEX process_parameter_definitions_category_idx
  ON public.process_parameter_definitions (process_category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_parameter_definitions TO authenticated;
GRANT ALL ON public.process_parameter_definitions TO service_role;

ALTER TABLE public.process_parameter_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own process_parameter_definitions" ON public.process_parameter_definitions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER process_parameter_definitions_updated_at
  BEFORE UPDATE ON public.process_parameter_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 링크 테이블: 실제 process_event에 기록된 parameter 값
CREATE TABLE public.process_event_parameters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_event_id uuid NOT NULL REFERENCES public.process_events(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.process_parameter_definitions(id) ON DELETE CASCADE,
  value_numeric numeric,
  value_text text,
  value_boolean boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_event_parameters_event_definition_unique UNIQUE (process_event_id, definition_id)
);

CREATE INDEX process_event_parameters_event_idx
  ON public.process_event_parameters (process_event_id);
CREATE INDEX process_event_parameters_definition_idx
  ON public.process_event_parameters (definition_id);
-- "170도로 구운 실험 전부" 같은 값 기준 검색을 위한 부분 인덱스
CREATE INDEX process_event_parameters_numeric_idx
  ON public.process_event_parameters (definition_id, value_numeric)
  WHERE value_numeric IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_event_parameters TO authenticated;
GRANT ALL ON public.process_event_parameters TO service_role;

ALTER TABLE public.process_event_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own process_event_parameters" ON public.process_event_parameters
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- definition.value_type과 실제로 채워진 value_* 컬럼의 정합성 검증
-- (다른 테이블을 참조해야 하므로 CHECK가 아니라 트리거로 처리 — sensory score validation과 동일한 이유)
CREATE OR REPLACE FUNCTION public.validate_process_event_parameter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  def_type text;
BEGIN
  SELECT value_type INTO def_type
  FROM public.process_parameter_definitions
  WHERE id = NEW.definition_id;

  IF def_type IS NULL THEN
    RAISE EXCEPTION 'unknown process_parameter_definition %', NEW.definition_id;
  END IF;

  IF def_type = 'NUMERIC' THEN
    IF NEW.value_numeric IS NULL OR NEW.value_text IS NOT NULL OR NEW.value_boolean IS NOT NULL THEN
      RAISE EXCEPTION 'definition % (NUMERIC) requires value_numeric only', NEW.definition_id;
    END IF;
  ELSIF def_type = 'TEXT' THEN
    IF NEW.value_text IS NULL OR NEW.value_numeric IS NOT NULL OR NEW.value_boolean IS NOT NULL THEN
      RAISE EXCEPTION 'definition % (TEXT) requires value_text only', NEW.definition_id;
    END IF;
  ELSIF def_type = 'BOOLEAN' THEN
    IF NEW.value_boolean IS NULL OR NEW.value_numeric IS NOT NULL OR NEW.value_text IS NOT NULL THEN
      RAISE EXCEPTION 'definition % (BOOLEAN) requires value_boolean only', NEW.definition_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER process_event_parameters_validate
  BEFORE INSERT OR UPDATE ON public.process_event_parameters
  FOR EACH ROW EXECUTE FUNCTION public.validate_process_event_parameter();

-- 초기 Parameter Definitions seed 함수 (신규 유저 + 기존 유저 백필용)
CREATE OR REPLACE FUNCTION public.seed_process_parameter_definitions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mixing_id uuid;
  baking_id uuid;
BEGIN
  SELECT id INTO mixing_id FROM public.process_categories WHERE user_id = p_user_id AND name = 'MIXING' LIMIT 1;
  SELECT id INTO baking_id FROM public.process_categories WHERE user_id = p_user_id AND name = 'BAKING' LIMIT 1;

  INSERT INTO public.process_parameter_definitions
    (user_id, process_category_id, key, label, label_en, value_type, unit, sort_order)
  VALUES
    (p_user_id, NULL,       'temperature_c', '온도', 'Temperature', 'NUMERIC', '°C', 1),
    (p_user_id, NULL,       'duration_sec',  '시간', 'Duration', 'NUMERIC', 'sec', 2),
    (p_user_id, mixing_id,  'speed',         '속도', 'Speed', 'NUMERIC', 'LEVEL', 3),
    (p_user_id, mixing_id,  'mixing_order',  '투입 순서', 'Mixing order', 'TEXT', NULL, 4),
    (p_user_id, baking_id,  'fan',           '팬(컨벡션)', 'Fan', 'BOOLEAN', NULL, 5),
    (p_user_id, baking_id,  'humidity_pct',  '습도', 'Humidity', 'NUMERIC', '%', 6),
    (p_user_id, baking_id,  'rack_position', '선반 위치', 'Rack position', 'TEXT', NULL, 7)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$function$;

-- 기존 유저 백필
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_process_parameter_definitions(u.id);
  END LOOP;
END $$;

-- 신규 유저: handle_new_user에 seed 호출 추가 (기존 로직은 그대로, 마지막에 한 줄만 추가)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cakes_id UUID;
BEGIN
  INSERT INTO public.categories (user_id, name, color, sort_order)
  VALUES (NEW.id, 'SAMPLE_CAKES', '#C9B79C', 1)
  RETURNING id INTO cakes_id;

  INSERT INTO public.categories (user_id, name, parent_id, color, sort_order)
  VALUES (NEW.id, 'SAMPLE_CHIFFON', cakes_id, '#D8CBB4', 1);

  INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
    (NEW.id, 'SAMPLE_TARTS', '#B9C2B0', 2),
    (NEW.id, 'SAMPLE_COOKIES', '#CDBBB0', 3),
    (NEW.id, 'SAMPLE_CREAMS', '#BFC4CC', 4);

  INSERT INTO public.ingredient_functions (user_id, name, name_en, is_default, key, sort_order) VALUES
    (NEW.id, 'FAT', 'FAT', true, 'fat', 1),
    (NEW.id, 'PROTEIN', 'PROTEIN', true, null, 2),
    (NEW.id, 'STRUCTURE', 'STRUCTURE', true, 'structure', 3),
    (NEW.id, 'STARCH', 'STARCH', true, 'starch', 4),
    (NEW.id, 'AERATION', 'AERATION', true, null, 5),
    (NEW.id, 'WATER', 'WATER', true, 'water', 6),
    (NEW.id, 'SWEETENER', 'SWEETENER', true, 'sweetener', 7),
    (NEW.id, 'FLAVOUR', 'FLAVOUR', true, null, 8),
    (NEW.id, 'ACID', 'ACID', true, null, 9),
    (NEW.id, 'LEAVENING', 'LEAVENING', true, null, 10),
    (NEW.id, 'STABILISER', 'STABILISER', true, null, 11),
    (NEW.id, 'MOUTHFEEL', 'MOUTHFEEL', true, null, 12),
    (NEW.id, 'EMULSIFIER', 'EMULSIFIER', true, null, 13);

  INSERT INTO public.process_categories (user_id, name, color, sort_order, is_default) VALUES
    (NEW.id, 'PREP',    '#C9B79C', 1, true),
    (NEW.id, 'MIXING',  '#D8CBB4', 2, true),
    (NEW.id, 'BAKING',  '#CDBBB0', 3, true),
    (NEW.id, 'COOLING', '#BFC4CC', 4, true),
    (NEW.id, 'DECOR',   '#B9C2B0', 5, true);

  PERFORM public.seed_flavour_families(NEW.id);
  PERFORM public.seed_default_ingredients(NEW.id);
  PERFORM public.seed_technique_categories(NEW.id);
  PERFORM public.seed_process_parameter_definitions(NEW.id);

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
