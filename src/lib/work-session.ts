/**
 * PRODUCTION / WEIGHING DASHBOARD — Work Session 도메인 헬퍼
 *
 * 절대 규칙:
 * - Formula Version의 원본 amount/unit은 여기서 절대 변경하지 않는다.
 * - Working quantity(= original_amount × multiplier)는 저장하지 않고 항상 read-time 계산한다.
 * - 동일 Ingredient가 여러 Formula에 등장해도 quantity를 합산하지 않는다 — grouping은 표시 편의일 뿐이다.
 */
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { ingredientDisplayName } from "@/lib/pilot";
import type { VersionIngredientRow } from "@/lib/queries";
 
export type WorkSession = Tables<"work_sessions">;
export type WorkSessionFormulaVersion = Tables<"work_session_formula_versions">;
export type WorkSessionMultiplierHistory = Tables<"work_session_multiplier_history">;
export type WorkSessionProgress = Tables<"work_session_progress">;
 
export const WORK_SESSION_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type WorkSessionStatus = (typeof WORK_SESSION_STATUSES)[number];
 
export const WORK_SESSION_PROGRESS_STATUSES = [
  "NOT_STARTED",
  "DONE",
  "SHORTAGE",
  "SKIPPED",
] as const;
export type WorkSessionProgressStatus = (typeof WORK_SESSION_PROGRESS_STATUSES)[number];
 
export const PROGRESS_STATUS_ICON: Record<WorkSessionProgressStatus, string> = {
  NOT_STARTED: "○",
  DONE: "☑",
  SHORTAGE: "⚠",
  SKIPPED: "⊘",
};
 
export const PROGRESS_STATUS_LABEL: Record<WorkSessionProgressStatus, string> = {
  NOT_STARTED: "NOT STARTED",
  DONE: "DONE",
  SHORTAGE: "SHORTAGE",
  SKIPPED: "SKIPPED",
};
 
/** 원본 amount × multiplier — 저장하지 않고 화면에 표시할 때만 계산한다 */
export function workingAmount(originalAmount: number, multiplier: number): number {
  return originalAmount * multiplier;
}
 
/* ── Weighing View grouping (Ingredient Master ID 기준) ─────────── */
 
export interface WeighingCell {
  /** work_session_formula_versions.id — 열(컬럼)의 실제 식별자. 같은 FORMULA VERSION이 두 번
   * 이상 선택돼도(2026-10-07, 동일 포뮬라 중복 추가 허용) 각 선택마다 고유하다. */
  selectionId: string;
  formulaVersionId: string;
  formulaName: string;
  ingredientLineId: string;
  amount: number;
  unit: string;
  multiplier: number;
  workingAmount: number;
  progressStatus: WorkSessionProgressStatus;
  note: string | null;
  /** 표시 전용 보조 계량(예: 계란 개수) — Formula 페이지/버전 비교 시트와 동일하게, 배수만큼
   * 곱해서 함께 보여준다. %/계산에는 관여하지 않는다. */
  secondaryAmount: number | null;
  secondaryUnit: string | null;
}

export interface WeighingGroup {
  ingredientId: string;
  ingredientName: string;
  cells: WeighingCell[];
}

export interface WeighingSelection {
  /** work_session_formula_versions.id — 열의 고유 키(동일 FORMULA VERSION 중복 추가 시에도 구분됨) */
  selectionId: string;
  formulaVersionId: string;
  formulaName: string;
  multiplier: number;
  sortOrder: number;
}

/**
 * Ingredient Master ID(ingredient_id) 기준으로 그룹화한다 — 이름 문자열 비교는 절대 하지 않는다.
 * quantity는 절대 합산하지 않고, Formula×Ingredient 라인 하나하나가 독립된 cell로 남는다.
 *
 * 정렬 기준: 재료 이름순이 아니라 "어느 Formula 열(컬럼)에 걸쳐 있는지"로 정렬한다.
 * 특정 Formula에만 쓰이는 재료는 그 Formula 열 쪽으로 몰리고, 여러 Formula에 공통으로 쓰이는
 * 재료는 그 Formula들 사이(중간)에 자연스럽게 위치하게 된다 — 겹치는 재료를 한눈에 찾기 위함.
 * (컬럼 index의 최소~최대 구간으로 정렬 → 구간이 겹치면 이름순으로 tie-break)
 *
 * 열(컬럼) 식별은 formula_version_id가 아니라 selectionId(work_session_formula_versions.id)로
 * 한다(2026-10-07) — 같은 FORMULA VERSION을 두 번 추가해도(예: 같은 레시피를 다른 몰드/배치로)
 * 서로 다른 열로 분리되고, 계량 진행상태도 선택마다 독립적으로 유지된다. 재료 목록 자체는
 * formula_version_id로 조회하므로(ingredientsByVersion) 같은 포뮬라의 두 선택이 같은 재료
 * 목록을 그대로 공유하는 건 의도된 동작이다.
 */
export function buildWeighingGroups(params: {
  selections: WeighingSelection[];
  ingredientsByVersion: Record<string, VersionIngredientRow[]>;
  /** key: `${selectionId}:${formula_version_ingredient_id}` */
  progressBySelectionAndLine: Record<string, { status: string; note: string | null }>;
}): WeighingGroup[] {
  const groups = new Map<
    string,
    WeighingGroup & { minCol: number; maxCol: number; firstSortOrder: number }
  >();
  const orderedSelections = [...params.selections].sort((a, b) => a.sortOrder - b.sortOrder);
  const columnIndex = new Map<string, number>();
  orderedSelections.forEach((sel, idx) => columnIndex.set(sel.selectionId, idx));

  for (const sel of orderedSelections) {
    // Formula 페이지에서 정해둔 재료 배치 순서(sort_order)를 그대로 따른다 — 이미 정렬된 채로 넘어온다.
    const lines = params.ingredientsByVersion[sel.formulaVersionId] ?? [];
    const colIdx = columnIndex.get(sel.selectionId) ?? 0;
    for (const line of lines) {
      const ingredientId = line.ingredient_id;
      let group = groups.get(ingredientId);
      if (!group) {
        group = {
          ingredientId,
          ingredientName: ingredientDisplayName(line.ingredients),
          cells: [],
          minCol: colIdx,
          maxCol: colIdx,
          firstSortOrder: line.sort_order,
        };
        groups.set(ingredientId, group);
      } else {
        group.minCol = Math.min(group.minCol, colIdx);
        group.maxCol = Math.max(group.maxCol, colIdx);
        group.firstSortOrder = Math.min(group.firstSortOrder, line.sort_order);
      }
      const progress = params.progressBySelectionAndLine[`${sel.selectionId}:${line.id}`];
      group.cells.push({
        selectionId: sel.selectionId,
        formulaVersionId: sel.formulaVersionId,
        formulaName: sel.formulaName,
        ingredientLineId: line.id,
        amount: Number(line.amount),
        unit: line.unit,
        multiplier: sel.multiplier,
        workingAmount: workingAmount(Number(line.amount), sel.multiplier),
        progressStatus: (progress?.status as WorkSessionProgressStatus) ?? "NOT_STARTED",
        note: progress?.note ?? null,
        secondaryAmount: line.secondary_amount != null ? Number(line.secondary_amount) : null,
        secondaryUnit: line.secondary_unit ?? null,
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.minCol !== b.minCol) return a.minCol - b.minCol;
    if (a.maxCol !== b.maxCol) return a.maxCol - b.maxCol;
    // 같은 Formula 열에 속하면 그 Formula에서 정해둔 재료 배치 순서(sort_order)를 따른다 — 이름순 아님
    return a.firstSortOrder - b.firstSortOrder;
  });
}
 
/** Multiplier History에 남길 스냅샷 — 적용 당시 계산된 working quantity를 그대로 기록한다 */
export function buildMultiplierSnapshot(
  lines: VersionIngredientRow[],
  multiplier: number,
): {
  ingredient_line_id: string;
  ingredient_id: string;
  ingredient_name: string;
  original_amount: number;
  unit: string;
  working_amount: number;
}[] {
  return lines.map((line) => ({
    ingredient_line_id: line.id,
    ingredient_id: line.ingredient_id,
    ingredient_name: ingredientDisplayName(line.ingredients),
    original_amount: Number(line.amount),
    unit: line.unit,
    working_amount: workingAmount(Number(line.amount), multiplier),
  }));
}

/* ── PRODUCTION: 목표(몰드 또는 기본중량) 기준 배수 자동 계산 ─────────
 * 목표(몰드의 "기준 반죽량(g)", 또는 기본중량 프리셋의 "기준중량(g)")와 개수,
 * 그리고 BASE(×1) 레시피의 총 반죽량을 알면 목표를 몇 개 만들지로부터
 * 필요한 배수를 역산할 수 있다.
 *   배수 = (기준값 × 개수) ÷ BASE 총 반죽량
 * 제품군(COMPONENT)의 scaling_mode에 따라 "목표"가 몰드(reference_weight_g)인지
 * 기본중량 프리셋(weight_g)인지만 다를 뿐, 계산식 자체는 동일하다.
 */

/** BASE(×1) 재료 라인들의 총 무게(g) — %/배수 계산과 동일하게 amount(그램) 합산만 사용한다 */
export function sumBaseGrams(lines: VersionIngredientRow[]): number {
  return lines.reduce((sum, line) => sum + Number(line.amount), 0);
}

const MULTIPLIER_MATCH_EPSILON = 0.01;

/** 목표 기준값(g) + 개수 + BASE 총량으로부터 제안 배수를 계산한다. 필요한 값이 없으면 null. */
export function suggestedMultiplierFromTarget(
  targetWeightG: number | null | undefined,
  qty: number | null,
  baseTotalGrams: number | null,
): number | null {
  if (targetWeightG == null) return null;
  if (qty == null || !(qty > 0)) return null;
  if (baseTotalGrams == null || !(baseTotalGrams > 0)) return null;
  return (targetWeightG * qty) / baseTotalGrams;
}

/** 몰드 + 개수 + BASE 총량으로부터 제안 배수를 계산한다. 필요한 값이 없으면 null. */
export function suggestedMultiplierFromMould(
  mould: { reference_weight_g: number | null } | null | undefined,
  qty: number | null,
  baseTotalGrams: number | null,
): number | null {
  return suggestedMultiplierFromTarget(mould?.reference_weight_g, qty, baseTotalGrams);
}

/** 기본중량 프리셋 + 개수 + BASE 총량으로부터 제안 배수를 계산한다. 필요한 값이 없으면 null. */
export function suggestedMultiplierFromBaseWeight(
  baseWeight: { weight_g: number | null } | null | undefined,
  qty: number | null,
  baseTotalGrams: number | null,
): number | null {
  return suggestedMultiplierFromTarget(baseWeight?.weight_g, qty, baseTotalGrams);
}

/**
 * 목표(몰드/기본중량)+개수가 선택된 상태에서, 현재 배수 입력값이 그 조합의 제안 배수와
 * 다르면 "CUSTOM"(수동으로 어긋난 값)으로 취급한다. 목표가 선택되지 않았다면 원래부터
 * 목표와 무관한 수동 배수이므로 CUSTOM 취급하지 않는다.
 */
export function isCustomMultiplier(current: number | null, suggested: number | null): boolean {
  if (suggested == null) return false;
  if (current == null) return true;
  return Math.abs(current - suggested) > MULTIPLIER_MATCH_EPSILON;
}

/* ── WORK SESSION 병합(2026-10-07) ────────────────────────────────
 * 사용자 요청: "work session끼리 병합하는 기능" — 예를 들어 서로 다른 주문(hamish, geeky
 * couple tiramisu)으로 각각 만들어진 Work Session을 실제로는 같이 작업할 때 하나로 합친다.
 *
 * sourceId를 targetId로 흡수시킨다: sourceId의 CORE/DECORATIVE 배합 선택, 계량 진행상태,
 * 배수 히스토리, 워크플로 TASK를 모두 targetId로 옮기고 sourceId는 삭제한다.
 *
 * 2026-10-07 수정: "같은 FORMULA VERSION도 중복 추가 가능하게" 요청에 맞춰, 병합 시에도 더 이상
 * 중복 선택을 버리거나 CORE 슬롯 충돌을 이유로 DECORATIVE로 내리지 않는다 — source의 모든 선택을
 * 그대로 옮긴다. 계량 진행상태/배수 히스토리는 이제 "어느 선택(work_session_formula_versions
 * 행)"인지로 식별되므로(formula_version_id가 같아도 선택 id는 서로 다름), 두 세션에 같은
 * 포뮬라가 있었더라도 충돌 없이 전부 옮겨진다.
 *
 * - TASK 목록은 sort_order를 target 뒤로 이어붙인다. task_id/predecessor_task_id 자체는
 *   바뀌지 않으므로(행이 그대로 이동할 뿐) 선후관계는 그대로 유지된다.
 * - source의 주문 연결(order_id)은 target에 아직 연결된 주문이 없을 때만 넘겨받고, 그 외의
 *   경우 어느 주문에서 왔는지를 target의 NOTES에 남겨서 정보가 사라지지 않게 한다.
 * - 진짜 DB 트랜잭션은 아니지만(Supabase 클라이언트 제약 — 이 코드베이스의 다른 다단계
 *   mutation들과 동일한 패턴), 중간에 실패하면 에러를 그대로 던져 호출부에서 보이게 한다.
 */
export async function mergeWorkSessions(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("같은 WORK SESSION입니다");

  const { data: sourceRows, error: srcErr } = await supabase
    .from("work_session_formula_versions")
    .select("id, sort_order")
    .eq("work_session_id", sourceId)
    .order("sort_order", { ascending: true });
  if (srcErr) throw srcErr;

  const { data: targetRows, error: tgtErr } = await supabase
    .from("work_session_formula_versions")
    .select("sort_order")
    .eq("work_session_id", targetId);
  if (tgtErr) throw tgtErr;

  let nextSort = (targetRows ?? []).reduce((max, r) => Math.max(max, r.sort_order), -1) + 1;

  // 선택(동일 FORMULA VERSION 중복 포함)을 그대로 전부 옮긴다 — kind/slot도 바꾸지 않는다.
  for (const row of sourceRows ?? []) {
    const { error } = await supabase
      .from("work_session_formula_versions")
      .update({ work_session_id: targetId, sort_order: nextSort })
      .eq("id", row.id);
    if (error) throw error;
    nextSort += 1;
  }

  // 계량 진행상태/배수 히스토리는 선택(work_session_formula_versions 행) 단위로 식별되어
  // 더 이상 충돌할 수 없으므로, work_session_id만 그대로 옮기면 된다.
  {
    const { error } = await supabase
      .from("work_session_progress")
      .update({ work_session_id: targetId })
      .eq("work_session_id", sourceId);
    if (error) throw error;
  }
  {
    const { error } = await supabase
      .from("work_session_multiplier_history")
      .update({ work_session_id: targetId })
      .eq("work_session_id", sourceId);
    if (error) throw error;
  }

  // TASK — target 뒤로 sort_order를 이어붙여서 옮긴다. predecessor 관계는 task id 자체가
  // 바뀌지 않으므로(행이 그대로 이동) 손댈 필요가 없다.
  const { data: targetTasks, error: ttErr } = await supabase
    .from("work_session_tasks")
    .select("sort_order")
    .eq("work_session_id", targetId);
  if (ttErr) throw ttErr;
  let nextTaskSort = (targetTasks ?? []).reduce((max, t) => Math.max(max, t.sort_order), -1) + 1;

  const { data: sourceTasks, error: stErr } = await supabase
    .from("work_session_tasks")
    .select("id")
    .eq("work_session_id", sourceId)
    .order("sort_order", { ascending: true });
  if (stErr) throw stErr;

  for (const task of sourceTasks ?? []) {
    const { error } = await supabase
      .from("work_session_tasks")
      .update({ work_session_id: targetId, sort_order: nextTaskSort })
      .eq("id", task.id);
    if (error) throw error;
    nextTaskSort += 1;
  }

  // task_ingredients/task_predecessors는 work_session_id가 중복 저장돼 있을 뿐이라 함께 갈아준다.
  {
    const { error } = await supabase
      .from("work_session_task_ingredients")
      .update({ work_session_id: targetId })
      .eq("work_session_id", sourceId);
    if (error) throw error;
  }
  {
    const { error } = await supabase
      .from("work_session_task_predecessors")
      .update({ work_session_id: targetId })
      .eq("work_session_id", sourceId);
    if (error) throw error;
  }

  // NOTES/주문 연결 — source 정보를 잃지 않고 옮긴다.
  const { data: sourceSession, error: ssErr } = await supabase
    .from("work_sessions")
    .select("name, notes, order_id, orders(order_number)")
    .eq("id", sourceId)
    .single();
  if (ssErr) throw ssErr;
  const { data: targetSession, error: tsErr } = await supabase
    .from("work_sessions")
    .select("notes, order_id")
    .eq("id", targetId)
    .single();
  if (tsErr) throw tsErr;

  const orderLabel = sourceSession.orders?.order_number
    ? `ORDER ${sourceSession.orders.order_number}`
    : null;
  const mergeLine = `[MERGED FROM "${sourceSession.name}"${orderLabel ? ` · ${orderLabel}` : ""} — ${new Date().toISOString().slice(0, 10)}]`;
  const combinedNotes = [targetSession.notes?.trim(), mergeLine, sourceSession.notes?.trim()]
    .filter((v): v is string => Boolean(v && v.length > 0))
    .join("\n");

  const patch: TablesUpdate<"work_sessions"> = { notes: combinedNotes };
  if (!targetSession.order_id && sourceSession.order_id) {
    patch.order_id = sourceSession.order_id;
  }
  {
    const { error } = await supabase.from("work_sessions").update(patch).eq("id", targetId);
    if (error) throw error;
  }

  // 소스 세션 삭제 — 남은 참조는 FK(ON DELETE CASCADE/SET NULL)로 정리된다.
  {
    const { error } = await supabase.from("work_sessions").delete().eq("id", sourceId);
    if (error) throw error;
  }
}

