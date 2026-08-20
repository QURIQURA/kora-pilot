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
