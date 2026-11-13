import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  formulasQuery,
  productComponentsQuery,
  techniqueCategoriesQuery,
  type FormulaListRow,
} from "@/lib/queries";
import { resolveSlotGroup } from "@/lib/technique";
import { applyDefaultWorkflowForFormulaVersion } from "@/lib/workflow-template";
import { syncWorkSessionToPlanner } from "@/lib/work-session";

/**
 * 제품에 저장된 하위 컴포넌트(product_components)를 생산 세션의 CORE 행(Sheet/Cream/Filling)으로 불러온다
 * (2026-11-09 사용자 요청: 팝업 품목에서 제품을 고르면 저장된 하위 컴포넌트가 바로 뜨게).
 * - 사용할 레시피 버전: 제품에 지정된 버전 → 없으면 컴포넌트 레시피의 CURRENT → 최신 DRAFT/TESTING.
 * - 이미 세션에 있는 버전은 건너뛴다(여러 번 눌러도 중복 안 생김). 배수는 ×1, 몰드 컴포넌트는 기본 몰드.
 * - 슬롯을 판단할 수 없는 컴포넌트(기법 분류 없음)와 재료만 연결된 행은 건너뛴다.
 * 추가한 개수를 돌려준다.
 */
export async function addProductComponentsToSession(
  client: QueryClient,
  sessionId: string,
  productId: string,
): Promise<number> {
  const userId = await currentUserId();
  const [productRows, formulas, techniques, existingRes] = await Promise.all([
    client.fetchQuery({ ...productComponentsQuery(productId), staleTime: 0 }),
    client.fetchQuery(formulasQuery()),
    client.fetchQuery(techniqueCategoriesQuery()),
    supabase
      .from("work_session_formula_versions")
      .select("formula_version_id, sort_order")
      .eq("work_session_id", sessionId)
      .is("parent_selection_id", null),
  ]);
  if (existingRes.error) throw existingRes.error;
  const have = new Set((existingRes.data ?? []).map((r) => r.formula_version_id));
  let sort = (existingRes.data ?? []).reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;

  // 2026-11-13: 상태와 무관하게 버전 번호가 가장 높은 레시피를 쓴다(제품에 고정된 버전도 따라간다).
  const pickVersion = (f: FormulaListRow) =>
    [...f.formula_versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;

  let added = 0;
  for (const pc of productRows) {
    if (!pc.component_id) continue;
    // 같은 제품 행 중 사이즈 전용 행이 있어도 사이즈 구분 없이 컴포넌트 단위로 한 번만 넣는다.
    const formula =
      (pc.formula_version_id
        ? formulas.find((f) => f.formula_versions.some((v) => v.id === pc.formula_version_id))
        : null) ??
      formulas.find((f) => f.component_id === pc.component_id && pickVersion(f)) ??
      null;
    if (!formula) continue;
    const version = pickVersion(formula);
    if (!version || have.has(version.id)) continue;
    const catId =
      formula.components?.technique_category_id ?? formula.technique_category_id ?? null;
    const slot = resolveSlotGroup(techniques, catId);
    if (!slot) continue;
    const isMould = (formula.components?.scaling_mode ?? null) === "MOULD";
    const { error } = await supabase.from("work_session_formula_versions").insert({
      user_id: userId,
      work_session_id: sessionId,
      formula_version_id: version.id,
      kind: "CORE",
      slot,
      multiplier: 1,
      version_pinned: true,
      mould_id: isMould ? version.default_mould_id : null,
      mould_qty: null,
      capacity_id: isMould ? version.default_mould_id : null,
      capacity_qty: null,
      sort_order: sort++,
    });
    if (error) throw error;
    have.add(version.id);
    added += 1;
    const { error: wfError } = await applyDefaultWorkflowForFormulaVersion({
      sessionId,
      userId,
      formulaVersionId: version.id,
      component: formula.components ?? null,
      formulaTechniqueCategoryId: formula.technique_category_id ?? null,
      techniqueCategories: techniques,
    });
    if (wfError) console.error("기본 워크플로 자동 적용 실패:", wfError);
  }
  if (added > 0) await syncWorkSessionToPlanner(sessionId);
  return added;
}
