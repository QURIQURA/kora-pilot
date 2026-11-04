import type { Tables } from "@/integrations/supabase/types";
import type { ProductSize } from "@/lib/product-size";

/** Geometry has one source: the shared finished-standard catalog. Pricing/usage
 * profile IDs remain internal so existing cost and stock history keeps its links. */
export function canonicalProfile(
  profile: ProductSize,
  standard: Tables<"cake_sizes">,
): ProductSize {
  return {
    ...profile,
    shape: standard.shape === "SQUARE" ? "RECTANGLE" : (standard.shape ?? ""),
    diameter_mm: standard.diameter_mm,
    length_mm: standard.length_mm,
    width_mm: standard.width_mm,
    height_mm: standard.height_mm,
  };
}

export function sharedStandardOptions(
  standards: Tables<"cake_sizes">[],
  profiles: ProductSize[],
  productId: string,
): ProductSize[] {
  return standards.map((standard) => {
    const matches = profiles.filter(
      (p) => p.product_id === productId && p.cake_size_id === standard.id,
    );
    if (matches.length > 1)
      throw new Error("같은 공용 규격에 중복된 제품 가격·구성 기록이 있습니다. 정리가 필요합니다.");
    const profile = matches[0] ?? {
      id: standard.id,
      product_id: productId,
      user_id: standard.user_id,
      cake_size_id: standard.id,
      is_default: false,
      selling_price: null,
      monthly_unit_count: null,
      notes: null,
      created_at: standard.created_at,
      updated_at: standard.updated_at,
      mould_id: null,
      mould_diameter_mm: null,
      finished_diameter_mm: null,
      finished_height_mm: null,
      shape: "",
      diameter_mm: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
    };
    return canonicalProfile(profile, standard);
  });
}
