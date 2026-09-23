import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeLineCosts, costPerGram, overheadPerUnit, sumCostItemAssignments } from "@/lib/cost";
import type {
  Category,
  Component,
  FlavourFamily,
  Ingredient,
  IngredientFunction,
  Product,
  Tag,
} from "@/lib/pilot";
import { formatProductSizeLabel, type ProductSize } from "@/lib/product-size";
import type {
  WorkSession,
  WorkSessionFormulaVersion,
  WorkSessionMultiplierHistory,
  WorkSessionProgress,
} from "@/lib/work-session";

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> =>
      unwrap(
        await supabase
          .from("categories")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

export const tagsQuery = () =>
  queryOptions({
    queryKey: ["tags"],
    queryFn: async (): Promise<Tag[]> =>
      unwrap(await supabase.from("tags").select("*").order("name")),
  });

export interface ProductListRow extends Product {
  product_components: { count: number }[];
  product_tags: { tag_id: string }[];
}

export const productsQuery = () =>
  queryOptions({
    queryKey: ["products"],
    queryFn: async (): Promise<ProductListRow[]> =>
      unwrap(
        await supabase
          .from("products")
          .select("*, product_components(count), product_tags(tag_id)")
          .order("updated_at", { ascending: false }),
      ) as unknown as ProductListRow[],
  });

export const productQuery = (id: string) =>
  queryOptions({
    queryKey: ["products", id],
    queryFn: async (): Promise<Product> =>
      unwrap(await supabase.from("products").select("*").eq("id", id).single()),
  });

export const productTagsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_tags", productId],
    queryFn: async (): Promise<{ tag_id: string }[]> =>
      unwrap(await supabase.from("product_tags").select("tag_id").eq("product_id", productId)),
  });

export const productSizesQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_sizes", productId],
    queryFn: async (): Promise<ProductSize[]> =>
      unwrap(
        await supabase
          .from("product_sizes")
          .select("*")
          .eq("product_id", productId)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true }),
      ),
  });

export interface ProductComponentRow {
  id: string;
  sort_order: number;
  /** COMPONENT 링크일 때만 값 있음 — ingredient_id와 정확히 하나만 non-null(2026-09-23, DB 체크 제약). */
  component_id: string | null;
  components: Component | null;
  /** 재료(원물)를 배합/포뮬라 없이 바로 Product에 링크할 때 사용(예: 카카오바나나케익의 바나나 슬라이스, 2026-09-23). */
  ingredient_id: string | null;
  ingredients: Pick<
    Ingredient,
    "id" | "name" | "purchase_price" | "purchase_qty" | "purchase_unit"
  > | null;
  formula_version_id: string | null;
  quantity_g: number | null;
  /** null = 사이즈 무관(전체) 사용량. Product에 SIZES가 등록돼 있으면 사이즈별로 행이 나뉠 수 있다. */
  product_size_id: string | null;
  formula_versions: {
    id: string;
    version_number: number;
    status: FormulaVersion["status"];
    formulas: { id: string; name: string } | null;
  } | null;
}

export const productComponentsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_components", productId],
    queryFn: async (): Promise<ProductComponentRow[]> =>
      unwrap(
        await supabase
          .from("product_components")
          .select(
            "id, sort_order, component_id, components(*), ingredient_id, ingredients(id, name, purchase_price, purchase_qty, purchase_unit), formula_version_id, quantity_g, product_size_id, formula_versions(id, version_number, status, formulas(id, name))",
          )
          .eq("product_id", productId)
          .order("sort_order"),
      ) as unknown as ProductComponentRow[],
  });

/** COMPONENT의 CURRENT FORMULA 기준 g당 단가(원가 계산용) — componentId → 요약 정보. */
export interface ComponentCostInfo {
  costPerGram: number | null;
  totalGrams: number;
  hasMissingPrice: boolean;
}

export const componentCostsQuery = (componentIds: string[]) =>
  queryOptions({
    queryKey: ["component_costs", [...new Set(componentIds)].sort()],
    enabled: componentIds.length > 0,
    queryFn: async (): Promise<Record<string, ComponentCostInfo>> => {
      const ids = [...new Set(componentIds)];
      const { data, error } = await supabase
        .from("formulas")
        .select(
          "component_id, formula_versions!inner(status, formula_version_ingredients(amount, unit, ingredients(purchase_price, purchase_qty, purchase_unit)))",
        )
        .in("component_id", ids)
        .eq("formula_versions.status", "CURRENT");
      if (error) throw error;
      const map: Record<string, ComponentCostInfo> = {};
      for (const formula of (data ?? []) as unknown as {
        component_id: string | null;
        formula_versions: {
          formula_version_ingredients: {
            amount: number;
            unit: string;
            ingredients: {
              purchase_price: number | null;
              purchase_qty: number | null;
              purchase_unit: string | null;
            } | null;
          }[];
        }[];
      }[]) {
        if (!formula.component_id) continue;
        const version = formula.formula_versions[0];
        if (!version) continue;
        const result = computeLineCosts(version.formula_version_ingredients ?? []);
        map[formula.component_id] = {
          costPerGram: result.costPerGram,
          totalGrams: result.totalGrams,
          hasMissingPrice: result.hasMissingPrice,
        };
      }
      return map;
    },
  });

export const componentsQuery = () =>
  queryOptions({
    queryKey: ["components"],
    queryFn: async (): Promise<Component[]> =>
      unwrap(
        await supabase.from("components").select("*").order("updated_at", { ascending: false }),
      ),
  });

export const componentQuery = (id: string) =>
  queryOptions({
    queryKey: ["components", id],
    queryFn: async (): Promise<Component> =>
      unwrap(await supabase.from("components").select("*").eq("id", id).single()),
  });

export interface ComponentUsageRow {
  id: string;
  products: Product;
}

export const componentUsageQuery = (componentId: string | null) =>
  queryOptions({
    queryKey: ["component_usage", componentId],
    enabled: Boolean(componentId),
    queryFn: async (): Promise<ComponentUsageRow[]> => {
      if (!componentId) return [];
      const rows = unwrap(
        await supabase
          .from("product_components")
          .select("id, products(*)")
          .eq("component_id", componentId),
      ) as unknown as ComponentUsageRow[];
      // 사이즈별 사용량 행이 여러 개면 같은 Product가 중복으로 뜰 수 있어 Product 기준으로 합친다.
      const byProductId = new Map<string, ComponentUsageRow>();
      for (const row of rows) {
        if (row.products && !byProductId.has(row.products.id)) byProductId.set(row.products.id, row);
      }
      return [...byProductId.values()];
    },
  });

export interface ProductIngredientTagRow {
  id: string;
  ingredient_id: string;
  ingredients: { name: string } | null;
}

/** PRODUCT DESIGN 섹션 — 이 Product에서 선호하는 재료 태그(Ingredient Master 참조) */
export const productPreferredIngredientsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_preferred_ingredients", productId],
    queryFn: async (): Promise<ProductIngredientTagRow[]> =>
      unwrap(
        await supabase
          .from("product_preferred_ingredients")
          .select("id, ingredient_id, ingredients(name)")
          .eq("product_id", productId),
      ) as unknown as ProductIngredientTagRow[],
  });

/** PRODUCT DESIGN 섹션 — 이 Product에서 피해야 할 알레르기 재료 태그(Ingredient Master 참조) */
export const productAllergenIngredientsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_allergen_ingredients", productId],
    queryFn: async (): Promise<ProductIngredientTagRow[]> =>
      unwrap(
        await supabase
          .from("product_allergen_ingredients")
          .select("id, ingredient_id, ingredients(name)")
          .eq("product_id", productId),
      ) as unknown as ProductIngredientTagRow[],
  });

export interface IngredientRow extends Ingredient {
  ingredient_function_links: {
    function_id: string;
    ingredient_functions: IngredientFunction;
  }[];
  flavour_families: Pick<FlavourFamily, "id" | "name" | "name_en" | "color"> | null;
}

const INGREDIENT_SELECT =
  "*, flavour_families(id, name, name_en, color), ingredient_function_links(function_id, ingredient_functions(*))";

export const ingredientsQuery = () =>
  queryOptions({
    queryKey: ["ingredients"],
    queryFn: async (): Promise<IngredientRow[]> =>
      unwrap(
        await supabase.from("ingredients").select(INGREDIENT_SELECT).order("name"),
      ) as unknown as IngredientRow[],
  });

export const ingredientQuery = (id: string) =>
  queryOptions({
    queryKey: ["ingredients", id],
    queryFn: async (): Promise<IngredientRow> =>
      unwrap(
        await supabase.from("ingredients").select(INGREDIENT_SELECT).eq("id", id).single(),
      ) as unknown as IngredientRow,
  });

export interface AromaTagUsage {
  tag: string;
  count: number;
}

/**
 * 현재 유저의 재료들에서 실제 쓰인 aroma_notes 태그와 사용 재료 수.
 * 별도 마스터 테이블 없이 ingredients.aroma_notes에서 집계한다.
 */
export const aromaTagUsageQuery = () =>
  queryOptions({
    queryKey: ["aroma_tag_usage"],
    queryFn: async (): Promise<AromaTagUsage[]> => {
      const rows = unwrap(
        await supabase.from("ingredients").select("aroma_notes").not("aroma_notes", "is", null),
      );
      const counts = new Map<string, number>();
      for (const row of rows) {
        for (const tag of row.aroma_notes ?? []) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    },
  });

export const ingredientFunctionsQuery = () =>
  queryOptions({
    queryKey: ["ingredient_functions"],
    queryFn: async (): Promise<IngredientFunction[]> =>
      unwrap(
        await supabase
          .from("ingredient_functions")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 기능(INGREDIENT FUNCTION)별 사용 재료 수 */
export const ingredientFunctionUsageQuery = () =>
  queryOptions({
    queryKey: ["ingredient_function_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("ingredient_function_links").select("function_id"));
      const map: Record<string, number> = {};
      for (const row of rows) map[row.function_id] = (map[row.function_id] ?? 0) + 1;
      return map;
    },
  });

export const flavourFamiliesQuery = () =>
  queryOptions({
    queryKey: ["flavour_families"],
    queryFn: async (): Promise<FlavourFamily[]> =>
      unwrap(
        await supabase
          .from("flavour_families")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 향미 계열별 사용 재료 수 */
export const flavourFamilyUsageQuery = () =>
  queryOptions({
    queryKey: ["flavour_family_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("ingredients").select("flavour_family_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.flavour_family_id)
          map[row.flavour_family_id] = (map[row.flavour_family_id] ?? 0) + 1;
      }
      return map;
    },
  });

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}

// NOTE: `categories`는 PRODUCT 전용 taxonomy (2026-08-29 확정).
// COMPONENT는 더 이상 categories를 쓰지 않음 (technique_categories로 전환, componentUsageQuery는 아래 별도 쿼리 참고).
// INGREDIENT의 category_id는 categories FK가 남아있지만 UI 미구현 상태라 여기 usage 집계에서는 제외한다.
export interface CategoryUsage {
  products: number;
  children: number;
  total: number;
}

export const categoryUsageQuery = () =>
  queryOptions({
    queryKey: ["category_usage"],
    queryFn: async (): Promise<Record<string, CategoryUsage>> => {
      const [products, categories] = await Promise.all([
        supabase.from("products").select("category_id"),
        supabase.from("categories").select("parent_id"),
      ]);
      const map: Record<string, CategoryUsage> = {};
      const bump = (id: string | null, key: keyof CategoryUsage) => {
        if (!id) return;
        const entry =
          map[id] ??
          (map[id] = {
            products: 0,
            children: 0,
            total: 0,
          });
        (entry[key] as number) += 1;
        entry.total += 1;
      };
      for (const row of unwrap(products)) bump(row.category_id, "products");
      for (const row of unwrap(categories)) bump(row.parent_id, "children");
      return map;
    },
  });

/** COMPONENT의 technique_category 별 사용 횟수 (technique_categories 설정 화면용) */
export const componentTechniqueCategoryUsageQuery = () =>
  queryOptions({
    queryKey: ["component_technique_category_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("components").select("technique_category_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.technique_category_id)
          map[row.technique_category_id] = (map[row.technique_category_id] ?? 0) + 1;
      }
      return map;
    },
  });

export const tagUsageQuery = () =>
  queryOptions({
    queryKey: ["tag_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("product_tags").select("tag_id"));
      const map: Record<string, number> = {};
      for (const row of rows) map[row.tag_id] = (map[row.tag_id] ?? 0) + 1;
      return map;
    },
  });

/* ── PHASE 3 — MOULDS / FORMULAS ─────────────────────────────── */

import type { Formula, FormulaVersion, FormulaVersionBatch, Mould } from "@/lib/formula";

export const mouldsQuery = () =>
  queryOptions({
    queryKey: ["moulds"],
    queryFn: async (): Promise<Mould[]> =>
      unwrap(await supabase.from("moulds").select("*").order("name")),
  });

/** 몰드별 사용 횟수 (formula_versions.default_mould_id) */
export const mouldUsageQuery = () =>
  queryOptions({
    queryKey: ["mould_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("formula_versions").select("default_mould_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.default_mould_id) map[row.default_mould_id] = (map[row.default_mould_id] ?? 0) + 1;
      }
      return map;
    },
  });

/** 몰드가 아닌 제품군(가나슈/필링/크림 등)의 기준 배치 중량(g) 프리셋 — moulds와 대응 */
export type BaseWeightPreset = import("@/integrations/supabase/types").Tables<"base_weight_presets">;

export const baseWeightsQuery = () =>
  queryOptions({
    queryKey: ["base_weight_presets"],
    queryFn: async (): Promise<BaseWeightPreset[]> =>
      unwrap(await supabase.from("base_weight_presets").select("*").order("name")),
  });

/** 기준중량 프리셋별 사용 횟수 (formula_versions.default_base_weight_id) */
export const baseWeightUsageQuery = () =>
  queryOptions({
    queryKey: ["base_weight_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(
        await supabase.from("formula_versions").select("default_base_weight_id"),
      );
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.default_base_weight_id)
          map[row.default_base_weight_id] = (map[row.default_base_weight_id] ?? 0) + 1;
      }
      return map;
    },
  });

export interface FormulaListRow extends Formula {
  components: { id: string; name: string; scaling_mode: string } | null;
  formula_versions: {
    id: string;
    version_number: number;
    status: FormulaVersion["status"];
  }[];
}

export const formulasQuery = () =>
  queryOptions({
    queryKey: ["formulas"],
    queryFn: async (): Promise<FormulaListRow[]> =>
      unwrap(
        await supabase
          .from("formulas")
          .select(
            "*, components(id, name, scaling_mode), formula_versions(id, version_number, status)",
          )
          .order("updated_at", { ascending: false }),
      ) as unknown as FormulaListRow[],
  });

export const formulaQuery = (id: string) =>
  queryOptions({
    queryKey: ["formulas", id],
    queryFn: async (): Promise<Formula> =>
      unwrap(await supabase.from("formulas").select("*").eq("id", id).single()),
  });

export const formulaVersionsQuery = (formulaId: string | null) =>
  queryOptions({
    queryKey: ["formula_versions", formulaId],
    enabled: Boolean(formulaId),
    queryFn: async (): Promise<FormulaVersion[]> => {
      if (!formulaId) return [];
      return unwrap(
        await supabase
          .from("formula_versions")
          .select("*")
          .eq("formula_id", formulaId)
          .order("version_number", { ascending: true }),
      );
    },
  });

/** Formula Version마다 저장된, 이름 붙인 배수 프리셋 (예: ×2 → "8인치 시폰몰드") */
export const formulaVersionBatchesQuery = (versionId: string | null) =>
  queryOptions({
    queryKey: ["formula_version_batches", versionId],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<FormulaVersionBatch[]> => {
      if (!versionId) return [];
      return unwrap(
        await supabase
          .from("formula_version_batches")
          .select("*")
          .eq("formula_version_id", versionId)
          .order("sort_order", { ascending: true }),
      );
    },
  });

export interface VersionIngredientRow {
  id: string;
  amount: number;
  unit: string;
  sort_order: number;
  note: string | null;
  /** 'manual' | 'suggested' | 'copied' — 양의 출처 */
  amount_source: string;
  /** 표시 전용 보조 계량 (예: 3개, 1Tbsp) — %/배수 계산에는 관여하지 않는다 */
  secondary_amount: number | null;
  secondary_unit: string | null;
  ingredient_id: string;
  ingredients: IngredientRow;
}

export const versionIngredientsQuery = (versionId: string | null) =>
  queryOptions({
    queryKey: ["formula_version_ingredients", versionId],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<VersionIngredientRow[]> => {
      if (!versionId) return [];
      return unwrap(
        await supabase
          .from("formula_version_ingredients")
          .select(
            "id, amount, unit, sort_order, note, amount_source, secondary_amount, secondary_unit, ingredient_id, ingredients(*, ingredient_function_links(function_id, ingredient_functions(*)))",
          )
          .eq("formula_version_id", versionId)
          .order("sort_order"),
      ) as unknown as VersionIngredientRow[];
    },
  });

/** 특정 component들에 연결된 formula + 그 CURRENT 버전 요약 */
export const formulasByComponentQuery = (componentId: string) =>
  queryOptions({
    queryKey: ["formulas_by_component", componentId],
    queryFn: async (): Promise<FormulaListRow[]> =>
      unwrap(
        await supabase
          .from("formulas")
          .select("*, components(id, name), formula_versions(id, version_number, status)")
          .eq("component_id", componentId)
          .order("updated_at", { ascending: false }),
      ) as unknown as FormulaListRow[],
  });

/** 기준 배합 라이브러리 — component_id가 없는 재사용용 Formula (Component를 빈 배합 대신 여기서 시작할 때 사용) */
export const baseFormulaLibraryQuery = () =>
  queryOptions({
    queryKey: ["base_formula_library"],
    queryFn: async (): Promise<FormulaListRow[]> =>
      unwrap(
        await supabase
          .from("formulas")
          .select("*, components(id, name), formula_versions(id, version_number, status)")
          .is("component_id", null)
          .eq("is_base_formula", true)
          .order("updated_at", { ascending: false }),
      ) as unknown as FormulaListRow[],
  });

export interface FormulaUsageRow {
  id: string;
  amount: number;
  unit: string;
  formula_versions: {
    id: string;
    version_number: number;
    status: string;
    formulas: { id: string; name: string } | null;
  } | null;
}

/** INGREDIENT DETAIL — 이 재료가 사용된 배합(버전별) 목록 */
export const formulasByIngredientQuery = (ingredientId: string) =>
  queryOptions({
    queryKey: ["formulas_by_ingredient", ingredientId],
    queryFn: async (): Promise<FormulaUsageRow[]> =>
      unwrap(
        await supabase
          .from("formula_version_ingredients")
          .select(
            "id, amount, unit, formula_versions(id, version_number, status, formulas(id, name))",
          )
          .eq("ingredient_id", ingredientId),
      ) as unknown as FormulaUsageRow[],
  });

/* ── PHASE 4A — EXPERIMENTS / OBSERVATIONS ───────────────────── */

import type { Experiment, Observation } from "@/lib/experiment";

export interface ExperimentRow extends Experiment {
  products: { id: string; name: string } | null;
  components: { id: string; name: string } | null;
  formula_versions: {
    id: string;
    version_number: number;
    formula_id: string;
    default_mould_id: string | null;
    formulas: { id: string; name: string } | null;
  } | null;
}

const EXPERIMENT_SELECT =
  "*, products(id, name), components(id, name), formula_versions(id, version_number, formula_id, default_mould_id, formulas(id, name))";

/** COMPONENT DETAIL — 이 구성요소로 진행된 실험 목록 */
export const experimentsByComponentQuery = (componentId: string) =>
  queryOptions({
    queryKey: ["experiments_by_component", componentId],
    queryFn: async (): Promise<ExperimentRow[]> =>
      unwrap(
        await supabase
          .from("experiments")
          .select(EXPERIMENT_SELECT)
          .eq("component_id", componentId)
          .order("date", { ascending: false })
          .order("experiment_number", { ascending: false }),
      ) as unknown as ExperimentRow[],
  });

export const experimentsQuery = () =>
  queryOptions({
    queryKey: ["experiments"],
    queryFn: async (): Promise<ExperimentRow[]> =>
      unwrap(
        await supabase
          .from("experiments")
          .select(EXPERIMENT_SELECT)
          .order("date", { ascending: false })
          .order("experiment_number", { ascending: false }),
      ) as unknown as ExperimentRow[],
  });

export const experimentQuery = (id: string) =>
  queryOptions({
    queryKey: ["experiments", id],
    queryFn: async (): Promise<ExperimentRow> =>
      unwrap(
        await supabase.from("experiments").select(EXPERIMENT_SELECT).eq("id", id).single(),
      ) as unknown as ExperimentRow,
  });

/** 특정 formula version을 참조하는 실험 (EDIT 잠금 해제 경고/RELATED EXPERIMENTS) */
export const experimentsByVersionQuery = (formulaVersionId: string | null) =>
  queryOptions({
    queryKey: ["experiments_by_version", formulaVersionId],
    enabled: Boolean(formulaVersionId),
    queryFn: async (): Promise<Experiment[]> => {
      if (!formulaVersionId) return [];
      return unwrap(
        await supabase
          .from("experiments")
          .select("*")
          .eq("formula_version_id", formulaVersionId)
          .order("experiment_number", { ascending: false }),
      );
    },
  });

export const experimentsByProductQuery = (productId: string) =>
  queryOptions({
    queryKey: ["experiments_by_product", productId],
    queryFn: async (): Promise<Experiment[]> =>
      unwrap(
        await supabase
          .from("experiments")
          .select("*")
          .eq("product_id", productId)
          .order("experiment_number", { ascending: false }),
      ),
  });

/** DASHBOARD 위젯 — PLANNED/RUNNING 실험 */
export const activeExperimentsQuery = () =>
  queryOptions({
    queryKey: ["active_experiments"],
    queryFn: async (): Promise<ExperimentRow[]> =>
      unwrap(
        await supabase
          .from("experiments")
          .select(EXPERIMENT_SELECT)
          .in("status", ["PLANNED", "RUNNING"])
          .order("updated_at", { ascending: false })
          .limit(6),
      ) as unknown as ExperimentRow[],
  });

export const experimentObservationsQuery = (experimentId: string) =>
  queryOptions({
    queryKey: ["observations", experimentId],
    queryFn: async (): Promise<Observation[]> =>
      unwrap(
        await supabase
          .from("observations")
          .select("*")
          .eq("experiment_id", experimentId)
          .order("created_at", { ascending: true }),
      ),
  });

export interface RecentObservationRow extends Observation {
  experiments: { id: string; experiment_number: number | null } | null;
}

/** DASHBOARD 위젯 — 최근 관찰 */
export const recentObservationsQuery = () =>
  queryOptions({
    queryKey: ["recent_observations"],
    queryFn: async (): Promise<RecentObservationRow[]> =>
      unwrap(
        await supabase
          .from("observations")
          .select("*, experiments(id, experiment_number)")
          .order("created_at", { ascending: false })
          .limit(8),
      ) as unknown as RecentObservationRow[],
  });

export interface ProductObservationRow extends Observation {
  experiments: { id: string; experiment_number: number | null } | null;
}

/** PRODUCT DETAIL — 이 제품에 속한 모든 실험의 관찰 기록 (읽기 전용, 최신순) */
export const observationsByProductQuery = (productId: string) =>
  queryOptions({
    queryKey: ["observations_by_product", productId],
    queryFn: async (): Promise<ProductObservationRow[]> =>
      unwrap(
        await supabase
          .from("observations")
          .select("*, experiments!inner(id, experiment_number, product_id)")
          .eq("experiments.product_id", productId)
          .order("created_at", { ascending: false }),
      ) as unknown as ProductObservationRow[],
  });

/* ── PHASE 4B — PROCESS TIMELINE ─────────────────────────────── */

import type { ProcessCategory, ProcessEvent } from "@/lib/process";

export const processCategoriesQuery = () =>
  queryOptions({
    queryKey: ["process_categories"],
    queryFn: async (): Promise<ProcessCategory[]> =>
      unwrap(
        await supabase
          .from("process_categories")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 프로세스 카테고리별 사용 횟수 (process_events.category_id) */
export const processCategoryUsageQuery = () =>
  queryOptions({
    queryKey: ["process_category_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("process_events").select("category_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.category_id) map[row.category_id] = (map[row.category_id] ?? 0) + 1;
      }
      return map;
    },
  });

export interface ProcessEventRow extends ProcessEvent {
  process_categories: ProcessCategory | null;
}

export const processEventsQuery = (experimentId: string) =>
  queryOptions({
    queryKey: ["process_events", experimentId],
    queryFn: async (): Promise<ProcessEventRow[]> =>
      unwrap(
        await supabase
          .from("process_events")
          .select("*, process_categories(*)")
          .eq("experiment_id", experimentId)
          .order("started_at", { ascending: true }),
      ) as unknown as ProcessEventRow[],
  });

export interface RecentProcessEventRow extends ProcessEvent {
  process_categories: Pick<ProcessCategory, "id" | "name" | "color"> | null;
  experiments: { id: string; experiment_number: number | null } | null;
}

/** DASHBOARD 위젯 — 최근 공정 이벤트 */
export const recentProcessEventsQuery = () =>
  queryOptions({
    queryKey: ["recent_process_events"],
    queryFn: async (): Promise<RecentProcessEventRow[]> =>
      unwrap(
        await supabase
          .from("process_events")
          .select("*, process_categories(id, name, color), experiments(id, experiment_number)")
          .order("created_at", { ascending: false })
          .limit(8),
      ) as unknown as RecentProcessEventRow[],
  });

/* ── PROCESS PARAMETERS — 마스터 데이터 + 링크 테이블 (사용자 확정, 2026-08-31) ── */

import type { ProcessEventParameter, ProcessParameterDefinition } from "@/lib/process-parameters";

export const processParameterDefinitionsQuery = () =>
  queryOptions({
    queryKey: ["process_parameter_definitions"],
    queryFn: async (): Promise<ProcessParameterDefinition[]> =>
      unwrap(
        await supabase
          .from("process_parameter_definitions")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      ),
  });

/** definition별 사용 횟수 (process_event_parameters.definition_id) — usage-protected delete용 */
export const processParameterDefinitionUsageQuery = () =>
  queryOptions({
    queryKey: ["process_parameter_definition_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("process_event_parameters").select("definition_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        map[row.definition_id] = (map[row.definition_id] ?? 0) + 1;
      }
      return map;
    },
  });

export const processEventParametersQuery = (processEventId: string) =>
  queryOptions({
    queryKey: ["process_event_parameters", processEventId],
    queryFn: async (): Promise<ProcessEventParameter[]> =>
      unwrap(
        await supabase
          .from("process_event_parameters")
          .select("*")
          .eq("process_event_id", processEventId),
      ),
  });

/* ── PHASE 9 — TECHNIQUE CATEGORIES / CALIBRATION ─────────────── */

import type { TechniqueCategory } from "@/lib/technique";
import type { Method } from "@/lib/method";

export const techniqueCategoriesQuery = () =>
  queryOptions({
    queryKey: ["technique_categories"],
    queryFn: async (): Promise<TechniqueCategory[]> =>
      unwrap(
        await supabase
          .from("technique_categories")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 전체 METHOD 목록 (technique_category_id로 클라이언트에서 필터링해서 씀 — @/lib/method의 methodsForTechnique 참고) */
export const methodsQuery = () =>
  queryOptions({
    queryKey: ["methods"],
    queryFn: async (): Promise<Method[]> =>
      unwrap(
        await supabase
          .from("methods")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 특정 TECHNIQUE CATEGORY에 속한 METHOD만 (서버 필터) */
export const methodsByTechniqueCategoryQuery = (techniqueCategoryId: string | null) =>
  queryOptions({
    queryKey: ["methods_by_technique_category", techniqueCategoryId],
    enabled: Boolean(techniqueCategoryId),
    queryFn: async (): Promise<Method[]> => {
      if (!techniqueCategoryId) return [];
      return unwrap(
        await supabase
          .from("methods")
          .select("*")
          .eq("technique_category_id", techniqueCategoryId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      );
    },
  });

/** METHOD별 사용 중인 FORMULA 개수 — 삭제 보호용 (FlavourFamilyManager와 동일 패턴) */
export const methodUsageQuery = () =>
  queryOptions({
    queryKey: ["method_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("formulas").select("method_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.method_id) map[row.method_id] = (map[row.method_id] ?? 0) + 1;
      }
      return map;
    },
  });

/** 특정 기법군에 연결된 배합 — 기준 배합 먼저 */
export const formulasByTechniqueQuery = (techniqueId: string | null) =>
  queryOptions({
    queryKey: ["formulas_by_technique", techniqueId],
    enabled: Boolean(techniqueId),
    queryFn: async (): Promise<FormulaListRow[]> => {
      if (!techniqueId) return [];
      return unwrap(
        await supabase
          .from("formulas")
          .select("*, components(id, name), formula_versions(id, version_number, status)")
          .eq("technique_category_id", techniqueId)
          .order("is_base_formula", { ascending: false })
          .order("updated_at", { ascending: false }),
      ) as unknown as FormulaListRow[];
    },
  });

/** 여러 버전의 재료를 한 번에 — CALIBRATION 비교표용 */
export const versionIngredientsBulkQuery = (versionIds: string[]) =>
  queryOptions({
    queryKey: ["formula_version_ingredients_bulk", [...versionIds].sort()],
    enabled: versionIds.length > 0,
    queryFn: async (): Promise<Record<string, VersionIngredientRow[]>> => {
      if (versionIds.length === 0) return {};
      const rows = unwrap(
        await supabase
          .from("formula_version_ingredients")
          .select(
            "id, amount, unit, sort_order, note, amount_source, secondary_amount, secondary_unit, ingredient_id, formula_version_id, ingredients(*, ingredient_function_links(function_id, ingredient_functions(*)))",
          )
          .in("formula_version_id", versionIds)
          .order("sort_order"),
      ) as unknown as (VersionIngredientRow & {
        formula_version_id: string;
      })[];
      const map: Record<string, VersionIngredientRow[]> = {};
      for (const row of rows) {
        (map[row.formula_version_id] ??= []).push(row);
      }
      return map;
    },
  });

/* ── PHASE 10 — KNOWLEDGE ─────────────────────────────────────── */

import type { KnowledgeEntry } from "@/lib/knowledge";

/** KNOWLEDGE 탭 전체 목록 — 최신순 */
export const knowledgeEntriesQuery = () =>
  queryOptions({
    queryKey: ["knowledge_entries"],
    queryFn: async (): Promise<KnowledgeEntry[]> =>
      unwrap(
        await supabase
          .from("knowledge_entries")
          .select("*")
          .order("updated_at", { ascending: false }),
      ),
  });

/** 특정 PRODUCT에 연결된 지식만 — PRODUCT DETAIL의 KNOWLEDGE 섹션용 */
export const knowledgeEntriesByProductQuery = (productId: string | null) =>
  queryOptions({
    queryKey: ["knowledge_entries", "by_product", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<KnowledgeEntry[]> => {
      if (!productId) return [];
      return unwrap(
        await supabase
          .from("knowledge_entries")
          .select("*")
          .eq("product_id", productId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 COMPONENT에 연결된 지식만 */
export const knowledgeEntriesByComponentQuery = (componentId: string | null) =>
  queryOptions({
    queryKey: ["knowledge_entries", "by_component", componentId],
    enabled: Boolean(componentId),
    queryFn: async (): Promise<KnowledgeEntry[]> => {
      if (!componentId) return [];
      return unwrap(
        await supabase
          .from("knowledge_entries")
          .select("*")
          .eq("component_id", componentId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 INGREDIENT에 연결된 지식만 */
export const knowledgeEntriesByIngredientQuery = (ingredientId: string | null) =>
  queryOptions({
    queryKey: ["knowledge_entries", "by_ingredient", ingredientId],
    enabled: Boolean(ingredientId),
    queryFn: async (): Promise<KnowledgeEntry[]> => {
      if (!ingredientId) return [];
      return unwrap(
        await supabase
          .from("knowledge_entries")
          .select("*")
          .eq("ingredient_id", ingredientId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 TECHNIQUE CATEGORY에 연결된 지식만 */
export const knowledgeEntriesByTechniqueQuery = (techniqueId: string | null) =>
  queryOptions({
    queryKey: ["knowledge_entries", "by_technique", techniqueId],
    enabled: Boolean(techniqueId),
    queryFn: async (): Promise<KnowledgeEntry[]> => {
      if (!techniqueId) return [];
      return unwrap(
        await supabase
          .from("knowledge_entries")
          .select("*")
          .eq("technique_category_id", techniqueId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/* ── PHASE 11 — REFERENCES ────────────────────────────────────── */

import type { ReferenceEntry } from "@/lib/reference";

/** REFERENCES 탭 전체 목록 — 최신순 */
export const referenceEntriesQuery = () =>
  queryOptions({
    queryKey: ["reference_entries"],
    queryFn: async (): Promise<ReferenceEntry[]> =>
      unwrap(
        await supabase
          .from("reference_entries")
          .select("*")
          .order("updated_at", { ascending: false }),
      ),
  });

/** 특정 PRODUCT에 연결된 참고자료만 */
export const referenceEntriesByProductQuery = (productId: string | null) =>
  queryOptions({
    queryKey: ["reference_entries", "by_product", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<ReferenceEntry[]> => {
      if (!productId) return [];
      return unwrap(
        await supabase
          .from("reference_entries")
          .select("*")
          .eq("product_id", productId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 COMPONENT에 연결된 참고자료만 */
export const referenceEntriesByComponentQuery = (componentId: string | null) =>
  queryOptions({
    queryKey: ["reference_entries", "by_component", componentId],
    enabled: Boolean(componentId),
    queryFn: async (): Promise<ReferenceEntry[]> => {
      if (!componentId) return [];
      return unwrap(
        await supabase
          .from("reference_entries")
          .select("*")
          .eq("component_id", componentId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 INGREDIENT에 연결된 참고자료만 */
export const referenceEntriesByIngredientQuery = (ingredientId: string | null) =>
  queryOptions({
    queryKey: ["reference_entries", "by_ingredient", ingredientId],
    enabled: Boolean(ingredientId),
    queryFn: async (): Promise<ReferenceEntry[]> => {
      if (!ingredientId) return [];
      return unwrap(
        await supabase
          .from("reference_entries")
          .select("*")
          .eq("ingredient_id", ingredientId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/** 특정 TECHNIQUE CATEGORY에 연결된 참고자료만 */
export const referenceEntriesByTechniqueQuery = (techniqueId: string | null) =>
  queryOptions({
    queryKey: ["reference_entries", "by_technique", techniqueId],
    enabled: Boolean(techniqueId),
    queryFn: async (): Promise<ReferenceEntry[]> => {
      if (!techniqueId) return [];
      return unwrap(
        await supabase
          .from("reference_entries")
          .select("*")
          .eq("technique_category_id", techniqueId)
          .order("updated_at", { ascending: false }),
      );
    },
  });

/* ── P0 — SENSORY / YIELD / EXPERIMENT BASELINE (사용자 확정, 2026-08-30) ── */

import type { SensoryAttribute, SensoryScore } from "@/lib/sensory";

export const sensoryAttributesQuery = () =>
  queryOptions({
    queryKey: ["sensory_attributes"],
    queryFn: async (): Promise<SensoryAttribute[]> =>
      unwrap(
        await supabase
          .from("sensory_attributes")
          .select("*")
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** attribute별 사용 횟수 (experiment_sensory_scores.attribute_id) — usage-protected delete용 */
export const sensoryAttributeUsageQuery = () =>
  queryOptions({
    queryKey: ["sensory_attribute_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(await supabase.from("experiment_sensory_scores").select("attribute_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.attribute_id) map[row.attribute_id] = (map[row.attribute_id] ?? 0) + 1;
      }
      return map;
    },
  });

/** EXPERIMENT DETAIL — 이 실험의 sensory 점수 (attribute 정보 포함) */
export interface ExperimentSensoryScoreRow extends SensoryScore {
  sensory_attributes: SensoryAttribute | null;
}

export const experimentSensoryScoresQuery = (experimentId: string) =>
  queryOptions({
    queryKey: ["experiment_sensory_scores", experimentId],
    queryFn: async (): Promise<ExperimentSensoryScoreRow[]> =>
      unwrap(
        await supabase
          .from("experiment_sensory_scores")
          .select("*, sensory_attributes(*)")
          .eq("experiment_id", experimentId),
      ) as unknown as ExperimentSensoryScoreRow[],
  });

/**
 * BASELINE EXPERIMENT 선택지. excludeId가 있으면 자기 자신은 목록에서 뺀다
 * (EXPERIMENT DETAIL에서 사용). 신규 생성 화면에서는 excludeId=null로 호출한다 — 아직 자기 id가 없음.
 */
export const experimentsForBaselineQuery = (excludeId: string | null) =>
  queryOptions({
    queryKey: ["experiments_for_baseline", excludeId],
    queryFn: async (): Promise<Pick<Experiment, "id" | "experiment_number" | "date">[]> => {
      let query = supabase
        .from("experiments")
        .select("id, experiment_number, date")
        .order("experiment_number", { ascending: false });
      if (excludeId) query = query.neq("id", excludeId);
      return unwrap(await query);
    },
  });

/** 이 EXPERIMENT를 baseline으로 참조하는 다른 EXPERIMENT들 (VARIANT) — 반대 방향 조회 */
export const experimentVariantsQuery = (experimentId: string) =>
  queryOptions({
    queryKey: ["experiment_variants", experimentId],
    queryFn: async (): Promise<
      Pick<Experiment, "id" | "experiment_number" | "date" | "status">[]
    > =>
      unwrap(
        await supabase
          .from("experiments")
          .select("id, experiment_number, date, status")
          .eq("baseline_experiment_id", experimentId)
          .order("experiment_number", { ascending: false }),
      ),
  });

/* ── PRODUCTION / WEIGHING DASHBOARD — WORK SESSION ──────────────── */

export const workSessionsQuery = () =>
  queryOptions({
    queryKey: ["work_sessions"],
    queryFn: async (): Promise<WorkSession[]> =>
      unwrap(
        await supabase.from("work_sessions").select("*").order("created_at", { ascending: false }),
      ),
  });

export const workSessionQuery = (id: string) =>
  queryOptions({
    queryKey: ["work_sessions", id],
    queryFn: async (): Promise<WorkSession> =>
      unwrap(await supabase.from("work_sessions").select("*").eq("id", id).single()),
  });

export interface WorkSessionFormulaVersionRow extends WorkSessionFormulaVersion {
  formula_versions: {
    id: string;
    version_number: number;
    status: string;
    default_mould_id: string | null;
    default_base_weight_id: string | null;
    formulas: {
      id: string;
      name: string;
      component_id: string | null;
      components: { id: string; name: string; scaling_mode: string } | null;
    };
  };
}

/** Work Session에 선택된 Formula Version 목록 — Formula/Component 이름까지 join해서 표시용으로 가져온다 */
export const workSessionFormulaVersionsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["work_session_formula_versions", sessionId],
    queryFn: async (): Promise<WorkSessionFormulaVersionRow[]> =>
      unwrap(
        await supabase
          .from("work_session_formula_versions")
          .select(
            "*, formula_versions(id, version_number, status, default_mould_id, default_base_weight_id, formulas(id, name, component_id, components(id, name, scaling_mode)))",
          )
          .eq("work_session_id", sessionId)
          .order("sort_order"),
      ) as unknown as WorkSessionFormulaVersionRow[],
  });

/** Work Session의 checklist 상태 전체 (formula_version_ingredient_id 기준) */
export const workSessionProgressQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["work_session_progress", sessionId],
    queryFn: async (): Promise<WorkSessionProgress[]> =>
      unwrap(
        await supabase.from("work_session_progress").select("*").eq("work_session_id", sessionId),
      ),
  });

import type { WorkSessionTask } from "@/lib/workflow";

/** Work Session의 workflow task 목록 (sort_order 기준) */

export const workSessionTasksQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["work_session_tasks", sessionId],
    queryFn: async (): Promise<WorkSessionTask[]> =>
      unwrap(
        await supabase
          .from("work_session_tasks")
          .select("*")
          .eq("work_session_id", sessionId)
          .order("sort_order"),
      ),
  });

/**
 * WORKFLOW TASK(스텝)에 묶인 재료 줄 이름 — taskId → 그 스텝에 속한 재료명 배열(2026-09-23).
 * 예: "MERINGUE" 스텝 → ["흰자(Egg white)", "백설탕(Caster sugar)"].
 */
export const workSessionTaskIngredientsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["work_session_task_ingredients", sessionId],
    queryFn: async (): Promise<Record<string, { lineId: string; name: string }[]>> => {
      const rows = unwrap(
        await supabase
          .from("work_session_task_ingredients")
          .select(
            "task_id, formula_version_ingredient_id, formula_version_ingredients(sort_order, ingredients(name))",
          )
          .eq("work_session_id", sessionId)
          .order("sort_order", { referencedTable: "formula_version_ingredients" }),
      ) as unknown as {
        task_id: string;
        formula_version_ingredient_id: string;
        formula_version_ingredients: { ingredients: { name: string } | null } | null;
      }[];
      const map: Record<string, { lineId: string; name: string }[]> = {};
      for (const row of rows) {
        const name = row.formula_version_ingredients?.ingredients?.name ?? "—";
        (map[row.task_id] ??= []).push({ lineId: row.formula_version_ingredient_id, name });
      }
      return map;
    },
  });



/* ── PRODUCTION COST — cost_items / component/product 배정 / SETTINGS (2026-09-23) ── */

export type CostItem = import("@/integrations/supabase/types").Tables<"cost_items">;
export type CostItemCategory = CostItem["category"];

export const costItemsQuery = () =>
  queryOptions({
    queryKey: ["cost_items"],
    queryFn: async (): Promise<CostItem[]> =>
      unwrap(
        await supabase
          .from("cost_items")
          .select("*")
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

export interface CostItemHistoryRow {
  id: string;
  previous_cost: number | null;
  new_cost: number;
  note: string | null;
  changed_at: string;
}

/** COST ITEM 단가 변경 이력 — 언제/얼마로/왜 바뀌었는지(2026-09-24, "나중에 실제 운용 비용이
 * 나오면 근거와 함께 수정할 수 있도록" 요청으로 추가) */
export const costItemHistoryQuery = (costItemId: string) =>
  queryOptions({
    queryKey: ["cost_item_history", costItemId],
    queryFn: async (): Promise<CostItemHistoryRow[]> =>
      unwrap(
        await supabase
          .from("cost_item_history")
          .select("id, previous_cost, new_cost, note, changed_at")
          .eq("cost_item_id", costItemId)
          .order("changed_at", { ascending: false }),
      ),
  });

/** cost_item별 사용 횟수(component+product 배정 합산) — 삭제 보호용 */
export const costItemUsageQuery = () =>
  queryOptions({
    queryKey: ["cost_item_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const [comp, prod] = await Promise.all([
        supabase.from("component_cost_items").select("cost_item_id"),
        supabase.from("product_cost_items").select("cost_item_id"),
      ]);
      const map: Record<string, number> = {};
      for (const row of unwrap(comp)) map[row.cost_item_id] = (map[row.cost_item_id] ?? 0) + 1;
      for (const row of unwrap(prod)) map[row.cost_item_id] = (map[row.cost_item_id] ?? 0) + 1;
      return map;
    },
  });

// NOTE(2026-09-23): Component 단위(배치당) UTILITY/CONSUMABLE 배정은 폐기됐다 — 케익에 들어가는
// Component 개수만큼 배치 횟수가 무한히 배수될 수 있어 고정 기준으로 쓰기 애매하다는 사용자 판단.
// component_cost_items 테이블 자체는 남아있지만(과거 데이터 롤백 대비) 더 이상 쓰지 않는다 —
// UTILITY/CONSUMABLE도 PACKAGING과 동일하게 productCostItemsQuery(Product 단위·개당)로 배정한다.

export interface ProductCostItemRow {
  id: string;
  cost_item_id: string;
  quantity: number;
  cost_items: CostItem;
}

/** PRODUCT DETAIL — 이 Product에 배정된 PACKAGING 항목 (개당) */
export const productCostItemsQuery = (productId: string | null) =>
  queryOptions({
    queryKey: ["product_cost_items", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<ProductCostItemRow[]> => {
      if (!productId) return [];
      return unwrap(
        await supabase
          .from("product_cost_items")
          .select("id, cost_item_id, quantity, cost_items(*)")
          .eq("product_id", productId),
      ) as unknown as ProductCostItemRow[];
    },
  });

export type PilotSettings = import("@/integrations/supabase/types").Tables<"pilot_settings">;

/** SETTINGS — 월 고정비(OVERHEAD)/월 예상 케익(제품 단위) 개수. 유저당 단일 행(없으면 null). */
export const pilotSettingsQuery = () =>
  queryOptions({
    queryKey: ["pilot_settings"],
    queryFn: async (): Promise<PilotSettings | null> => {
      const { data, error } = await supabase.from("pilot_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/**
 * COST 탭 전용 집계 — 모든 Product×Size의 원가/마진/월 예상 원가를 한 번에 계산한다(2026-09-23).
 * $productId.tsx의 개별 Product 원가 계산과 동일한 규칙(사이즈 지정 행만 Raw Material에 합산,
 * UTILITY/CONSUMABLE/PACKAGING/OVERHEAD는 케익 1개당 고정 배정)을 전체 Product에 대해 반복한다.
 * 사이즈가 하나도 없는 Product는 비교 대상에서 제외한다(원가 비교는 사이즈 단위로만 의미가 있음).
 */
export interface CostDashboardRow {
  productId: string;
  productName: string;
  sizeId: string;
  sizeLabel: string;
  isDefault: boolean;
  rawCost: number | null;
  perCakeExtras: number;
  fullCost: number | null;
  hasMissingPrice: boolean;
  sellingPrice: number | null;
  margin: number | null;
  marginPct: number | null;
  monthlyUnitCount: number | null;
  monthlyCost: number | null;
}

export const costDashboardQuery = () =>
  queryOptions({
    queryKey: ["cost_dashboard"],
    queryFn: async (): Promise<CostDashboardRow[]> => {
      const [productsRes, sizesRes, linksRes, costItemsRes, settingsRes] = await Promise.all([
        supabase.from("products").select("id, name"),
        supabase.from("product_sizes").select("*"),
        supabase
          .from("product_components")
          .select(
            "product_id, product_size_id, component_id, ingredient_id, quantity_g, ingredients(purchase_price, purchase_qty, purchase_unit)",
          ),
        supabase.from("product_cost_items").select("product_id, quantity, cost_items(unit_cost)"),
        supabase.from("pilot_settings").select("*").maybeSingle(),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (sizesRes.error) throw sizesRes.error;
      if (linksRes.error) throw linksRes.error;
      if (costItemsRes.error) throw costItemsRes.error;
      if (settingsRes.error) throw settingsRes.error;

      const products = (productsRes.data ?? []) as { id: string; name: string }[];
      const sizes = (sizesRes.data ?? []) as ProductSize[];
      const links = (linksRes.data ?? []) as unknown as {
        product_id: string;
        product_size_id: string | null;
        component_id: string | null;
        ingredient_id: string | null;
        quantity_g: number | null;
        ingredients: {
          purchase_price: number | null;
          purchase_qty: number | null;
          purchase_unit: string | null;
        } | null;
      }[];

      // COMPONENT 링크의 g당 단가 — componentCostsQuery와 동일한 규칙(CURRENT formula version 기준)
      const componentIds = [
        ...new Set(links.map((l) => l.component_id).filter((id): id is string => id != null)),
      ];
      const costsByComponent: Record<string, { costPerGram: number | null; hasMissingPrice: boolean }> = {};
      if (componentIds.length > 0) {
        const { data: formulaData, error: formulaError } = await supabase
          .from("formulas")
          .select(
            "component_id, formula_versions!inner(status, formula_version_ingredients(amount, unit, ingredients(purchase_price, purchase_qty, purchase_unit)))",
          )
          .in("component_id", componentIds)
          .eq("formula_versions.status", "CURRENT");
        if (formulaError) throw formulaError;
        for (const formula of (formulaData ?? []) as unknown as {
          component_id: string | null;
          formula_versions: {
            formula_version_ingredients: {
              amount: number;
              unit: string;
              ingredients: {
                purchase_price: number | null;
                purchase_qty: number | null;
                purchase_unit: string | null;
              } | null;
            }[];
          }[];
        }[]) {
          if (!formula.component_id) continue;
          const version = formula.formula_versions[0];
          if (!version) continue;
          const result = computeLineCosts(version.formula_version_ingredients ?? []);
          costsByComponent[formula.component_id] = {
            costPerGram: result.costPerGram,
            hasMissingPrice: result.hasMissingPrice,
          };
        }
      }

      const overheadPerCake = overheadPerUnit(settingsRes.data) ?? 0;

      const costItemsByProduct: Record<string, { quantity: number; cost_items: { unit_cost: number } }[]> = {};
      for (const row of (costItemsRes.data ?? []) as unknown as {
        product_id: string;
        quantity: number;
        cost_items: { unit_cost: number } | null;
      }[]) {
        if (!row.cost_items) continue;
        (costItemsByProduct[row.product_id] ??= []).push({
          quantity: row.quantity,
          cost_items: row.cost_items,
        });
      }
      const perCakeExtrasByProduct: Record<string, number> = {};
      for (const product of products) {
        perCakeExtrasByProduct[product.id] =
          sumCostItemAssignments(costItemsByProduct[product.id] ?? []) + overheadPerCake;
      }

      // 사이즈별 Raw Material 원가 — 사이즈가 지정된 행만 합산($productId.tsx의 sumCostBySize와 동일 규칙)
      const rawCostBySize: Record<string, number> = {};
      const missingPriceBySize: Record<string, boolean> = {};
      for (const link of links) {
        if (!link.product_size_id || link.quantity_g == null) continue;
        const cpg =
          link.component_id != null
            ? (costsByComponent[link.component_id]?.costPerGram ?? null)
            : costPerGram(link.ingredients);
        if (cpg == null) {
          missingPriceBySize[link.product_size_id] = true;
          continue;
        }
        rawCostBySize[link.product_size_id] =
          (rawCostBySize[link.product_size_id] ?? 0) + Number(link.quantity_g) * cpg;
      }

      const productById = new Map(products.map((p) => [p.id, p]));
      const rows: CostDashboardRow[] = [];
      for (const size of sizes) {
        const product = productById.get(size.product_id);
        if (!product) continue;
        const hasRawCost = size.id in rawCostBySize;
        const rawCost = hasRawCost ? (rawCostBySize[size.id] ?? null) : null;
        const perCakeExtras = perCakeExtrasByProduct[product.id] ?? 0;
        const fullCost = rawCost != null ? rawCost + perCakeExtras : null;
        const sellingPrice = size.selling_price != null ? Number(size.selling_price) : null;
        const margin = fullCost != null && sellingPrice != null ? sellingPrice - fullCost : null;
        const marginPct =
          margin != null && sellingPrice && sellingPrice > 0 ? (margin / sellingPrice) * 100 : null;
        const monthlyUnitCount = size.monthly_unit_count;
        const monthlyCost =
          fullCost != null && monthlyUnitCount != null && monthlyUnitCount > 0
            ? fullCost * monthlyUnitCount
            : null;
        rows.push({
          productId: product.id,
          productName: product.name,
          sizeId: size.id,
          sizeLabel: formatProductSizeLabel(size),
          isDefault: size.is_default,
          rawCost,
          perCakeExtras,
          fullCost,
          hasMissingPrice: missingPriceBySize[size.id] ?? false,
          sellingPrice,
          margin,
          marginPct,
          monthlyUnitCount,
          monthlyCost,
        });
      }
      return rows;
    },
  });

// ---- 냉동 재고관리 (STOCK) ----

export interface StockItemRow {
  id: string;
  item_type: "PRODUCT" | "COMPONENT";
  product_size_id: string | null;
  component_id: string | null;
  unit_label: string;
  quantity: number;
  notes: string | null;
  updated_at: string;
  label: string; // 화면 표시용 이름 (Product면 "이름 · 사이즈", Component면 이름)
}

export const stockItemsQuery = () =>
  queryOptions({
    queryKey: ["stock_items"],
    queryFn: async (): Promise<StockItemRow[]> => {
      const rows = unwrap(
        await supabase
          .from("stock_items")
          .select(
            "*, product_sizes(id, shape, diameter_mm, length_mm, width_mm, height_mm, is_default, products(id, name)), components(id, name)",
          ),
      ) as unknown as Array<{
        id: string;
        item_type: "PRODUCT" | "COMPONENT";
        product_size_id: string | null;
        component_id: string | null;
        unit_label: string;
        quantity: number;
        notes: string | null;
        updated_at: string;
        product_sizes: (ProductSize & { products: { id: string; name: string } | null }) | null;
        components: Component | null;
      }>;
      return rows
        .map((r) => {
          const label =
            r.item_type === "PRODUCT" && r.product_sizes
              ? `${r.product_sizes.products?.name ?? "?"} · ${formatProductSizeLabel(r.product_sizes)}`
              : (r.components?.name ?? "?");
          return {
            id: r.id,
            item_type: r.item_type,
            product_size_id: r.product_size_id,
            component_id: r.component_id,
            unit_label: r.unit_label,
            quantity: Number(r.quantity),
            notes: r.notes,
            updated_at: r.updated_at,
            label,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });

/** 재고 항목 후보 목록 — 아직 stock_item이 없는 Product×Size / Component (신규 항목 등록용 드롭다운) */
export const stockCandidatesQuery = () =>
  queryOptions({
    queryKey: ["stock_candidates"],
    queryFn: async () => {
      const [sizesRes, componentsRes, existingRes] = await Promise.all([
        supabase.from("product_sizes").select("*, products(id, name)"),
        supabase.from("components").select("*").order("name"),
        supabase.from("stock_items").select("product_size_id, component_id"),
      ]);
      if (sizesRes.error) throw sizesRes.error;
      if (componentsRes.error) throw componentsRes.error;
      if (existingRes.error) throw existingRes.error;
      const usedSizeIds = new Set(
        (existingRes.data ?? []).map((r) => r.product_size_id).filter(Boolean),
      );
      const usedComponentIds = new Set(
        (existingRes.data ?? []).map((r) => r.component_id).filter(Boolean),
      );
      const sizes = (sizesRes.data as unknown as Array<
        ProductSize & { products: { id: string; name: string } | null }
      >)
        .filter((s) => !usedSizeIds.has(s.id))
        .map((s) => ({
          id: s.id,
          label: `${s.products?.name ?? "?"} · ${formatProductSizeLabel(s)}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      const components = (componentsRes.data as Component[])
        .filter((c) => !usedComponentIds.has(c.id))
        .map((c) => ({ id: c.id, label: c.name }));
      return { sizes, components };
    },
  });

export interface StockMovementRow {
  id: string;
  quantity_delta: number;
  reason: string;
  note: string | null;
  work_session_id: string | null;
  created_at: string;
}

export const stockMovementsQuery = (stockItemId: string | null) =>
  queryOptions({
    queryKey: ["stock_movements", stockItemId],
    enabled: Boolean(stockItemId),
    queryFn: async (): Promise<StockMovementRow[]> => {
      if (!stockItemId) return [];
      return unwrap(
        await supabase
          .from("stock_movements")
          .select("id, quantity_delta, reason, note, work_session_id, created_at")
          .eq("stock_item_id", stockItemId)
          .order("created_at", { ascending: false }),
      );
    },
  });

/** Multiplier 변경 이력 — append-only, 최신순 */
export const workSessionMultiplierHistoryQuery = (
  sessionId: string,
  formulaVersionId: string | null,
) =>
  queryOptions({
    queryKey: ["work_session_multiplier_history", sessionId, formulaVersionId],
    enabled: Boolean(formulaVersionId),
    queryFn: async (): Promise<WorkSessionMultiplierHistory[]> => {
      if (!formulaVersionId) return [];
      return unwrap(
        await supabase
          .from("work_session_multiplier_history")
          .select("*")
          .eq("work_session_id", sessionId)
          .eq("formula_version_id", formulaVersionId)
          .order("applied_at", { ascending: false }),
      );
    },
  });
