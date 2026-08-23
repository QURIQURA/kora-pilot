CREATE TYPE public.process_event_type AS ENUM ('point', 'span');

CREATE TABLE public.process_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#D4D3CE',
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_categories TO authenticated;
GRANT ALL ON public.process_categories TO service_role;

ALTER TABLE public.process_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own process_categories" ON public.process_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER process_categories_updated_at
  BEFORE UPDATE ON public.process_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.process_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  action text NOT NULL,
  category_id uuid REFERENCES public.process_categories(id) ON DELETE SET NULL,
  event_type public.process_event_type NOT NULL DEFAULT 'point',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT process_events_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX process_events_experiment_idx ON public.process_events (experiment_id, started_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_events TO authenticated;
GRANT ALL ON public.process_events TO service_role;

ALTER TABLE public.process_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own process_events" ON public.process_events
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER process_events_updated_at
  BEFORE UPDATE ON public.process_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New users: seed default process categories alongside existing defaults
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

  INSERT INTO public.ingredient_functions (user_id, name, is_default)
  SELECT NEW.id, fn, true FROM unnest(ARRAY[
    'FAT','PROTEIN','STRUCTURE','AERATION','WATER','SWEETENER',
    'FLAVOUR','ACID','LEAVENING','STABILISER','MOUTHFEEL','EMULSIFIER'
  ]) AS fn;

  INSERT INTO public.process_categories (user_id, name, color, sort_order, is_default) VALUES
    (NEW.id, 'PREP',    '#C9B79C', 1, true),
    (NEW.id, 'MIXING',  '#D8CBB4', 2, true),
    (NEW.id, 'BAKING',  '#CDBBB0', 3, true),
    (NEW.id, 'COOLING', '#BFC4CC', 4, true),
    (NEW.id, 'DECOR',   '#B9C2B0', 5, true);

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

-- Existing users: backfill default process categories if they have none
INSERT INTO public.process_categories (user_id, name, color, sort_order, is_default)
SELECT u.id, d.name, d.color, d.sort_order, true
FROM auth.users u
CROSS JOIN (VALUES
  ('PREP',    '#C9B79C', 1),
  ('MIXING',  '#D8CBB4', 2),
  ('BAKING',  '#CDBBB0', 3),
  ('COOLING', '#BFC4CC', 4),
  ('DECOR',   '#B9C2B0', 5)
) AS d(name, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.process_categories pc WHERE pc.user_id = u.id
);