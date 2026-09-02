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
 

