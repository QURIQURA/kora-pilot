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
