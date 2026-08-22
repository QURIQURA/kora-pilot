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
