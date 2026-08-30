/**
 * PILOT — EXPERIMENT 도메인 헬퍼
 * 실험은 삭제/덮어쓰기하지 않는다. 상태 변경(CANCELLED)만 허용.
 * experiment_number는 사용자별 자동 증가이며 재사용하지 않는다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Experiment = Tables<"experiments">;
export type Observation = Tables<"observations">;

export const EXPERIMENT_STATUSES = [
  "PLANNED",
  "RUNNING",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/** #001, #042 형태의 실험 번호 라벨 */
export function experimentLabel(n: number | null | undefined): string {
  if (n == null) return "#---";
  return `#${String(n).padStart(3, "0")}`;
}

/**
 * Loss % = (raw - finished) / raw × 100 — 저장하지 않고 표시 시점에 계산한다
 * (formula-calc.ts의 "저장은 확정된 값만, 나머지는 계산" 원칙과 동일, 2026-08-30 P0 확정).
 * raw/finished 중 하나라도 없거나 raw가 0 이하이면 계산 불가(null).
 */
export function lossPct(
  rawWeightG: number | null | undefined,
  finishedWeightG: number | null | undefined,
): number | null {
  if (rawWeightG == null || finishedWeightG == null) return null;
  if (rawWeightG <= 0) return null;
  return ((rawWeightG - finishedWeightG) / rawWeightG) * 100;
}
