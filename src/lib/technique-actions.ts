import { supabase } from "@/integrations/supabase/client";

/**
 * 기준 배합(Base Formula) 지정 처리.
 * 같은 기법군에 이미 다른 기준 배합이 있으면 사용자에게 확인을 받고,
 * 승인 시 기존 것을 해제한다. (여러 개 허용 — 확인은 의도치 않은 증가만 막는다)
 *
 * @returns 이 배합을 기준으로 지정해도 되는지 여부
 */
export async function confirmBaseFormula({
  formulaId,
  techniqueId,
  isBase,
}: {
  formulaId?: string | undefined;
  techniqueId: string | null;
  isBase: boolean;
}): Promise<boolean> {
  if (!isBase || !techniqueId) return isBase;

  let query = supabase
    .from("formulas")
    .select("id, name")
    .eq("technique_category_id", techniqueId)
    .eq("is_base_formula", true);
  if (formulaId) query = query.neq("id", formulaId);
  const { data, error } = await query;
  if (error) throw error;
  const others = data ?? [];
  if (others.length === 0) return true;

  const names = others.map((o) => o.name).join(", ");
  const replace = confirm(
    `이미 ${names}이(가) 기준으로 지정되어 있습니다 — 이 배합으로 바꿀까요?\n\n확인: 기존 기준 배합을 해제하고 이 배합을 기준으로 지정\n취소: 기준 배합으로 지정하지 않음`
  );
  if (!replace) return false;

  const { error: clearError } = await supabase
    .from("formulas")
    .update({ is_base_formula: false })
    .in(
      "id",
      others.map((o) => o.id)
    );
  if (clearError) throw clearError;
  return true;
}
