ALTER TABLE public.formula_version_ingredients
  ADD COLUMN IF NOT EXISTS amount_source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.formula_versions
  ADD COLUMN IF NOT EXISTS bath_water_g numeric;

ALTER TABLE public.formula_versions
  ADD COLUMN IF NOT EXISTS basis_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;