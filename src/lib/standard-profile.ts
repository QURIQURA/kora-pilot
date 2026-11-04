import { supabase } from "@/integrations/supabase/client";

/** Resolve a business-data link only after an explicit shared-standard choice. */
export async function ensureStandardProfile(
  productId: string,
  standardId: string,
  preferredId?: string | null,
): Promise<string | null> {
  if (!productId || !standardId) return null;
  const { data, error } = await supabase.rpc("ensure_product_standard_profile", {
    p_product_id: productId,
    p_cake_size_id: standardId,
    ...(preferredId ? { p_preferred_id: preferredId } : {}),
  });
  if (error) throw error;
  return data as string | null;
}
