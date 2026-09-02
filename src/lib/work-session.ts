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
 * 그룹 자체는 ingredient 이름순으로 정렬하고, 그룹 안에서는 Formula 선택 순서(sortOrder)를 유지한다.
 */
export function buildWeighingGroups(params: {
  selections: WeighingSelection[];
  ingredientsByVersion: Record<string, VersionIngredientRow[]>;
  progressByLineId: Record<string, { status: string; note: string | null }>;
}): WeighingGroup[] {
  const groups = new Map<string, WeighingGroup>();
  const orderedSelections = [...params.selections].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const sel of orderedSelections) {
    const lines = params.ingredientsByVersion[sel.formulaVersionId] ?? [];
    for (const line of lines) {
      const ingredientId = line.ingredient_id;
      let group = groups.get(ingredientId);
      if (!group) {
        group = {
          ingredientId,
          ingredientName: ingredientDisplayName(line.ingredients),
          cells: [],
        };
        groups.set(ingredientId, group);
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

  return [...groups.values()].sort((a, b) =>
    a.ingredientName.localeCompare(b.ingredientName, "ko"),
  );
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
