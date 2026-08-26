CREATE TABLE public.technique_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.technique_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_en text,
  suggested_base_formula text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.technique_categories TO authenticated;
GRANT ALL ON public.technique_categories TO service_role;

ALTER TABLE public.technique_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own technique categories"
ON public.technique_categories FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER technique_categories_updated_at
BEFORE UPDATE ON public.technique_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX technique_categories_user_parent_idx ON public.technique_categories(user_id, parent_id, sort_order);

-- formulas 연결 필드
ALTER TABLE public.formulas
  ADD COLUMN technique_category_id uuid REFERENCES public.technique_categories(id) ON DELETE SET NULL,
  ADD COLUMN is_base_formula boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_leaf_technique_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.technique_category_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.technique_categories c
      WHERE c.parent_id = NEW.technique_category_id
    ) THEN
      RAISE EXCEPTION 'technique_category_id must reference a leaf technique category';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER formulas_leaf_technique_category
BEFORE INSERT OR UPDATE ON public.formulas
FOR EACH ROW EXECUTE FUNCTION public.enforce_leaf_technique_category();

-- 시드 함수
CREATE OR REPLACE FUNCTION public.seed_technique_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_parent uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- (name, name_en, suggested, notes, sort_order, parent_name, depth)
      ('케이크','Cake',NULL,NULL,1,NULL,0),
      ('페이스트리','Pastry',NULL,NULL,2,NULL,0),
      ('머랭','Meringue Group',NULL,NULL,3,NULL,0),
      ('크림 · 필링','Cream · Filling',NULL,NULL,4,NULL,0),

      ('폼 케이크','Foam Cake','Genoise','Whole Egg Foam → Air Incorporation → Protein/Sugar Stabilisation → Baking',1,'케이크',1),
      ('오일폼 케이크','Oil Foam Cake','Chiffon','Meringue + Yolk/Liquid/Oil Emulsion + Flour Structure — AERATION↑ MOISTURE↑, FAT는 있지만 Creaming Cake와 다른 구조',2,'케이크',1),
      ('크리밍 케이크','Creaming Cake','Butter Cake','Butter+Sugar Creaming → Air Incorporation → Egg Emulsion → Flour Structure',3,'케이크',1),
      ('멜티드팻 케이크','Melted-Fat Cake','Madeleine / Financier','Melted Fat + Egg/Sugar Batter + Flour/Solid + Chemical Leavening — Creaming Cake와 별도 Context',4,'케이크',1),

      ('쇼트 도우','Short Dough','Pâte Sucrée','Fat inhibition + low water + controlled structure',1,'페이스트리',1),
      ('슈','Choux','Pâte à Choux','Starch gelatinisation → steam expansion → egg coagulation',2,'페이스트리',1),
      ('라미네이트 이스트 도우','Laminated Yeast','Croissant','Gluten + fermentation + layered fat',3,'페이스트리',1),
      ('엔리치드 이스트 도우','Enriched Yeast','Brioche','Gluten + fermentation + high fat/egg enrichment',4,'페이스트리',1),

      ('머랭 (기법)','Meringue','French Meringue','Protein foam + sugar stabilization',1,'머랭',1),
      ('아몬드 머랭','Almond Meringue','Macaron','Meringue + nut solids + controlled structure',2,'머랭',1),

      ('휘핑크림','Whipped Cream','Chantilly','Fat → emulsion → whipping → air. 주요기능 FAT/AERATION/WATER/SWEETENER/BULKING, Balance TENDERIZER/MOISTENER — 크림 계열의 가장 가벼운 기준점',1,'크림 · 필링',1),
      ('커스터드 베이스 크림','Custard-Based Cream','Pastry Cream / Diplomat / Mousseline','Pastry Cream=protein coagulation+starch gelatinisation(STRUCTURE 중심). Diplomat=Pastry Cream+Chantilly(중간적 구조). Mousseline=Pastry Cream+Butter(FAT·BODY·STRUCTURE↑, AERATION↓)',2,'크림 · 필링',1),
      ('버터크림','Buttercream',NULL,'하위 서브타입에서 관리 — 이 항목 자체엔 기준 배합 없음',3,'크림 · 필링',1),
      ('초콜릿 베이스 크림','Chocolate-Based Cream','Whipped Ganache (Chocolate + Cream)','emulsion → cooling → whipping. 다크/밀크/화이트는 별도 Category 아님 — 하나의 Context 안에서 초콜릿 종류별 Formula variation으로 처리',4,'크림 · 필링',1),

      ('스위스 머랭 버터크림','Swiss Meringue Buttercream',NULL,NULL,1,'버터크림',2),
      ('이탈리안 머랭 버터크림','Italian Meringue Buttercream',NULL,NULL,2,'버터크림',2),
      ('프렌치 버터크림','French Buttercream',NULL,NULL,3,'버터크림',2),
      ('아메리칸 버터크림','American Buttercream',NULL,NULL,4,'버터크림',2),
      ('크림치즈 버터크림','Cream Cheese Buttercream','Butter, Cream Cheese, Icing Sugar','Butter emulsion + cream cheese protein/water/acid — FAT/EMULSIFIER/STRUCTURE/PROTEIN/WATER/ACID/SWEETENER 동시 작동',5,'버터크림',2),
      ('머랭 크림치즈 버터크림','Meringue Cream Cheese Buttercream','Meringue + Butter + Cream Cheese','Cream Cheese Buttercream의 변형 — 일반형과 동일 취급하면 안 됨 (Meringue의 AERATION/STRUCTURE 추가)',6,'버터크림',2)
    ) AS t(name, name_en, suggested, notes, sort_order, parent_name, depth)
    ORDER BY depth, sort_order
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.technique_categories c
      WHERE c.user_id = p_user_id AND c.name = r.name
    ) THEN
      CONTINUE;
    END IF;

    v_parent := NULL;
    IF r.parent_name IS NOT NULL THEN
      SELECT c.id INTO v_parent FROM public.technique_categories c
      WHERE c.user_id = p_user_id AND c.name = r.parent_name
      LIMIT 1;
    END IF;

    INSERT INTO public.technique_categories
      (user_id, parent_id, name, name_en, suggested_base_formula, notes, sort_order)
    VALUES
      (p_user_id, v_parent, r.name, r.name_en, r.suggested, r.notes, r.sort_order);
  END LOOP;
END;
$$;

-- 신규 가입 시 자동 시드
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

  RETURN NEW;
END;
$function$;

-- 기존 사용자 backfill
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_technique_categories(u);
  END LOOP;
END $$;