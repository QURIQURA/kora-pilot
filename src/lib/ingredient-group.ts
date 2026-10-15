/**
 * INGREDIENT GROUP(재료 그룹) 자동 정렬 로직(2026-10-15 사용자 요청: "가루들은 가루끼리
 * 액체는 액체끼리 뜨도록... 매번하니까 번거롭네"). WORK SESSION 계량 화면은
 * `buildWeighingGroups()`(work-session.ts)에서 각 재료의 출처 FORMULA VERSION
 * `sort_order`를 타이브레이크 기준으로 쓰기 때문에, 여기서 FORMULA VERSION의
 * `formula_version_ingredients.sort_order`를 재료 그룹 순서 기준으로 재계산해두기만 하면
 * WORK SESSION 쪽은 추가 수정 없이 그대로 그룹별로 모여서 뜬다.
 */
import { supabase } from "@/integrations/supabase/client";
import type { IngredientGroup } from "@/lib/pilot";

/** 그룹 id -> 정렬 순위(sort_order/name 기준). 그룹을 찾을 수 없으면 맨 뒤 취급. */
export function ingredientGroupRankMap(groups: IngredientGroup[]): Map<string, number> {
  const sorted = [...groups].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  return new Map(sorted.map((g, index) => [g.id, index]));
}

interface SortableIngredientRow {
  id: string;
  sort_order: number;
  ingredients: { group_id: string | null } | null;
}

function groupRankOf(
  row: SortableIngredientRow,
  rank: Map<string, number>,
  unclassifiedRank: number,
): number {
  const groupId = row.ingredients?.group_id ?? null;
  if (!groupId) return unclassifiedRank;
  return rank.get(groupId) ?? unclassifiedRank;
}

/**
 * 주어진 행들을 (그룹 순위, 기존 sort_order) 기준으로 재정렬한 새 sort_order 배열을 반환한다.
 * 그룹이 같으면 기존 순서(= 사용자가 손으로 잡아둔 세부 순서)를 그대로 유지하는 안정 정렬이다.
 * 그룹이 지정되지 않은(미분류) 재료는 맨 뒤로 보낸다.
 */
export function resortIngredientRows<T extends SortableIngredientRow>(
  rows: T[],
  groups: IngredientGroup[],
): { id: string; sort_order: number }[] {
  const rank = ingredientGroupRankMap(groups);
  const unclassifiedRank = groups.length;
  const ordered = [...rows].sort((a, b) => {
    const ra = groupRankOf(a, rank, unclassifiedRank);
    const rb = groupRankOf(b, rank, unclassifiedRank);
    if (ra !== rb) return ra - rb;
    return a.sort_order - b.sort_order;
  });
  return ordered.map((row, index) => ({ id: row.id, sort_order: index }));
}

/**
 * FORMULA VERSION 하나의 재료 목록을 그룹 기준으로 재정렬해서 DB에 반영한다.
 * 실제로 순서가 바뀐 행만 UPDATE한다(불필요한 쓰기 방지). addIngredient/removeRow
 * 성공 직후, 그리고 SETTINGS의 "지금 전체 정렬" 수동 버튼에서 호출한다.
 */
export async function resortFormulaVersionIngredientsByGroup(
  formulaVersionId: string,
  groups: IngredientGroup[],
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from("formula_version_ingredients")
    .select("id, sort_order, ingredients(group_id)")
    .eq("formula_version_id", formulaVersionId)
    .order("sort_order", { ascending: true });
  if (error) return { error: error.message };

  const rows = (data ?? []) as unknown as SortableIngredientRow[];
  const next = resortIngredientRows(rows, groups);
  const currentById = new Map(rows.map((r) => [r.id, r.sort_order]));
  const changed = next.filter(({ id, sort_order }) => currentById.get(id) !== sort_order);

  for (const { id, sort_order } of changed) {
    const { error: updateError } = await supabase
      .from("formula_version_ingredients")
      .update({ sort_order })
      .eq("id", id);
    if (updateError) return { error: updateError.message };
  }
  return { error: null };
}
