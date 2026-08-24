/**
 * PILOT 공용 도메인 타입 / 헬퍼
 */
import type { Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;
export type Tag = Tables<"tags">;
export type Product = Tables<"products">;
export type Component = Tables<"components">;
export type Ingredient = Tables<"ingredients">;
export type IngredientFunction = Tables<"ingredient_functions">;

export const PRODUCT_STATUSES = [
  "IDEA",
  "ACTIVE",
  "TESTING",
  "STABLE",
  "ARCHIVED",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const DEFAULT_TARGET_KEYS = [
  "TEXTURE",
  "SWEETNESS",
  "ACIDITY",
  "RICHNESS",
  "STABILITY",
  "VISUAL",
  "SHELF LIFE",
] as const;

export interface TargetAttribute {
  [key: string]: string | undefined;
  key: string;
  value: string;
  note?: string;
}

export function parseTarget(raw: unknown): TargetAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record["key"] !== "string") return [];
    return [
      {
        key: record["key"],
        value: typeof record["value"] === "string" ? record["value"] : "",
        note: typeof record["note"] === "string" ? record["note"] : "",
      },
    ];
  });
}

/** 카테고리 id -> 루트부터의 경로 배열 */
export function categoryPath(
  categories: Category[],
  id: string | null | undefined
): Category[] {
  if (!id) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: Category[] = [];
  let current = byId.get(id);
  let guard = 0;
  while (current && guard < 20) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
    guard += 1;
  }
  return path;
}

export function categoryPathLabel(
  categories: Category[],
  id: string | null | undefined
): string {
  const path = categoryPath(categories, id);
  return path.length ? path.map((c) => c.name).join(" / ") : "—";
}

/** 계층 순서대로 평탄화 (depth 포함) */
export function flattenCategories(
  categories: Category[]
): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    const key = category.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(category);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
  }

  const out: { category: Category; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const category of byParent.get(parent) ?? []) {
      out.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** 카테고리와 그 하위 카테고리 id 전부 */
export function categoryWithDescendants(
  categories: Category[],
  id: string
): string[] {
  const ids = [id];
  let added = true;
  while (added) {
    added = false;
    for (const category of categories) {
      if (
        category.parent_id &&
        ids.includes(category.parent_id) &&
        !ids.includes(category.id)
      ) {
        ids.push(category.id);
        added = true;
      }
    }
  }
  return ids;
}

/* ── 재료 원장 확장 (기능성/조성/균형/향미) ─────────────────── */

export type FlavourFamily = Tables<"flavour_families">;

/** 재료 표시명 — 이름이 나오는 모든 곳에서 "한글명 (English)" 병기 */
export function ingredientDisplayName(
  ingredient: Pick<Ingredient, "name" | "name_en">
): string {
  const en = ingredient.name_en?.trim();
  return en ? `${ingredient.name} (${en})` : ingredient.name;
}

/** 기능성 재료 사용률 기준 */
export const REFERENCE_BASIS_OPTIONS = [
  { value: "flour", label: "FLOUR" },
  { value: "liquid", label: "LIQUID" },
  { value: "total", label: "TOTAL" },
  { value: "puree_sugar", label: "PUREE SUGAR" },
  { value: "fat", label: "FAT" },
  { value: "sugar", label: "SUGAR" },
  { value: "egg_white", label: "EGG WHITE" },
  { value: "bath", label: "BATH" },
] as const;

export const SCALING_MODE_OPTIONS = [
  { value: "linear", label: "LINEAR (×N)" },
  { value: "sub_linear", label: "SUB-LINEAR (N^K)" },
  { value: "fixed", label: "FIXED" },
] as const;

export const FAT_TYPE_OPTIONS = [
  { value: "dairy", label: "DAIRY" },
  { value: "cocoa_butter", label: "COCOA BUTTER" },
  { value: "vegetable", label: "VEGETABLE" },
  { value: "other", label: "OTHER" },
] as const;

export const SUGAR_TYPE_OPTIONS = [
  { value: "sucrose", label: "SUCROSE" },
  { value: "dextrose", label: "DEXTROSE" },
  { value: "fructose", label: "FRUCTOSE" },
  { value: "invert", label: "INVERT" },
  { value: "glucose_syrup", label: "GLUCOSE SYRUP" },
  { value: "lactose", label: "LACTOSE" },
  { value: "sorbitol", label: "SORBITOL" },
  { value: "trehalose", label: "TREHALOSE" },
  { value: "maltodextrin", label: "MALTODEXTRIN" },
  { value: "other", label: "OTHER" },
] as const;

/** 조성 필드 (모두 numeric %) */
export const COMPOSITION_FIELDS = [
  { key: "comp_water", label: "수분 WATER" },
  { key: "comp_fat", label: "지방 FAT" },
  { key: "comp_protein", label: "단백질 PROTEIN" },
  { key: "comp_sugar", label: "당 SUGAR" },
  { key: "comp_other_solids", label: "기타 고형분 OTHER SOLIDS" },
  { key: "comp_alcohol", label: "알코올 ALCOHOL" },
] as const;

export type CompositionKey = (typeof COMPOSITION_FIELDS)[number]["key"];

/** 조성 합계 — 전부 비어 있으면 null */
export function compositionSum(
  ingredient: Pick<Ingredient, CompositionKey>
): number | null {
  let sum = 0;
  let any = false;
  for (const { key } of COMPOSITION_FIELDS) {
    const value = ingredient[key];
    if (value != null) {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
}

/** 조성이 하나라도 입력됐는지 */
export function hasComposition(
  ingredient: Pick<Ingredient, CompositionKey>
): boolean {
  return compositionSum(ingredient) !== null;
}

/** 맛 축 (0~5) */
export const TASTE_AXES = [
  { key: "taste_sweet", label: "단맛 SWEET" },
  { key: "taste_sour", label: "신맛 SOUR" },
  { key: "taste_bitter", label: "쓴맛 BITTER" },
  { key: "taste_salty", label: "짠맛 SALTY" },
  { key: "taste_umami", label: "감칠맛 UMAMI" },
  { key: "taste_astringent", label: "떫은맛 ASTRINGENT" },
  { key: "taste_fat", label: "지방맛 FAT" },
] as const;

/** 배합 균형 역할 */
export const BALANCE_ROLES = [
  { key: "role_toughener", label: "강화 TOUGHENER" },
  { key: "role_tenderizer", label: "연화 TENDERIZER" },
  { key: "role_moistener", label: "습윤 MOISTENER" },
  { key: "role_drier", label: "건조 DRIER" },
] as const;

/**
 * 시스템이 기준량 자동 집계에 쓰는 기능의 내부 키.
 * 표시 이름은 바뀔 수 있지만 이 키는 유지된다.
 */
export const SYSTEM_FUNCTION_KEYS = [
  "structure",
  "starch",
  "water",
  "fat",
  "sweetener",
] as const;

/* ── 아로마 태그 ─────────────────────────────────────────── */

/**
 * 아로마 태그 기본 어휘 24종 — 코드에 하드코딩된 최초 자동완성 후보.
 * DB 시드가 아니며, 사용자가 실제 쓴 태그가 여기에 더해져 후보가 늘어난다.
 */
export const DEFAULT_AROMA_TAGS = [
  { value: "우디", en: "Woody" },
  { value: "스모키", en: "Smoky" },
  { value: "레지너스", en: "Resinous" },
  { value: "그린", en: "Green" },
  { value: "민티", en: "Minty" },
  { value: "페퍼리", en: "Peppery" },
  { value: "플로럴", en: "Floral" },
  { value: "프루티", en: "Fruity" },
  { value: "시트러시", en: "Citrusy" },
  { value: "넛티", en: "Nutty" },
  { value: "로스티", en: "Roasty" },
  { value: "캐러멜릭", en: "Caramelic" },
  { value: "버터리", en: "Buttery" },
  { value: "크리미", en: "Creamy" },
  { value: "바닐릭", en: "Vanillic" },
  { value: "어시", en: "Earthy" },
  { value: "스파이시", en: "Spicy" },
  { value: "허바시어스", en: "Herbaceous" },
  { value: "잼미", en: "Jammy" },
  { value: "발사믹", en: "Balsamic" },
  { value: "알코홀릭", en: "Alcoholic" },
  { value: "이스티", en: "Yeasty" },
  { value: "토스티", en: "Toasty" },
  { value: "애니멀릭", en: "Animalic" },
] as const;

export interface AromaTagCandidate {
  value: string;
  en?: string;
}

/** 기본 어휘 + 사용자가 실제 쓴 태그를 합친 자동완성 후보 */
export function aromaTagCandidates(used: string[]): AromaTagCandidate[] {
  const list: AromaTagCandidate[] = [...DEFAULT_AROMA_TAGS];
  for (const tag of used) {
    if (!list.some((c) => c.value === tag)) list.push({ value: tag });
  }
  return list;
}
