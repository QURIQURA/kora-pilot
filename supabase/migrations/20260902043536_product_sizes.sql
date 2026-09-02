-- PRODUCT SIZE / DIMENSION SYSTEM
-- products의 child table. Mould(생산 도구)와는 독립적인 개념 — mould_id 없음(승인된 설계).
-- DB canonical unit: mm. Area/Volume은 저장하지 않고 read-time 계산(lib/product-size.ts).

CREATE TABLE public.product_sizes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shape text NOT NULL CHECK (shape IN ('ROUND','RECTANGLE')),
  diameter_mm numeric,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_sizes_positive_dims CHECK (
    (diameter_mm IS NULL OR diameter_mm > 0) AND
    (length_mm IS NULL OR length_mm > 0) AND
    (width_mm IS NULL OR width_mm > 0) AND
    (height_mm IS NULL OR height_mm > 0)
  )
);

CREATE INDEX product_sizes_product_idx ON public.product_sizes (product_id);

-- Product당 is_default = true는 최대 1개만 허용 (partial unique index)
CREATE UNIQUE INDEX product_sizes_one_default_idx
  ON public.product_sizes (product_id)
  WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_sizes TO authenticated;
GRANT ALL ON public.product_sizes TO service_role;

ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own product_sizes" ON public.product_sizes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER product_sizes_updated_at
  BEFORE UPDATE ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Shape별 필수/금지 dimension 검증
CREATE OR REPLACE FUNCTION public.validate_product_size()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.shape = 'ROUND' THEN
    IF NEW.diameter_mm IS NULL OR NEW.height_mm IS NULL THEN
      RAISE EXCEPTION 'ROUND requires diameter_mm and height_mm';
    END IF;
    IF NEW.length_mm IS NOT NULL OR NEW.width_mm IS NOT NULL THEN
      RAISE EXCEPTION 'ROUND must not set length_mm/width_mm';
    END IF;
  ELSIF NEW.shape = 'RECTANGLE' THEN
    IF NEW.length_mm IS NULL OR NEW.width_mm IS NULL OR NEW.height_mm IS NULL THEN
      RAISE EXCEPTION 'RECTANGLE requires length_mm, width_mm and height_mm';
    END IF;
    IF NEW.diameter_mm IS NOT NULL THEN
      RAISE EXCEPTION 'RECTANGLE must not set diameter_mm';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER product_sizes_validate
  BEFORE INSERT OR UPDATE ON public.product_sizes
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_size();
