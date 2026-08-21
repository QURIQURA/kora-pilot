import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Category,
  Component,
  Ingredient,
  IngredientFunction,
  Product,
  Tag,
} from "@/lib/pilot";

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
          .order("name", { ascending: true })
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
          .order("updated_at", { ascending: false })
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
      unwrap(
        await supabase
          .from("product_tags")
          .select("tag_id")
          .eq("product_id", productId)
      ),
  });

export interface ProductComponentRow {
  id: string;
  sort_order: number;
  component_id: string;
  components: Component;
}

export const productComponentsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product_components", productId],
    queryFn: async (): Promise<ProductComponentRow[]> =>
      unwrap(
        await supabase
          .from("product_components")
          .select("id, sort_order, component_id, components(*)")
          .eq("product_id", productId)
          .order("sort_order")
      ) as unknown as ProductComponentRow[],
  });

export const componentsQuery = () =>
  queryOptions({
    queryKey: ["components"],
    queryFn: async (): Promise<Component[]> =>
      unwrap(
        await supabase
          .from("components")
          .select("*")
          .order("updated_at", { ascending: false })
      ),
  });

export const componentQuery = (id: string) =>
  queryOptions({
    queryKey: ["components", id],
    queryFn: async (): Promise<Component> =>
      unwrap(
        await supabase.from("components").select("*").eq("id", id).single()
      ),
  });

export interface ComponentUsageRow {
  id: string;
  products: Product;
}

export const componentUsageQuery = (componentId: string) =>
  queryOptions({
    queryKey: ["component_usage", componentId],
    queryFn: async (): Promise<ComponentUsageRow[]> =>
      unwrap(
        await supabase
          .from("product_components")
          .select("id, products(*)")
          .eq("component_id", componentId)
      ) as unknown as ComponentUsageRow[],
  });

export interface IngredientRow extends Ingredient {
  ingredient_function_links: {
    function_id: string;
    ingredient_functions: IngredientFunction;
  }[];
}

export const ingredientsQuery = () =>
  queryOptions({
    queryKey: ["ingredients"],
    queryFn: async (): Promise<IngredientRow[]> =>
      unwrap(
        await supabase
          .from("ingredients")
          .select(
            "*, ingredient_function_links(function_id, ingredient_functions(*))"
          )
          .order("name")
      ) as unknown as IngredientRow[],
  });

export const ingredientQuery = (id: string) =>
  queryOptions({
    queryKey: ["ingredients", id],
    queryFn: async (): Promise<IngredientRow> =>
      unwrap(
        await supabase
          .from("ingredients")
          .select(
            "*, ingredient_function_links(function_id, ingredient_functions(*))"
          )
          .eq("id", id)
          .single()
      ) as unknown as IngredientRow,
  });

export const ingredientFunctionsQuery = () =>
  queryOptions({
    queryKey: ["ingredient_functions"],
    queryFn: async (): Promise<IngredientFunction[]> =>
      unwrap(
        await supabase.from("ingredient_functions").select("*").order("name")
      ),
  });

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in");
  return data.user.id;
}

export interface CategoryUsage {
  products: number;
  components: number;
  ingredients: number;
  children: number;
  total: number;
}

export const categoryUsageQuery = () =>
  queryOptions({
    queryKey: ["category_usage"],
    queryFn: async (): Promise<Record<string, CategoryUsage>> => {
      const [products, components, ingredients, categories] = await Promise.all([
        supabase.from("products").select("category_id"),
        supabase.from("components").select("category_id"),
        supabase.from("ingredients").select("category_id"),
        supabase.from("categories").select("parent_id"),
      ]);
      const map: Record<string, CategoryUsage> = {};
      const bump = (id: string | null, key: keyof CategoryUsage) => {
        if (!id) return;
        const entry =
          map[id] ??
          (map[id] = {
            products: 0,
            components: 0,
            ingredients: 0,
            children: 0,
            total: 0,
          });
        (entry[key] as number) += 1;
        entry.total += 1;
      };
      for (const row of unwrap(products)) bump(row.category_id, "products");
      for (const row of unwrap(components)) bump(row.category_id, "components");
      for (const row of unwrap(ingredients)) bump(row.category_id, "ingredients");
      for (const row of unwrap(categories)) bump(row.parent_id, "children");
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

import type {
  Formula,
  FormulaVersion,
  Mould,
} from "@/lib/formula";

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
      const rows = unwrap(
        await supabase.from("formula_versions").select("default_mould_id")
      );
      const map: Record<string, number> = {};
      for (const row of rows) {
        if (row.default_mould_id)
          map[row.default_mould_id] = (map[row.default_mould_id] ?? 0) + 1;
      }
      return map;
    },
  });

export interface FormulaListRow extends Formula {
  components: { id: string; name: string } | null;
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
            "*, components(id, name), formula_versions(id, version_number, status)"
          )
          .order("updated_at", { ascending: false })
      ) as unknown as FormulaListRow[],
  });

export const formulaQuery = (id: string) =>
  queryOptions({
    queryKey: ["formulas", id],
    queryFn: async (): Promise<Formula> =>
      unwrap(await supabase.from("formulas").select("*").eq("id", id).single()),
  });

export const formulaVersionsQuery = (formulaId: string) =>
  queryOptions({
    queryKey: ["formula_versions", formulaId],
    queryFn: async (): Promise<FormulaVersion[]> =>
      unwrap(
        await supabase
          .from("formula_versions")
          .select("*")
          .eq("formula_id", formulaId)
          .order("version_number", { ascending: true })
      ),
  });

export interface VersionIngredientRow {
  id: string;
  amount: number;
  unit: string;
  sort_order: number;
  note: string | null;
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
            "id, amount, unit, sort_order, note, ingredient_id, ingredients(*, ingredient_function_links(function_id, ingredient_functions(*)))"
          )
          .eq("formula_version_id", versionId)
          .order("sort_order")
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
            "*, components(id, name), formula_versions(id, version_number, status)"
          )
          .eq("component_id", componentId)
          .order("updated_at", { ascending: false })
      ) as unknown as FormulaListRow[],
  });
