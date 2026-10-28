import { queryOptions } from "@tanstack/react-query";
import { summarizeUsage } from "@/lib/product-usage";
import { productUsageCost, type VersionCostInfo } from "@/lib/cost";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  analyzeBatch,
  computeLineCosts,
  costPerGram,
  overheadPerUnit,
  sumCostItemAssignments,
} from "@/lib/cost";
import type {
  Category,
  Component,
  FlavourFamily,
  Ingredient,
  IngredientFunction,
  IngredientGroup,
  Product,
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

/** PRODUCTS 목록/상세에서 "연결된 주문" 표시용 최소 필드(2026-10-12 사용자 요청). */
export interface ProductOrderRow {
  id: string;
  order_number: string;
  recipient: string | null;
  status: string;
  pickup_at: string | null;
  event_date: string | null;
  customers: { id: string; name: string | null } | null;
}

export interface ProductListRow extends Product {
  product_components: { count: number }[];
  orders: ProductOrderRow[];
}

/**
 * 주문의 "배송/픽업 날짜" 정렬 키 — orders 목록(index.tsx)과 동일한 규칙:
 * pickup_at 있으면 그걸, 없으면 event_date(자정)를 쓴다. 둘 다 없으면 null(정렬 시 맨 뒤).
 */
export function orderDeliverDateKey(order: {
  pickup_at: string | null;
  event_date: string | null;
}): string | null {
  return order.pickup_at ?? (order.event_date ? `${order.event_date}T00:00:00` : null);
}

export const productsQuery = () =>
  queryOptions({
    queryKey: ["products"],
    queryFn: async (): Promise<ProductListRow[]> =>
      unwrap(
        await supabase
          .from("products")
          .select(
            "*, product_components(count), orders(id, order_number, recipient, status, pickup_at, event_date, customers(id, name))",
          )
          .order("updated_at", { ascending: false }),
      ) as unknown as ProductListRow[],
  });

/** 특정 Product에 연결된 주문 목록 — Product 상세 페이지 ORDERS 섹션용(2026-10-12 사용자 요청). */
export const ordersByProductQuery = (productId: string) =>
  queryOptions({
    queryKey: ["orders", "by_product", productId],
    queryFn: async (): Promise<OrderListRow[]> =>
      unwrap(
        await supabase
          .from("orders")
          .select("*, customers(id, name), products(id, name)")
          .eq("product_id", productId)
          .order("created_at", { ascending: false }),
      ) as unknown as OrderListRow[],
  });

export const productQuery = (id: string) =>
  queryOptions({
    queryKey: ["products", id],
    queryFn: async (): Promise<Product> =>
      unwrap(await supabase.from("products").select("*").eq("id", id).single()),
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
          "component_id, formula_versions!inner(status, version_number, formula_version_ingredients(amount, unit, ingredients(purchase_price, purchase_qty, purchase_unit)))",
        )
        .in("component_id", ids)
        .in("formula_versions.status", ["CURRENT", "DRAFT", "TESTING"]);
      if (error) throw error;
      const map: Record<string, ComponentCostInfo> = {};
      for (const formula of (data ?? []) as unknown as {
        component_id: string | null;
        formula_versions: {
          status: string;
          version_number: number;
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
        // CURRENT 우선, 없으면 최신 DRAFT/TESTING (2026-09-24 사용자 확정)
        const version = pickEffectiveFormulaVersion(formula.formula_versions);
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

/** Cost only the exact Formula Version selected on each usage row. */
export const versionCostsQuery = (versionIds: string[]) =>
  queryOptions({
    queryKey: ["formula_version_costs", [...new Set(versionIds)].sort()],
    enabled: versionIds.length > 0,
    queryFn: () => fetchVersionCosts(versionIds),
  });

async function fetchVersionCosts(versionIds: string[]): Promise<Record<string, VersionCostInfo>> {
  const ids = [...new Set(versionIds)];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from("formula_versions")
    .select(
      "id, formulas(component_id), formula_version_ingredients(amount, unit, ingredients(purchase_price, purchase_qty, purchase_unit))",
    )
    .in("id", ids);
  if (error) throw error;
  const result: Record<string, VersionCostInfo> = {};
  for (const row of data ?? []) {
    const diagnostic = analyzeBatch(row.formula_version_ingredients ?? []);
    result[row.id] = {
      componentId: row.formulas?.component_id ?? null,
      costPerGram:
        diagnostic.hasMissingPrice || diagnostic.hasUnconvertibleUnit || diagnostic.isEmpty
          ? null
          : diagnostic.costPerGram,
      hasMissingPrice:
        diagnostic.hasMissingPrice || diagnostic.hasUnconvertibleUnit || diagnostic.isEmpty,
    };
  }
  return result;
}

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
        if (row.products && !byProductId.has(row.products.id))
          byProductId.set(row.products.id, row);
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
  ingredient_groups: Pick<IngredientGroup, "id" | "name" | "name_en" | "color"> | null;
}

const INGREDIENT_SELECT =
  "*, flavour_families(id, name, name_en, color), ingredient_groups(id, name, name_en, color), ingredient_function_links(function_id, ingredient_functions(*))";

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

export const ingredientGroupsQuery = () =>
  queryOptions({
    queryKey: ["ingredient_groups"],
    queryFn: async (): Promise<IngredientGroup[]> =>
      unwrap(
        await supabase
          .from("ingredient_groups")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ),
  });

/** 재료 그룹(INGREDIENT GROUP)별 사용 재료 수 */
export const ingredientGroupUsageQuery = () =>
  queryOptions({
    queryKey: ["ingredient_group_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(
        await supabase.from("ingredients").select("group_id").not("group_id", "is", null),
      );
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.group_id) map[row.group_id] = (map[row.group_id] ?? 0) + 1;
      }
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

/* ── PHASE 3 — MOULDS / FORMULAS ─────────────────────────────── */

import { pickEffectiveFormulaVersion } from "@/lib/formula";
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
export type BaseWeightPreset =
  import("@/integrations/supabase/types").Tables<"base_weight_presets">;

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
      const rows = unwrap(await supabase.from("formula_versions").select("default_base_weight_id"));
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.default_base_weight_id)
          map[row.default_base_weight_id] = (map[row.default_base_weight_id] ?? 0) + 1;
      }
      return map;
    },
  });

export interface FormulaListRow extends Formula {
  components: {
    id: string;
    name: string;
    scaling_mode: string;
    /** 이 Component를 세션에 추가할 때 자동으로 깔아줄 기본 WORKFLOW TEMPLATE(2026-09-24) */
    default_workflow_template_id: string | null;
    auto_apply_default_workflow: boolean;
    /** 2026-10-12 사용자 요청: SHEET/CREAM/FILLING 자동 분류용 — resolveSlotGroup()과 함께 사용. */
    technique_category_id: string | null;
  } | null;
  formula_versions: {
    id: string;
    version_number: number;
    status: FormulaVersion["status"];
    default_mould_id: string | null;
    default_base_weight_id: string | null;
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
            "*, components(id, name, scaling_mode, default_workflow_template_id, auto_apply_default_workflow, technique_category_id), formula_versions(id, version_number, status, default_mould_id, default_base_weight_id, default_capacity_id)",
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

/** 배수 프리셋 열에 몰드를 연결한 경우 — 그 몰드의 기준중량까지 같이 가져와서
 * 배수를 "몰드 ×개수" 기준으로 자동 계산할 수 있게 한다(2026-09-24). */
export interface FormulaVersionBatchRow extends FormulaVersionBatch {
  moulds: {
    id: string;
    name: string;
    shape_size: string | null;
    reference_weight_g: number | null;
  } | null;
}

/** Formula Version마다 저장된, 이름 붙인 배수 프리셋 (예: ×2 → "8인치 시폰몰드") */
export const formulaVersionBatchesQuery = (versionId: string | null) =>
  queryOptions({
    queryKey: ["formula_version_batches", versionId],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<FormulaVersionBatchRow[]> => {
      if (!versionId) return [];
      return unwrap(
        await supabase
          .from("formula_version_batches")
          .select("*, moulds(id, name, shape_size, reference_weight_g)")
          .eq("formula_version_id", versionId)
          .order("sort_order", { ascending: true }),
      ) as unknown as FormulaVersionBatchRow[];
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
          .select(
            "*, components(id, name, scaling_mode, default_workflow_template_id, auto_apply_default_workflow), formula_versions(id, version_number, status, default_mould_id, default_base_weight_id, default_capacity_id)",
          )
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

/* ── PRODUCTION / WEIGHING DASHBOARD — WORK SESSION ──────────────── */

export const workSessionsQuery = () =>
  queryOptions({
    queryKey: ["work_sessions"],
    queryFn: async (): Promise<WorkSession[]> =>
      unwrap(
        await supabase.from("work_sessions").select("*").order("created_at", { ascending: false }),
      ),
  });

// ── PRODUCTION 메인보드 DASHBOARD(2026-10-22) ─────────────────────────────────
// 작업 블록(work_blocks) = 오더의 CORE 컴포넌트 행을 날짜/시간에 배정한 조각. 같은 컴포넌트를 여러
// 블록(1차/2차 …)으로 분할할 수 있고, 블록 1개 = WANN 플래너 TASK 1개.
export type WorkBlock = Tables<"work_blocks">;

export const workBlocksQuery = () =>
  queryOptions({
    queryKey: ["work_blocks"],
    queryFn: async (): Promise<WorkBlock[]> =>
      unwrap(
        await supabase
          .from("work_blocks")
          .select("*")
          .order("block_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ),
  });

// ── DAILY TASKS(2026-10-22) ──────────────────────────────────────────────────
// 케이크 제품/컴포넌트와 무관한 작업. 라이브러리(daily_task_templates)는 SETTINGS에서 관리하고,
// 대시보드에 올린 건 daily_tasks 한 줄 = WANN 플래너 TASK 1개(그 날짜의 Daily Project 하위).
export type DailyTaskTemplate = Tables<"daily_task_templates">;
export type DailyTask = Tables<"daily_tasks">;

export const dailyTaskTemplatesQuery = () =>
  queryOptions({
    queryKey: ["daily_task_templates"],
    queryFn: async (): Promise<DailyTaskTemplate[]> =>
      unwrap(
        await supabase
          .from("daily_task_templates")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ),
  });

export const dailyTasksQuery = () =>
  queryOptions({
    queryKey: ["daily_tasks"],
    queryFn: async (): Promise<DailyTask[]> =>
      unwrap(
        await supabase
          .from("daily_tasks")
          .select("*")
          .order("task_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ),
  });

/** 대시보드가 다루는 "오더의 컴포넌트" 한 줄 — 오더에 연결된 WORK SESSION의 CORE 행. */
export interface DashboardComponentRow {
  id: string; // work_session_formula_versions.id
  multiplier: number;
  formulaVersionId: string;
  slot: string | null;
  work_session_id: string;
  planner_task_id: string | null;
  componentName: string;
  /** 기존 컴포넌트를 복사해 만들었고 레시피(재료)를 아직 하나도 수정하지 않음 → 빨간 ! 경고 */
  unmodifiedCopy: boolean;
  formulaId: string | null;
  componentId: string | null;
  /** 컴포넌트의 기본 WORKFLOW TEMPLATE(자동 적용이 켜진 경우만) — 단계가 곧 작업 블록 단위가 된다 */
  templateId: string | null;
  sessionStatus: string;
  order: {
    id: string;
    order_number: string;
    status: string;
    pickupAt: string | null;
    eventDate: string | null;
    productName: string | null;
    customerName: string | null;
  };
}

export const dashboardComponentsQuery = () =>
  queryOptions({
    queryKey: ["dashboard_components"],
    queryFn: async (): Promise<DashboardComponentRow[]> => {
      const data = unwrap(
        await supabase
          .from("work_session_formula_versions")
          .select(
            "id, multiplier, formula_version_id, slot, work_session_id, planner_task_id, sort_order, formula_versions(id, formula_version_ingredients(amount_source), formulas(id, name, derived_from_formula_id, components(id, name, default_workflow_template_id, auto_apply_default_workflow))), work_sessions!inner(id, status, order_id, orders(id, order_number, status, pickup_at, event_date, products(name), customers(name)))",
          )
          .eq("kind", "CORE")
          .order("sort_order", { ascending: true }),
      ) as unknown as {
        id: string;
        multiplier: number;
        formula_version_id: string;
        slot: string | null;
        work_session_id: string;
        planner_task_id: string | null;
        formula_versions: {
          formula_version_ingredients: { amount_source: string }[];
          formulas: {
            id: string;
            name: string;
            derived_from_formula_id: string | null;
            components: {
              id: string;
              name: string;
              default_workflow_template_id: string | null;
              auto_apply_default_workflow: boolean;
            } | null;
          } | null;
        } | null;
        work_sessions: {
          status: string;
          order_id: string | null;
          orders: {
            id: string;
            order_number: string;
            status: string;
            pickup_at: string | null;
            event_date: string | null;
            products: { name: string } | null;
            customers: { name: string | null } | null;
          } | null;
        } | null;
      }[];
      const rows: DashboardComponentRow[] = [];
      for (const r of data) {
        const order = r.work_sessions?.orders;
        if (!order) continue; // 오더에 연결 안 된 세션은 대시보드 대상이 아니다
        const formula = r.formula_versions?.formulas ?? null;
        rows.push({
          id: r.id,
          multiplier: Number(r.multiplier),
          formulaVersionId: r.formula_version_id,
          slot: r.slot,
          work_session_id: r.work_session_id,
          planner_task_id: r.planner_task_id,
          componentName: formula?.components?.name ?? formula?.name ?? "—",
          formulaId: formula?.id ?? null,
          componentId: formula?.components?.id ?? null,
          unmodifiedCopy:
            !!formula?.derived_from_formula_id &&
            (r.formula_versions?.formula_version_ingredients ?? []).every(
              (i) => i.amount_source === "copied",
            ),
          templateId: formula?.components?.auto_apply_default_workflow
            ? (formula.components.default_workflow_template_id ?? null)
            : null,
          sessionStatus: r.work_sessions?.status ?? "PLANNED",
          order: {
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            pickupAt: order.pickup_at,
            eventDate: order.event_date,
            productName: order.products?.name ?? null,
            customerName: order.customers?.name ?? null,
          },
        });
      }
      return rows;
    },
  });

export const workSessionQuery = (id: string) =>
  queryOptions({
    queryKey: ["work_sessions", id],
    queryFn: async (): Promise<WorkSession> =>
      unwrap(await supabase.from("work_sessions").select("*").eq("id", id).single()),
  });

/* ── PRODUCTION EFFICIENCY (2026-10-06) ──────────────────────────
 * "노동비 계산"이 아니라 "시간당 몇 개 만드는지 / 어디서 시간을 줄일 수 있는지"가 목적.
 * Target Time은 아직 없음 — 실측 데이터가 먼저 쌓이고 나중에 사용자가 직접 설정한다. */

export interface ComponentGramsRow {
  component_id?: string | null;
  ingredient_id?: string | null;
  formula_version_id: string | null;
  quantity_g: number | null;
  product_size_id: string | null;
}

/** 이 Product의 Formula Version별 "1단위당 필요한 양(g)" 원본 행 — Size별로 다를 수 있어서
 * Size 매칭은 호출부(lib/production-efficiency.ts의 buildGramsPerUnitMap)에서 세션마다
 * 각자의 product_size_id로 계산한다(세션이 여러 Size를 섞어 쓸 수 있으므로). */
export const productComponentGramsRowsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_component_grams_rows", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<ComponentGramsRow[]> =>
      unwrap(
        await supabase
          .from("product_components")
          .select("component_id, ingredient_id, formula_version_id, quantity_g, product_size_id")
          .eq("product_id", productId),
      ),
  });

export interface WorkSessionEfficiencyJoinRow extends WorkSession {
  work_session_tasks: Tables<"work_session_tasks">[];
}

/** 특정 Product에 연결된(Batch size가 지정된) Work Session들 — PRODUCTS EFFICIENCY 섹션용. */
export const efficiencySessionsByProductQuery = (productId: string) =>
  queryOptions({
    queryKey: ["efficiency_sessions", "by_product", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<WorkSessionEfficiencyJoinRow[]> =>
      unwrap(
        await supabase
          .from("work_sessions")
          .select("*, work_session_tasks(*)")
          .eq("product_id", productId)
          .not("target_unit_count", "is", null)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ) as unknown as WorkSessionEfficiencyJoinRow[],
  });

export interface WorkSessionEfficiencyWithProductRow extends WorkSessionEfficiencyJoinRow {
  products: { id: string; name: string } | null;
}

/** Product가 지정된 모든 Work Session — EFFICIENCY 대시보드(전체 제품 비교)용. */
export const allEfficiencySessionsQuery = () =>
  queryOptions({
    queryKey: ["efficiency_sessions", "all"],
    queryFn: async (): Promise<WorkSessionEfficiencyWithProductRow[]> =>
      unwrap(
        await supabase
          .from("work_sessions")
          .select("*, work_session_tasks(*), products(id, name)")
          .not("target_unit_count", "is", null)
          .not("product_id", "is", null)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ) as unknown as WorkSessionEfficiencyWithProductRow[],
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
      components: {
        id: string;
        name: string;
        scaling_mode: string;
        default_workflow_template_id: string | null;
        auto_apply_default_workflow: boolean;
      } | null;
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
            "*, formula_versions(id, version_number, status, default_mould_id, default_base_weight_id, default_capacity_id, formulas(id, name, component_id, components(id, name, scaling_mode, default_workflow_template_id, auto_apply_default_workflow)))",
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

/**
 * WORKFLOW TASK의 선행 TASK 목록 — taskId → 그 TASK가 이어받는 이전 단계 TASK(id+이름) 배열.
 * 한 TASK가 여러 이전 단계를 합쳐서 다음 단계로 진행할 수 있다(예: Yolk mixture + Meringue →
 * Fold & Bake). 순서 표시용이던 predecessor_task_id(단일 FK)와 별개로, 다중 선행 관계는 이
 * 조인 테이블로 관리한다(2026-09-24).
 */
export const workSessionTaskPredecessorsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["work_session_task_predecessors", sessionId],
    queryFn: async (): Promise<Record<string, { taskId: string; name: string }[]>> => {
      const rows = unwrap(
        await supabase
          .from("work_session_task_predecessors")
          .select(
            "task_id, predecessor_task_id, predecessor:work_session_tasks!predecessor_task_id(task_name)",
          )
          .eq("work_session_id", sessionId),
      ) as unknown as {
        task_id: string;
        predecessor_task_id: string;
        predecessor: { task_name: string } | null;
      }[];
      const map: Record<string, { taskId: string; name: string }[]> = {};
      for (const row of rows) {
        (map[row.task_id] ??= []).push({
          taskId: row.predecessor_task_id,
          name: row.predecessor?.task_name ?? "—",
        });
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

export interface TaskTypeColorRow {
  task_type: string;
  color_class: string;
}

/** 사용자가 TASK TYPE별로 직접 고른 색상 매핑 — 없으면 taskTypeColorClass()가 해시 기반 기본색으로 대체(2026-09-23) */
export const taskTypeColorsQuery = () =>
  queryOptions({
    queryKey: ["task_type_colors"],
    queryFn: async (): Promise<TaskTypeColorRow[]> =>
      unwrap(await supabase.from("task_type_colors").select("task_type, color_class")),
  });

export interface TaskTypeDefinitionRow {
  id: string;
  key: string;
  name: string;
  has_observation_fields: boolean;
  sort_order: number;
}

/** 사용자가 SETTINGS에서 직접 관리하는 TASK TYPE 이름 목록(2026-09-30) — 코드에 하드코딩된
 * TASK_TYPE_SUGGESTIONS는 이 테이블이 비어있는(아직 한 번도 저장 안 한) 사용자를 위한 기본값일 뿐. */
export const taskTypeDefinitionsQuery = () =>
  queryOptions({
    queryKey: ["task_type_definitions"],
    queryFn: async (): Promise<TaskTypeDefinitionRow[]> =>
      unwrap(
        await supabase
          .from("task_type_definitions")
          .select("id, key, name, has_observation_fields, sort_order")
          .order("sort_order", { ascending: true }),
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

// ── ORDERS / CUSTOMERS (2026-10-05) ──────────────────────────────────────
// Instagram DM으로 들어오는 주문을 놓치지 않기 위한 최소 구조.
// Product/Component/Formula 구조는 전혀 건드리지 않고, orders.product_id로만 참조한다.

export type Customer = import("@/integrations/supabase/types").Tables<"customers">;
export type Order = import("@/integrations/supabase/types").Tables<"orders">;

// 2026-10-06 사용자 요청: "NEW"만 있던 단일 상태를 CS 진행 단계별 7단계로 재정의.
// INTAKE(접수) → CONFIRMED(확정) → DESIGN(디자인 미팅) → PRODUCTION(제작) →
// FINAL_TOUCH(최종 QC/포장) → DELIVERY(픽업/배달) → COMPLETED(완료).
// DB 값은 공백 없이 FINAL_TOUCH로 저장하고, 화면 표시는 orderStatusLabel()로 공백 변환한다.
export const ORDER_STATUSES = [
  "INTAKE",
  "CONFIRMED",
  "DESIGN",
  "PRODUCTION",
  "FINAL_TOUCH",
  "DELIVERY",
  "COMPLETED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function orderStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

// Status 색상 기본값(= 사용자가 SETTINGS에서 바꾸지 않았을 때 쓰는 팔레트) — SHCS 톤에 맞춰
// 채도를 낮춘 색으로 구성. 실제 적용 색상은 orderStatusColor()로 pilot_settings.order_status_colors
// (사용자 커스텀값)를 우선하고, 없으면 이 기본값을 쓴다 — 색상은 코드에 하드코딩하지 않고
// 항상 이 중앙 설정값을 거쳐 조회한다(2026-10-06 사용자 요청: Status/Color 분리).
export const DEFAULT_ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  INTAKE: "#9ca3af",
  CONFIRMED: "#60a5fa",
  DESIGN: "#a78bfa",
  PRODUCTION: "#fb923c",
  FINAL_TOUCH: "#fbbf24",
  DELIVERY: "#34d399",
  COMPLETED: "#374151",
};

export function orderStatusColor(
  colors: Record<string, string> | null | undefined,
  status: string,
): string {
  return (
    (colors && colors[status]) || DEFAULT_ORDER_STATUS_COLORS[status as OrderStatus] || "#9ca3af"
  );
}

// ── ORDERS 필드 정형화(2026-10-06, 사용자 요청: 통계/분석 가능한 구조) ──────────
// Occasion = 왜 주문하는가, Recipient Relationship = 누구에게 주는가 — 반드시 분리 관리.
// 스펠링/대소문자는 사용자가 지정한 목록을 그대로 쓴다(DB enum과 1:1 일치).
export const ORDER_OCCASIONS = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Engagement",
  "Graduation",
  "Promotion",
  "Retirement",
  "Achievement",
  "New Baby",
  "Housewarming",
  "Thank You",
  "Congratulations",
  "Farewell",
  "Corporate Event",
  "Client Gift",
  "Team Celebration",
  "Mother's Day",
  "Father's Day",
  "Valentine's Day",
  "Christmas",
  "Easter",
  "Lunar New Year",
  "Just Because",
  "Other",
] as const;
export type OrderOccasion = (typeof ORDER_OCCASIONS)[number];

// 2026-10-20 사용자 요청: "주문 받을때부터 occasion 드롭다운을 formality 기준으로
// Family&Friend / Business&Official 로 2단계 구분해서 간추려줘, 이벤트별로도 구분해야해".
// enum 값 자체(위 ORDER_OCCASIONS)는 그대로 유지 — 줄이지 않고 그룹 태그만 추가해서, 기존
// 주문 데이터는 손실/마이그레이션 없이 그대로 재분류된다. "Other"는 두 그룹 모두에서 항상
// 선택 가능하도록 UI에서 별도 처리한다(아래 맵의 값은 참고용 기본값).
export const ORDER_OCCASION_CATEGORIES = ["Family & Friend", "Business & Official"] as const;
export type OrderOccasionCategory = (typeof ORDER_OCCASION_CATEGORIES)[number];

export const ORDER_OCCASION_CATEGORY_MAP: Record<OrderOccasion, OrderOccasionCategory> = {
  Birthday: "Family & Friend",
  Anniversary: "Family & Friend",
  Wedding: "Family & Friend",
  Engagement: "Family & Friend",
  Graduation: "Family & Friend",
  "New Baby": "Family & Friend",
  Housewarming: "Family & Friend",
  "Mother's Day": "Family & Friend",
  "Father's Day": "Family & Friend",
  "Valentine's Day": "Family & Friend",
  Christmas: "Family & Friend",
  Easter: "Family & Friend",
  "Lunar New Year": "Family & Friend",
  "Just Because": "Family & Friend",
  Promotion: "Business & Official",
  Retirement: "Business & Official",
  Achievement: "Business & Official",
  "Thank You": "Business & Official",
  Congratulations: "Business & Official",
  Farewell: "Business & Official",
  "Corporate Event": "Business & Official",
  "Client Gift": "Business & Official",
  "Team Celebration": "Business & Official",
  Other: "Family & Friend",
};

export const ORDER_RECIPIENT_RELATIONSHIPS = [
  "Self",
  "Partner",
  "Spouse",
  "Family",
  "Friend",
  "Colleague",
  "Client",
  "Customer",
  "Team / Coworkers",
  "Business / Organisation",
  "Other",
] as const;
export type OrderRecipientRelationship = (typeof ORDER_RECIPIENT_RELATIONSHIPS)[number];

// 2026-10-20 사용자 요청: 주문서(secrethusband.org)와 같은 선택지/문구로 맞춤. 나머지 enum 값은
// 기존 주문 데이터 보존용으로만 남겨둔다(이미 그 값이 저장된 주문에서만 보임).
export const ORDER_RECIPIENT_RELATIONSHIP_OPTIONS: {
  value: OrderRecipientRelationship;
  label: string;
}[] = [
  { value: "Partner", label: "Partner" },
  { value: "Family", label: "Family" },
  { value: "Friend", label: "Friend" },
  { value: "Colleague", label: "Colleague" },
  { value: "Client", label: "Client" },
  { value: "Self", label: "It's for me" },
  { value: "Other", label: "Someone else" },
];

export const ORDER_CAKE_SIZES = [
  '6" Round',
  '8" Round',
  '6" Square',
  '8" Square',
  "Custom",
] as const;
export type OrderCakeSize = (typeof ORDER_CAKE_SIZES)[number];

export const ORDER_PAYMENT_STATUSES = ["Unpaid", "Deposit Paid", "Paid in Full"] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

// 2026-10-12 사용자 요청: Order를 WANN Weekly OS의 "제품 라인"과 연결 — CONFIRMED 전환 시
// sync_confirmed_order_to_planner() DB 트리거가 orders.product_line 값을 그대로
// planner_multiple_tasks.product_line에 실어보낸다. 이 key들은 WANN 쪽
// wann-planner/src/lib/wann-groups.ts의 PRODUCT_LINES와 1:1로 맞춰져 있어야 한다 —
// 여기서 바꾸면 그쪽도 같이 바꿔야 한다(지금은 공식 공유 테이블이 없어 양쪽에 각각 하드코딩).
export const ORDER_PRODUCT_LINES = [
  { key: "weekly_cake", label: "Weekly Surprise Cake" },
  { key: "chiffon", label: "딸기·카카오 시폰 케이크" },
  { key: "confectionery", label: "컨펙셔너리 박스" },
] as const;
export type OrderProductLineKey = (typeof ORDER_PRODUCT_LINES)[number]["key"];

export const customersQuery = () =>
  queryOptions({
    queryKey: ["customers"],
    queryFn: async (): Promise<Customer[]> =>
      unwrap(await supabase.from("customers").select("*").order("name", { ascending: true })),
  });

export const customerQuery = (id: string) =>
  queryOptions({
    queryKey: ["customers", id],
    queryFn: async (): Promise<Customer> =>
      unwrap(await supabase.from("customers").select("*").eq("id", id).single()),
  });

export interface OrderListRow extends Order {
  customers: { id: string; name: string | null } | null;
  products: { id: string; name: string } | null;
}

export const ordersQuery = () =>
  queryOptions({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrderListRow[]> =>
      unwrap(
        await supabase
          .from("orders")
          .select("*, customers(id, name), products(id, name)")
          .order("created_at", { ascending: false }),
      ) as unknown as OrderListRow[],
  });

export const orderQuery = (id: string) =>
  queryOptions({
    queryKey: ["orders", id],
    queryFn: async (): Promise<OrderListRow> =>
      unwrap(
        await supabase
          .from("orders")
          .select("*, customers(id, name), products(id, name)")
          .eq("id", id)
          .single(),
      ) as unknown as OrderListRow,
  });

/** ORDER 상세 맨 위 MOOD BOARD(2026-10-13) — 쌓임 순서(z_index) 기준 정렬해서 반환 */
export type OrderMoodboardItem = Tables<"order_moodboard_items">;
export const orderMoodboardItemsQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["order_moodboard_items", orderId],
    queryFn: async (): Promise<OrderMoodboardItem[]> =>
      unwrap(
        await supabase
          .from("order_moodboard_items")
          .select("*")
          .eq("order_id", orderId)
          .order("z_index"),
      ),
  });

/** ORDER 상세 VISUALS 탭 — 결과물(완성작) 사진 갤러리(2026-10-15). sort_order 기준 정렬. */
export type OrderResultPhoto = Tables<"order_result_photos">;
export const orderResultPhotosQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["order_result_photos", orderId],
    queryFn: async (): Promise<OrderResultPhoto[]> =>
      unwrap(
        await supabase
          .from("order_result_photos")
          .select("*")
          .eq("order_id", orderId)
          .order("sort_order"),
      ),
  });

export const customerOrdersQuery = (customerId: string) =>
  queryOptions({
    queryKey: ["orders", "by_customer", customerId],
    queryFn: async (): Promise<OrderListRow[]> =>
      unwrap(
        await supabase
          .from("orders")
          .select("*, customers(id, name), products(id, name)")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ) as unknown as OrderListRow[],
  });

/**
 * CUSTOMER 등급(단골/일반고객) 판정용 — customer_id별 전체 주문 개수(2026-10-06).
 * 등급 자체는 저장하지 않고 이 개수(>=2면 단골)로 매번 계산한다.
 */
export const customerOrderCountsQuery = () =>
  queryOptions({
    queryKey: ["orders", "counts_by_customer"],
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(
        await supabase.from("orders").select("customer_id").not("customer_id", "is", null),
      ) as { customer_id: string | null }[];
      const counts: Record<string, number> = {};
      for (const r of rows) {
        if (!r.customer_id) continue;
        counts[r.customer_id] = (counts[r.customer_id] ?? 0) + 1;
      }
      return counts;
    },
  });

function slugPart(v: string | null): string {
  if (!v) return "";
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface CustomerLastOrderInfo {
  /** pickup_at(없으면 event_date) 기준 가장 최근 DELIVERY 날짜 — 시간 제외, "YYYY-MM-DD". */
  lastDeliveryDate: string;
  /** 예: "family-birthday", "self-birthday" — RECIPIENT RELATIONSHIP + OCCASION을 소문자-하이픈으로 결합. */
  eventLabel: string;
}

/**
 * CUSTOMER 카드뷰에 "최근 DELIVERY 날짜 + 어떤 행사였는지"를 보여주기 위한 집계(2026-10-06 사용자 요청).
 * customer_id별로 pickup_at(없으면 event_date) 기준 가장 최근 주문 하나만 골라 날짜(시간 제외)와
 * RECIPIENT RELATIONSHIP-OCCASION 라벨(예: family-birthday)을 계산한다.
 */
export const customerLastOrderInfoQuery = () =>
  queryOptions({
    queryKey: ["orders", "last_by_customer"],
    queryFn: async (): Promise<Record<string, CustomerLastOrderInfo>> => {
      const rows = unwrap(
        await supabase
          .from("orders")
          .select("customer_id, pickup_at, event_date, occasion, recipient_relationship")
          .not("customer_id", "is", null),
      ) as {
        customer_id: string | null;
        pickup_at: string | null;
        event_date: string | null;
        occasion: string | null;
        recipient_relationship: string | null;
      }[];

      const best: Record<string, { key: string; row: (typeof rows)[number] }> = {};
      for (const r of rows) {
        if (!r.customer_id) continue;
        const date = r.pickup_at ? r.pickup_at.slice(0, 10) : r.event_date;
        if (!date) continue;
        const existing = best[r.customer_id];
        if (!existing || date > existing.key) {
          best[r.customer_id] = { key: date, row: r };
        }
      }

      const result: Record<string, CustomerLastOrderInfo> = {};
      for (const [customerId, { key, row }] of Object.entries(best)) {
        const label = [slugPart(row.recipient_relationship), slugPart(row.occasion)]
          .filter(Boolean)
          .join("-");
        result[customerId] = { lastDeliveryDate: key, eventLabel: label || "—" };
      }
      return result;
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
            "product_id, product_size_id, component_id, ingredient_id, formula_version_id, quantity_g, ingredients(purchase_price, purchase_qty, purchase_unit)",
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
        formula_version_id: string | null;
        ingredient_id: string | null;
        quantity_g: number | null;
        ingredients: {
          purchase_price: number | null;
          purchase_qty: number | null;
          purchase_unit: string | null;
        } | null;
      }[];

      const versionCosts = await fetchVersionCosts(
        links.map((r) => r.formula_version_id).filter((id): id is string => id != null),
      );

      const overheadPerCake = overheadPerUnit(settingsRes.data) ?? 0;

      const costItemsByProduct: Record<
        string,
        { quantity: number; cost_items: { unit_cost: number } }[]
      > = {};
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

      const productById = new Map(products.map((p) => [p.id, p]));
      const rows: CostDashboardRow[] = [];
      for (const size of sizes) {
        const product = productById.get(size.product_id);
        if (!product) continue;
        const summary = summarizeUsage(
          links.filter((r) => r.product_id === size.product_id),
          size.id,
          (row) => productUsageCost(row, versionCosts),
        );
        const rawCost = summary.cost;
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
          hasMissingPrice: !summary.complete,
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

/**
 * COST 탭 — "포뮬라 단가 비교"용(2026-10-13). 사용자가 고른 FORMULA들을 effective version(CURRENT
 * 우선, 없으면 최신 DRAFT/TESTING — pickEffectiveFormulaVersion과 동일 규칙) 기준으로 비교한다.
 * 기존 computeLineCosts/analyzeBatch를 그대로 재사용 — 별도 원가 계산 로직을 새로 만들지 않는다.
 * 재료 원가·배치 중량 등 원본 데이터는 전혀 변경하지 않고 조회만 한다.
 */
export type FormulaCostCompareIssueCode =
  "NO_VERSION" | "ZERO_WEIGHT" | "UNIT_CONVERSION" | "MISSING_PRICE" | "CALC_ERROR";

export interface FormulaCostCompareIssue {
  code: FormulaCostCompareIssueCode;
  message: string;
}

export interface FormulaCostCompareRow {
  formulaId: string;
  formulaName: string;
  categoryId: string | null;
  categoryName: string | null;
  versionId: string | null;
  versionNumber: number | null;
  versionStatus: string | null;
  /** 배치 총중량(g) — 재료 원가 유무와 무관하게 전부 합산(중량 단위만) */
  totalGrams: number;
  /** 배치 총 재료 원가(원가 정보가 있는 재료만 합산) */
  totalCost: number;
  /** totalCost / totalGrams, totalGrams가 0 이하면 null */
  costPerGram: number | null;
  /** 비어있으면 "유효한" 비교 대상. 하나라도 있으면 화면에서 최저 원가 선정 대상에서 제외. */
  issues: FormulaCostCompareIssue[];
}

export const formulaCostCompareQuery = (formulaIds: string[]) =>
  queryOptions({
    queryKey: ["formula_cost_compare", [...formulaIds].sort()],
    enabled: formulaIds.length > 0,
    queryFn: async (): Promise<FormulaCostCompareRow[]> => {
      if (formulaIds.length === 0) return [];
      const rows = unwrap(
        await supabase
          .from("formulas")
          .select(
            "id, name, technique_category_id, technique_categories(id, name), formula_versions(id, version_number, status, formula_version_ingredients(amount, unit, ingredients(purchase_price, purchase_qty, purchase_unit)))",
          )
          .in("id", formulaIds),
      ) as unknown as {
        id: string;
        name: string;
        technique_category_id: string | null;
        technique_categories: { id: string; name: string } | null;
        formula_versions: {
          id: string;
          version_number: number;
          status: string;
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
      }[];

      return rows.map((formula) => {
        const base = {
          formulaId: formula.id,
          formulaName: formula.name,
          categoryId: formula.technique_category_id,
          categoryName: formula.technique_categories?.name ?? null,
        };
        const version = pickEffectiveFormulaVersion(formula.formula_versions ?? []);
        if (!version) {
          return {
            ...base,
            versionId: null,
            versionNumber: null,
            versionStatus: null,
            totalGrams: 0,
            totalCost: 0,
            costPerGram: null,
            issues: [
              { code: "NO_VERSION", message: "사용 가능한 FORMULA VERSION이 없습니다." },
            ] as FormulaCostCompareIssue[],
          };
        }
        try {
          const diag = analyzeBatch(version.formula_version_ingredients ?? []);
          const issues: FormulaCostCompareIssue[] = [];
          if (diag.isEmpty) {
            issues.push({
              code: "ZERO_WEIGHT",
              message: "포뮬라의 총 완성 중량을 확인할 수 없습니다(등록된 재료 없음).",
            });
          } else if (diag.totalGrams <= 0) {
            issues.push(
              diag.hasUnconvertibleUnit
                ? {
                    code: "UNIT_CONVERSION",
                    message: "재료의 단위를 g 기준으로 환산할 수 없습니다.",
                  }
                : {
                    code: "ZERO_WEIGHT",
                    message: "배치 중량이 0g 이하이므로 단가를 계산할 수 없습니다.",
                  },
            );
          }
          if (diag.hasMissingPrice) {
            issues.push({
              code: "MISSING_PRICE",
              message:
                "가격이 등록되지 않은 재료가 있습니다 — 원가가 실제보다 낮게 계산될 수 있습니다.",
            });
          }
          return {
            ...base,
            versionId: version.id,
            versionNumber: version.version_number,
            versionStatus: version.status,
            totalGrams: diag.totalGrams,
            totalCost: diag.totalCost,
            costPerGram: diag.costPerGram,
            issues,
          };
        } catch {
          return {
            ...base,
            versionId: version.id,
            versionNumber: version.version_number,
            versionStatus: version.status,
            totalGrams: 0,
            totalCost: 0,
            costPerGram: null,
            issues: [
              { code: "CALC_ERROR", message: "기존 원가 계산 결과를 확인할 수 없습니다." },
            ] as FormulaCostCompareIssue[],
          };
        }
      });
    },
  });

// ---- 냉동 재고관리 (STOCK) ----

/** 같은 컴포넌트의 사이즈(크기)별 재고 한 줄 — stock_item_lines */
export interface StockLine {
  id: string;
  width_mm: number | null;
  length_mm: number | null;
  height_mm: number | null;
  unit_label: string;
  quantity: number;
  mould_id: string | null;
  mould_qty: number | null;
  note: string | null;
}

export interface StockItemRow {
  id: string;
  item_type: "PRODUCT" | "COMPONENT";
  product_size_id: string | null;
  component_id: string | null;
  unit_label: string;
  quantity: number;
  notes: string | null;
  updated_at: string;
  /** COMPONENT: 사이즈별 줄들(같은 컴포넌트는 한 박스). PRODUCT는 비어 있고 항목 자체가 한 줄. */
  lines: StockLine[];
  /** 박스 제목(제품/컴포넌트 이름)과 사이즈 라벨 */
  group_label: string;
  size_label: string;
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
            "*, stock_item_lines(*), product_sizes(id, shape, diameter_mm, length_mm, width_mm, height_mm, is_default, products(id, name)), components(id, name)",
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
        stock_item_lines: Tables<"stock_item_lines">[] | null;
        product_sizes: (ProductSize & { products: { id: string; name: string } | null }) | null;
        components: Component | null;
      }>;
      return rows
        .map((r) => {
          const groupLabel =
            r.item_type === "PRODUCT" && r.product_sizes
              ? (r.product_sizes.products?.name ?? "?")
              : (r.components?.name ?? "?");
          const sizeLabel =
            r.item_type === "PRODUCT" && r.product_sizes
              ? formatProductSizeLabel(r.product_sizes)
              : "";
          const num = (v: unknown) => (v == null ? null : Number(v));
          const lines: StockLine[] =
            r.item_type === "COMPONENT"
              ? (r.stock_item_lines ?? [])
                  .map((l) => ({
                    id: l.id,
                    width_mm: num(l.width_mm),
                    length_mm: num(l.length_mm),
                    height_mm: num(l.height_mm),
                    unit_label: l.unit_label,
                    quantity: Number(l.quantity),
                    mould_id: l.mould_id,
                    mould_qty: num(l.mould_qty),
                    note: l.note,
                    _created: l.created_at,
                  }))
                  .sort((x, y) => x._created.localeCompare(y._created))
                  .map(({ _created, ...rest }) => rest)
              : [];
          return {
            id: r.id,
            item_type: r.item_type,
            product_size_id: r.product_size_id,
            component_id: r.component_id,
            unit_label: r.unit_label,
            quantity:
              r.item_type === "COMPONENT" && lines.length > 0
                ? lines.reduce((sum, l) => sum + l.quantity, 0)
                : Number(r.quantity),
            notes: r.notes,
            updated_at: r.updated_at,
            lines,
            group_label: groupLabel,
            size_label: sizeLabel,
            label: sizeLabel ? `${groupLabel} · ${sizeLabel}` : groupLabel,
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
      const sizes = (
        sizesRes.data as unknown as Array<
          ProductSize & { products: { id: string; name: string } | null }
        >
      )
        .filter((s) => !usedSizeIds.has(s.id))
        .map((s) => ({
          id: s.id,
          label: `${s.products?.name ?? "?"} · ${formatProductSizeLabel(s)}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      // 같은 컴포넌트도 사이즈가 다르면 또 추가할 수 있어야 하므로 이미 재고에 있어도 목록에 둔다.
      void usedComponentIds;
      const components = (componentsRes.data as Component[]).map((c) => ({
        id: c.id,
        label: c.name,
      }));
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
/** 2026-10-07: formula_version_id가 아니라 selectionId(work_session_formula_versions.id)로
 * 조회한다 — 같은 FORMULA VERSION이 한 세션에 두 번 이상 선택돼도(중복 추가 허용) 히스토리가
 * 서로 섞이지 않도록. */
export const workSessionMultiplierHistoryQuery = (sessionId: string, selectionId: string | null) =>
  queryOptions({
    queryKey: ["work_session_multiplier_history", sessionId, selectionId],
    enabled: Boolean(selectionId),
    queryFn: async (): Promise<WorkSessionMultiplierHistory[]> => {
      if (!selectionId) return [];
      return unwrap(
        await supabase
          .from("work_session_multiplier_history")
          .select("*")
          .eq("work_session_id", sessionId)
          .eq("work_session_formula_version_id", selectionId)
          .order("applied_at", { ascending: false }),
      );
    },
  });

/* ── WORKFLOW TEMPLATES (2026-09-23) — 제작방법(technique_category)별 표준 TASK 순서 ─── */

export type WorkflowTemplate = import("@/integrations/supabase/types").Tables<"workflow_templates">;
export type WorkflowTemplateTask =
  import("@/integrations/supabase/types").Tables<"workflow_template_tasks">;

/** 전체 템플릿 목록 (SETTINGS 관리 화면용) */
export const workflowTemplatesQuery = () =>
  queryOptions({
    queryKey: ["workflow_templates"],
    queryFn: async (): Promise<WorkflowTemplate[]> =>
      unwrap(await supabase.from("workflow_templates").select("*").order("name")),
  });

/** 특정 제작방법(TECHNIQUE CATEGORY)에 속한 템플릿만 — PRODUCTION에서 "템플릿 불러오기"용 */
export const workflowTemplatesByTechniqueQuery = (techniqueCategoryId: string | null) =>
  queryOptions({
    queryKey: ["workflow_templates_by_technique", techniqueCategoryId],
    enabled: Boolean(techniqueCategoryId),
    queryFn: async (): Promise<WorkflowTemplate[]> => {
      if (!techniqueCategoryId) return [];
      return unwrap(
        await supabase
          .from("workflow_templates")
          .select("*")
          .eq("technique_category_id", techniqueCategoryId)
          .order("name"),
      );
    },
  });

export const workflowTemplateTasksQuery = (templateId: string | null) =>
  queryOptions({
    queryKey: ["workflow_template_tasks", templateId],
    enabled: Boolean(templateId),
    queryFn: async (): Promise<WorkflowTemplateTask[]> => {
      if (!templateId) return [];
      return unwrap(
        await supabase
          .from("workflow_template_tasks")
          .select("*")
          .eq("template_id", templateId)
          .order("sort_order"),
      );
    },
  });

/** templateId → { taskId → [predecessor taskId, ...] } */
export const workflowTemplateTaskPredecessorsQuery = (templateId: string | null) =>
  queryOptions({
    queryKey: ["workflow_template_task_predecessors", templateId],
    enabled: Boolean(templateId),
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (!templateId) return {};
      const rows = unwrap(
        await supabase
          .from("workflow_template_task_predecessors")
          .select("task_id, predecessor_task_id")
          .eq("template_id", templateId),
      );
      const map: Record<string, string[]> = {};
      for (const row of rows) {
        (map[row.task_id] ??= []).push(row.predecessor_task_id);
      }
      return map;
    },
  });

/* ── COMPONENT OBSERVATION (2026-09-30) — RND 삭제 후, PRODUCTION TASK LIST에서 기록한
 * 관찰값(work_session_tasks.observation_*)을 COMPONENT 단위로 모아 보여준다. 이 COMPONENT의
 * FORMULA로 진행된 모든 PRODUCTION 세션의 TASK 중 관찰값이 하나라도 있는 것만 대상. */
export interface ComponentObservationRow {
  id: string;
  task_name: string;
  task_type: string | null;
  actual_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  observation_status: string | null;
  observation_height_start_mm: number | null;
  observation_height_mid_mm: number | null;
  observation_height_end_mm: number | null;
  observation_temperature_c: number | null;
  formula_versions: {
    id: string;
    version_number: number;
    formulas: { id: string; component_id: string | null } | null;
  } | null;
  work_sessions: { id: string; name: string } | null;
}

export const componentObservationsQuery = (componentId: string) =>
  queryOptions({
    queryKey: ["component_observations", componentId],
    queryFn: async (): Promise<ComponentObservationRow[]> =>
      unwrap(
        await supabase
          .from("work_session_tasks")
          .select(
            "id, task_name, task_type, actual_started_at, completed_at, created_at, observation_status, observation_height_start_mm, observation_height_mid_mm, observation_height_end_mm, observation_temperature_c, formula_versions!inner(id, version_number, formulas!inner(id, component_id)), work_sessions(id, name)",
          )
          .eq("formula_versions.formulas.component_id", componentId)
          .order("actual_started_at", { ascending: false }),
      ) as unknown as ComponentObservationRow[],
  });

// ── ORDER ↔ WORK SESSION 연결 (2026-10-06 수정 — 기존 PRODUCTION 시스템 재사용) ──────────
// 처음엔 별도 production_plans/production_plan_elements 테이블을 새로 만들었으나, 사용자가
// "기존 PRODUCTION(work_sessions) 시스템을 재사용하라"고 명확히 정정해서 걷어냈다.
// ELEMENT 개념(Sheet/Cream/Filling 고정 CORE 슬롯 + 자유 추가 DECORATIVE)은 새 테이블 없이
// 기존 work_session_formula_versions 행에 kind/slot 태그만 추가해서 흡수시켰다 — Formula+Version
// 선택은 이미 그 테이블의 formula_version_id가 하고 있었으므로.
export const CORE_SLOTS = ["SHEET", "CREAM", "FILLING"] as const;
export type CoreSlot = (typeof CORE_SLOTS)[number];
// 2026-10-12 사용자 요청: 기존 Sheet/Cream/Filling이라는 이름이 "반죽을 구워 만드는 것 vs
// 굽지 않는 크림베이스 vs 삽입/인서트"라는 실제 구분 기준을 잘 드러내지 못해서 더 명확한
// 이름으로 변경 — 내부 저장값(SHEET/CREAM/FILLING, DB 컬럼명 등)은 그대로 유지하고 표시 라벨만 바꾼다.
export const CORE_SLOT_LABELS: Record<CoreSlot, string> = {
  SHEET: "Pastry Base",
  CREAM: "Cream & Aerated Components",
  FILLING: "Fillings & Inserts",
};

/** Order 하나당 Work Session은 최대 1개(order_id unique). 없으면 null. */
export const workSessionByOrderQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["work_sessions", "by_order", orderId],
    queryFn: async (): Promise<WorkSession | null> =>
      unwrap(
        await supabase.from("work_sessions").select("*").eq("order_id", orderId).maybeSingle(),
      ),
  });

// 2026-10-20: 전역 CAKE SIZES 목록(SETTINGS) — 주문이 이 중 하나를 골라 인분/시트 몰드를 참조한다.
export type CakeSize = Tables<"cake_sizes">;

export const cakeSizesQuery = () =>
  queryOptions({
    queryKey: ["cake_sizes"],
    queryFn: async (): Promise<CakeSize[]> =>
      unwrap(await supabase.from("cake_sizes").select("*").order("sort_order").order("name")),
  });

// 2026-10-21: DIETARY TAGS — SETTINGS에서 관리하는 전역 식이 분류(복수 선택). 주문은 order_dietary_tags로 연결한다.
export type DietaryTag = Tables<"dietary_tags">;
export type OrderDietaryTagLink = Tables<"order_dietary_tags">;

export const dietaryTagsQuery = () =>
  queryOptions({
    queryKey: ["dietary_tags"],
    queryFn: async (): Promise<DietaryTag[]> =>
      unwrap(await supabase.from("dietary_tags").select("*").order("sort_order").order("name")),
  });

/** 모든 주문의 태그 연결 — 목록과 상세가 같은 쿼리를 공유한다(데이터가 작아 한 번에 읽는다). */
export const orderDietaryTagLinksQuery = () =>
  queryOptions({
    queryKey: ["order_dietary_tags"],
    queryFn: async (): Promise<OrderDietaryTagLink[]> =>
      unwrap(await supabase.from("order_dietary_tags").select("*")),
  });

/** 2026-10-21: formula version 단위 식이 태그(선언). 새 버전은 태그를 물려받지 않아 다시 확인해야 한다. */
export type FormulaVersionDietaryTagLink = Tables<"formula_version_dietary_tags">;

export const formulaVersionDietaryTagLinksQuery = () =>
  queryOptions({
    queryKey: ["formula_version_dietary_tags"],
    queryFn: async (): Promise<FormulaVersionDietaryTagLink[]> =>
      unwrap(await supabase.from("formula_version_dietary_tags").select("*")),
  });

/** DIETARY 탭용: 제품-컴포넌트 연결(사이즈 행 포함, component_id가 있는 행만 슬롯으로 쓴다). */
export interface DietaryBoardProductComponent {
  product_id: string;
  component_id: string | null;
  formula_version_id: string | null;
  sort_order: number;
}

export const dietaryBoardProductComponentsQuery = () =>
  queryOptions({
    queryKey: ["dietary_board", "product_components"],
    queryFn: async (): Promise<DietaryBoardProductComponent[]> =>
      unwrap(
        await supabase
          .from("product_components")
          .select("product_id, component_id, formula_version_id, sort_order")
          .order("sort_order"),
      ),
  });

// 2026-10-21 DIETARY BUILD: 한 제품을 특정 식이로 만들 때의 formula version 조합(저장본). 주문 연결은 3b.
export type DietaryBuild = Tables<"dietary_builds">;
export type DietaryBuildItem = Tables<"dietary_build_items">;
export type DietaryBuildTagLink = Tables<"dietary_build_tags">;

export interface DietaryBuildFull extends DietaryBuild {
  dietary_build_items: DietaryBuildItem[];
  dietary_build_tags: DietaryBuildTagLink[];
}

export const dietaryBuildsQuery = () =>
  queryOptions({
    queryKey: ["dietary_builds"],
    queryFn: async (): Promise<DietaryBuildFull[]> =>
      unwrap(
        await supabase
          .from("dietary_builds")
          .select("*, dietary_build_items(*), dietary_build_tags(*)")
          .order("created_at", { ascending: false }),
      ) as unknown as DietaryBuildFull[],
  });

/** 모든 WORKFLOW TEMPLATE의 단계(작업 블록 단위) — 대시보드가 템플릿 id로 묶어 쓴다. */
export const workflowTemplateStepsQuery = () =>
  queryOptions({
    queryKey: ["workflow_template_steps_all"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("workflow_template_tasks")
          .select("id, template_id, task_name, task_type, timer_minutes, sort_order")
          .order("sort_order", { ascending: true }),
      ),
  });
