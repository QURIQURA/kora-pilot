-- 1) flavour_families 테이블
CREATE TABLE public.flavour_families (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_en text,
  color text NOT NULL DEFAULT '#D4D3CE',
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flavour_families TO authenticated;
GRANT ALL ON public.flavour_families TO service_role;
ALTER TABLE public.flavour_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flavour_families" ON public.flavour_families FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_flavour_families_updated_at BEFORE UPDATE ON public.flavour_families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) ingredients 확장 컬럼
ALTER TABLE public.ingredients
  ADD COLUMN name_en text,
  ADD COLUMN is_functional boolean NOT NULL DEFAULT false,
  ADD COLUMN reference_basis text,
  ADD COLUMN typical_rate_min numeric,
  ADD COLUMN typical_rate_max numeric,
  ADD COLUMN bloom numeric,
  ADD COLUMN scaling_mode text NOT NULL DEFAULT 'linear',
  ADD COLUMN scaling_exponent numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN process_note text,
  ADD COLUMN comp_water numeric,
  ADD COLUMN comp_fat numeric,
  ADD COLUMN comp_protein numeric,
  ADD COLUMN comp_sugar numeric,
  ADD COLUMN comp_other_solids numeric,
  ADD COLUMN comp_alcohol numeric,
  ADD COLUMN composition_source text,
  ADD COLUMN fat_type text,
  ADD COLUMN sugar_type text,
  ADD COLUMN pac_value numeric,
  ADD COLUMN pod_value numeric,
  ADD COLUMN role_toughener boolean NOT NULL DEFAULT false,
  ADD COLUMN role_tenderizer boolean NOT NULL DEFAULT false,
  ADD COLUMN role_moistener boolean NOT NULL DEFAULT false,
  ADD COLUMN role_drier boolean NOT NULL DEFAULT false,
  ADD COLUMN flavour_family_id uuid REFERENCES public.flavour_families(id) ON DELETE SET NULL,
  ADD COLUMN flavour_intensity integer,
  ADD COLUMN taste_sweet integer,
  ADD COLUMN taste_sour integer,
  ADD COLUMN taste_bitter integer,
  ADD COLUMN taste_salty integer,
  ADD COLUMN taste_umami integer,
  ADD COLUMN taste_astringent integer,
  ADD COLUMN taste_fat integer,
  ADD COLUMN aroma_notes text[],
  ADD COLUMN flavour_note text;

ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_reference_basis_check
  CHECK (reference_basis IS NULL OR reference_basis IN ('flour','liquid','total','puree_sugar','fat','sugar','egg_white','bath'));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_scaling_mode_check
  CHECK (scaling_mode IN ('linear','sub_linear','fixed'));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_composition_source_check
  CHECK (composition_source IS NULL OR composition_source IN ('standard','verified'));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_fat_type_check
  CHECK (fat_type IS NULL OR fat_type IN ('dairy','cocoa_butter','vegetable','other'));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_sugar_type_check
  CHECK (sugar_type IS NULL OR sugar_type IN ('sucrose','dextrose','fructose','invert','glucose_syrup','lactose','sorbitol','trehalose','maltodextrin','other'));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_flavour_intensity_check
  CHECK (flavour_intensity IS NULL OR (flavour_intensity >= 1 AND flavour_intensity <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_sweet_check
  CHECK (taste_sweet IS NULL OR (taste_sweet >= 0 AND taste_sweet <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_sour_check
  CHECK (taste_sour IS NULL OR (taste_sour >= 0 AND taste_sour <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_bitter_check
  CHECK (taste_bitter IS NULL OR (taste_bitter >= 0 AND taste_bitter <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_salty_check
  CHECK (taste_salty IS NULL OR (taste_salty >= 0 AND taste_salty <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_umami_check
  CHECK (taste_umami IS NULL OR (taste_umami >= 0 AND taste_umami <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_astringent_check
  CHECK (taste_astringent IS NULL OR (taste_astringent >= 0 AND taste_astringent <= 5));
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_taste_fat_check
  CHECK (taste_fat IS NULL OR (taste_fat >= 0 AND taste_fat <= 5));

-- 3) ingredient_functions 확장 (영문명/색상/정렬/내부 키)
ALTER TABLE public.ingredient_functions
  ADD COLUMN name_en text,
  ADD COLUMN color text NOT NULL DEFAULT '#D4D3CE',
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN key text;

CREATE UNIQUE INDEX ingredient_functions_user_key_unique
  ON public.ingredient_functions (user_id, key) WHERE key IS NOT NULL;

-- 기존 기본 기능 backfill: 정렬 순서 + 계산용 내부 키
UPDATE public.ingredient_functions SET sort_order = 1, key = 'fat' WHERE is_default AND name = 'FAT';
UPDATE public.ingredient_functions SET sort_order = 2 WHERE is_default AND name = 'PROTEIN';
UPDATE public.ingredient_functions SET sort_order = 3, key = 'structure' WHERE is_default AND name = 'STRUCTURE';
UPDATE public.ingredient_functions SET sort_order = 5 WHERE is_default AND name = 'AERATION';
UPDATE public.ingredient_functions SET sort_order = 6, key = 'water' WHERE is_default AND name = 'WATER';
UPDATE public.ingredient_functions SET sort_order = 7, key = 'sweetener' WHERE is_default AND name = 'SWEETENER';
UPDATE public.ingredient_functions SET sort_order = 8 WHERE is_default AND name = 'FLAVOUR';
UPDATE public.ingredient_functions SET sort_order = 9 WHERE is_default AND name = 'ACID';
UPDATE public.ingredient_functions SET sort_order = 10 WHERE is_default AND name = 'LEAVENING';
UPDATE public.ingredient_functions SET sort_order = 11 WHERE is_default AND name = 'STABILISER';
UPDATE public.ingredient_functions SET sort_order = 12 WHERE is_default AND name = 'MOUTHFEEL';
UPDATE public.ingredient_functions SET sort_order = 13 WHERE is_default AND name = 'EMULSIFIER';
UPDATE public.ingredient_functions SET name_en = name WHERE is_default AND name_en IS NULL;

-- 기존 시드에 없던 STARCH 보충 (계산용 키 포함)
INSERT INTO public.ingredient_functions (user_id, name, name_en, is_default, key, sort_order)
SELECT u.id, 'STARCH', 'STARCH', true, 'starch', 4
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.ingredient_functions f
  WHERE f.user_id = u.id AND f.key = 'starch'
);

-- 4) 향미 계열 시드 함수 (신규 가입 트리거 + 기존 사용자 backfill 공용)
CREATE OR REPLACE FUNCTION public.seed_flavour_families(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.flavour_families WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.flavour_families (user_id, name, name_en, color, sort_order) VALUES
    (p_user_id, '시트러스', 'Citrus', '#E8DCA0', 1),
    (p_user_id, '베리', 'Berry', '#DFB7C7', 2),
    (p_user_id, '핵과', 'Stone Fruit', '#EFC9A6', 3),
    (p_user_id, '열대', 'Tropical', '#CBE6B8', 4),
    (p_user_id, '사과·배', 'Orchard', '#DCE3B4', 5),
    (p_user_id, '꽃', 'Floral', '#E4CCE0', 6),
    (p_user_id, '허브', 'Herbal', '#B7D2C0', 7),
    (p_user_id, '따뜻한 향신료', 'Warm Spice', '#D8B096', 8),
    (p_user_id, '로스팅', 'Roasted', '#C0B1A0', 9),
    (p_user_id, '캐러멜·당', 'Caramel', '#EBC892', 10),
    (p_user_id, '유제품', 'Dairy', '#EEE7DC', 11),
    (p_user_id, '견과', 'Nutty', '#CDBD9E', 12),
    (p_user_id, '초콜릿', 'Chocolate', '#B9A294', 13),
    (p_user_id, '바닐라·크리미', 'Vanilla', '#F3EBC6', 14),
    (p_user_id, '발효·산미', 'Fermented', '#DAD7B8', 15),
    (p_user_id, '주류', 'Boozy', '#CDBFCB', 16);
END;
$$;

-- 5) 신규 가입 트리거 갱신: STARCH/내부 키/정렬 포함 + 향미 계열 시드
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

  RETURN NEW;
END;
$$;

-- 6) 기존 사용자 backfill (향미 계열이 없는 사용자만)
SELECT public.seed_flavour_families(id) FROM auth.users;