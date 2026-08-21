CREATE TYPE public.formula_status AS ENUM ('DRAFT','TESTING','CURRENT','SUPERSEDED','ARCHIVED');

CREATE TABLE public.moulds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  shape_size text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moulds TO authenticated;
GRANT ALL ON public.moulds TO service_role;
ALTER TABLE public.moulds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own moulds" ON public.moulds FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_moulds_updated_at BEFORE UPDATE ON public.moulds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formulas TO authenticated;
GRANT ALL ON public.formulas TO service_role;
ALTER TABLE public.formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own formulas" ON public.formulas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_formulas_updated_at BEFORE UPDATE ON public.formulas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX formulas_component_id_idx ON public.formulas(component_id);

CREATE TABLE public.formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formula_id uuid NOT NULL REFERENCES public.formulas(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  status public.formula_status NOT NULL DEFAULT 'DRAFT',
  default_mould_id uuid REFERENCES public.moulds(id) ON DELETE SET NULL,
  yield_quantity numeric,
  change_summary text,
  change_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formula_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formula_versions TO authenticated;
GRANT ALL ON public.formula_versions TO service_role;
ALTER TABLE public.formula_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own formula_versions" ON public.formula_versions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_formula_versions_updated_at BEFORE UPDATE ON public.formula_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX formula_versions_formula_id_idx ON public.formula_versions(formula_id);

CREATE TABLE public.formula_version_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formula_version_id uuid NOT NULL REFERENCES public.formula_versions(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  amount numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formula_version_ingredients TO authenticated;
GRANT ALL ON public.formula_version_ingredients TO service_role;
ALTER TABLE public.formula_version_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own formula_version_ingredients" ON public.formula_version_ingredients FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_fvi_updated_at BEFORE UPDATE ON public.formula_version_ingredients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX fvi_version_idx ON public.formula_version_ingredients(formula_version_id);

CREATE OR REPLACE FUNCTION public.enforce_single_current_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'CURRENT' THEN
    UPDATE public.formula_versions
       SET status = 'SUPERSEDED'
     WHERE formula_id = NEW.formula_id
       AND id <> NEW.id
       AND status = 'CURRENT';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER formula_versions_single_current
AFTER INSERT OR UPDATE OF status ON public.formula_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_current_version();