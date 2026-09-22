/**
 * PRODUCTION / WEIGHING DASHBOARD — Work Session 도메인 헬퍼
 *
 * 절대 규칙:
 * - Formula Version의 원본 amount/unit은 여기서 절대 변경하지 않는다.
 * - Working quantity(= original_amount × multiplier)는 저장하지 않고 항상 read-time 계산한다.
 * - 동일 Ingredient가 여러 Formula에 등장해도 quantity를 합산하지 않는다 — grouping은 표시 편의일 뿐이다.
 */
import type { Tables } from "@/integrations/supabase/types";
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
 */
export function buildWeighingGroups(params: {
  selections: WeighingSelection[];
  ingredientsByVersion: Record<string, VersionIngredientRow[]>;
  progressByLineId: Record<string, { status: string; note: string | null }>;
}): WeighingGroup[] {
  const groups = new Map<string, WeighingGroup & { minCol: number; maxCol: number }>();
  const orderedSelections = [...params.selections].sort((a, b) => a.sortOrder - b.sortOrder);
  const columnIndex = new Map<string, number>();
  orderedSelections.forEach((sel, idx) => columnIndex.set(sel.formulaVersionId, idx));
 
  for (const sel of orderedSelections) {
    const lines = params.ingredientsByVersion[sel.formulaVersionId] ?? [];
    const colIdx = columnIndex.get(sel.formulaVersionId) ?? 0;
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
        };
        groups.set(ingredientId, group);
      } else {
        group.minCol = Math.min(group.minCol, colIdx);
        group.maxCol = Math.max(group.maxCol, colIdx);
      }
      const progress = params.progressByLineId[line.id];
      group.cells.push({
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
    return a.ingredientName.localeCompare(b.ingredientName, "ko");
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

/* ── PRODUCTION: 몰드 기준 배수 자동 계산 ──────────────────────────
 * 몰드의 "기준 반죽량(g)"(실측값)과 개수, 그리고 BASE(×1) 레시피의 총 반죽량을 알면
 * 목표 몰드를 몇 개 만들지로부터 필요한 배수를 역산할 수 있다.
 *   배수 = (기준 반죽량 × 개수) ÷ BASE 총 반죽량
 */

/** BASE(×1) 재료 라인들의 총 무게(g) — %/배수 계산과 동일하게 amount(그램) 합산만 사용한다 */
export function sumBaseGrams(lines: VersionIngredientRow[]): number {
  return lines.reduce((sum, line) => sum + Number(line.amount), 0);
}

const MULTIPLIER_MATCH_EPSILON = 0.01;

/** 몰드 + 개수 + BASE 총량으로부터 제안 배수를 계산한다. 필요한 값이 없으면 null. */
export function suggestedMultiplierFromMould(
  mould: { reference_weight_g: number | null } | null | undefined,
  qty: number | null,
  baseTotalGrams: number | null,
): number | null {
  if (!mould || mould.reference_weight_g == null) return null;
  if (qty == null || !(qty > 0)) return null;
  if (baseTotalGrams == null || !(baseTotalGrams > 0)) return null;
  return (mould.reference_weight_g * qty) / baseTotalGrams;
}

/**
 * 몰드+개수가 선택된 상태에서, 현재 배수 입력값이 그 조합의 제안 배수와 다르면
 * "CUSTOM"(수동으로 어긋난 값)으로 취급한다. 몰드가 선택되지 않았다면 원래부터
 * 몰드와 무관한 수동 배수이므로 CUSTOM 취급하지 않는다.
 */
export function isCustomMultiplier(current: number | null, suggested: number | null): boolean {
  if (suggested == null) return false;
  if (current == null) return true;
  return Math.abs(current - suggested) > MULTIPLIER_MATCH_EPSILON;
}
 

