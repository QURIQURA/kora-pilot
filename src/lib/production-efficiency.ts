/**
 * PRODUCTION EFFICIENCY — Work Session/Task 실측 데이터로 "시간당 몇 개 만드는지" 계산.
 *
 * 절대 규칙(2026-10-06, 사용자 요청):
 * - 노동비 계산이 목적이 아니다 — Minutes/Unit, Units/Hour로 "어디서 시간을 줄일 수 있는지" 찾는 게 목적.
 * - Target Time(목표시간) 개념은 아직 없다 — 실측 데이터가 먼저 쌓이고, 나중에 사용자가 직접 설정한다.
 * - Active Labour Time(실제 작업시간, 수동입력)과 Elapsed Time(경과시간, actual_started_at~completed_at
 *   자동계산)은 구분한다 — KPI는 전부 Active Labour Time 기준.
 * - Component와 무관한 단계(Assembly 등)는 완제품 개수로 통일해서 기록한다(환산 없음).
 */
import type { Tables } from "@/integrations/supabase/types";

export type WorkSessionEfficiencyRow = Tables<"work_sessions"> & {
  work_session_tasks: Tables<"work_session_tasks">[];
};

export interface ComponentGramsRow {
  formula_version_id: string | null;
  quantity_g: number | null;
  product_size_id: string | null;
}

/** product_components 원본 행들로부터, 특정 Size(세션이 그때 쓴 product_size_id) 기준
 * Formula Version → 1단위당 필요한 양(g) 맵을 만든다. Size 지정 행을 우선하고, 없으면
 * 사이즈 미지정("전체") 행으로 보충한다. */
export function buildGramsPerUnitMap(
  rows: ComponentGramsRow[],
  productSizeId: string | null,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!row.formula_version_id || row.quantity_g == null) continue;
    if (row.product_size_id != null && row.product_size_id !== productSizeId) continue;
    if (row.product_size_id === productSizeId || map[row.formula_version_id] == null) {
      map[row.formula_version_id] = Number(row.quantity_g);
    }
  }
  return map;
}

/** output_unit이 이미 "완제품 개수" 단위인지 판정 — 이 경우 그램 환산 없이 그대로 쓴다. */
const COUNT_UNITS = ["개", "장", "ea", "pcs", "piece", "조각", "판", "box", "박스"];

export function isCountUnit(unit: string | null): boolean {
  if (!unit) return false;
  return COUNT_UNITS.includes(unit.trim().toLowerCase());
}

/**
 * 이 Task의 "실제 완성 개수 환산"을 계산한다.
 * - output_unit이 완제품 개수 단위면 output_quantity 그대로.
 * - 그 외(g 등 무게 단위)면 output_quantity ÷ (그 Product에서 이 Component에 필요한 양).
 *   필요한 양은 product_components.quantity_g(formula_version_id로 매칭)에서 가져온다.
 * - 환산할 방법이 없으면 null.
 */
export function stepUnitsProduced(
  task: Pick<Tables<"work_session_tasks">, "formula_version_id" | "output_quantity" | "output_unit">,
  gramsPerUnitByFormulaVersionId: Record<string, number>,
): number | null {
  if (task.output_quantity == null) return null;
  const qty = Number(task.output_quantity);
  if (isCountUnit(task.output_unit)) return qty;
  const gramsPerUnit = task.formula_version_id
    ? gramsPerUnitByFormulaVersionId[task.formula_version_id]
    : undefined;
  if (gramsPerUnit == null || !(gramsPerUnit > 0)) return null;
  return qty / gramsPerUnit;
}

/** Step 하나의 Minutes/Unit — Active Labour Time ÷ 그 Step의 환산 개수. 계산 불가하면 null. */
export function stepMinutesPerUnit(
  task: Pick<Tables<"work_session_tasks">, "active_labour_minutes">,
  unitsProduced: number | null,
): number | null {
  if (task.active_labour_minutes == null) return null;
  if (unitsProduced == null || !(unitsProduced > 0)) return null;
  return Number(task.active_labour_minutes) / unitsProduced;
}

export interface StepSummary {
  taskId: string;
  taskName: string;
  taskType: string | null;
  activeLabourMinutes: number | null;
  elapsedMinutes: number | null;
  unitsProduced: number | null;
  minutesPerUnit: number | null;
}

export interface SessionEfficiencySummary {
  sessionId: string;
  sessionName: string;
  completedAt: string | null;
  targetUnitCount: number | null;
  totalActiveLabourMinutes: number;
  /** 세션 전체 Minutes/Unit = Σ Active Labour Time ÷ Batch Size(target_unit_count) */
  minutesPerUnit: number | null;
  unitsPerHour: number | null;
  steps: StepSummary[];
  /** 가장 많은 Active Labour Time을 차지한 Step */
  bottleneckStep: StepSummary | null;
}

function elapsedMinutesOf(task: Tables<"work_session_tasks">): number | null {
  if (!task.actual_started_at || !task.completed_at) return null;
  const ms = new Date(task.completed_at).getTime() - new Date(task.actual_started_at).getTime();
  return ms > 0 ? ms / 60000 : null;
}

/** 한 Work Session의 효율 요약 — gramsPerUnitByFormulaVersionId는 그 세션의 product_id(+size)로 미리 조회해둔다. */
export function summarizeSessionEfficiency(
  session: Tables<"work_sessions">,
  tasks: Tables<"work_session_tasks">[],
  gramsPerUnitByFormulaVersionId: Record<string, number>,
): SessionEfficiencySummary {
  const steps: StepSummary[] = tasks.map((task) => {
    const unitsProduced = stepUnitsProduced(task, gramsPerUnitByFormulaVersionId);
    return {
      taskId: task.id,
      taskName: task.task_name,
      taskType: task.task_type,
      activeLabourMinutes: task.active_labour_minutes != null ? Number(task.active_labour_minutes) : null,
      elapsedMinutes: elapsedMinutesOf(task),
      unitsProduced,
      minutesPerUnit: stepMinutesPerUnit(task, unitsProduced),
    };
  });

  const totalActiveLabourMinutes = steps.reduce((sum, s) => sum + (s.activeLabourMinutes ?? 0), 0);
  const targetUnitCount = session.target_unit_count != null ? Number(session.target_unit_count) : null;
  const minutesPerUnit =
    targetUnitCount != null && targetUnitCount > 0 && totalActiveLabourMinutes > 0
      ? totalActiveLabourMinutes / targetUnitCount
      : null;

  const bottleneckStep = steps.reduce<StepSummary | null>((best, s) => {
    if (s.activeLabourMinutes == null) return best;
    if (!best || (best.activeLabourMinutes ?? 0) < s.activeLabourMinutes) return s;
    return best;
  }, null);

  return {
    sessionId: session.id,
    sessionName: session.name,
    completedAt: session.completed_at,
    targetUnitCount,
    totalActiveLabourMinutes,
    minutesPerUnit,
    unitsPerHour: minutesPerUnit != null && minutesPerUnit > 0 ? 60 / minutesPerUnit : null,
    steps,
    bottleneckStep,
  };
}

export interface ProductEfficiencyStats {
  sessionCount: number;
  avgMinutesPerUnit: number | null;
  bestMinutesPerUnit: number | null;
  recentMinutesPerUnit: number | null;
  avgUnitsPerHour: number | null;
  /** task_type(없으면 task_name)별 Active Labour Time 합산 비중 */
  stepTimeShare: { label: string; minutes: number; share: number }[];
  /** Batch size(target_unit_count)별 평균 Minutes/Unit */
  batchSizeEfficiency: { batchSize: number; avgMinutesPerUnit: number; sessionCount: number }[];
  sessions: SessionEfficiencySummary[];
}

/** 여러 Work Session의 요약을 Product 단위로 집계 — PRODUCTS 상세 EFFICIENCY 섹션과
 * EFFICIENCY 대시보드가 공유하는 핵심 집계 로직. */
export function aggregateProductEfficiency(summaries: SessionEfficiencySummary[]): ProductEfficiencyStats {
  // 최근 기록 순(완료일 내림차순, 없으면 session id 순서 그대로)으로 정렬해 들어온다고 가정 — 호출부에서 정렬.
  const withMinutesPerUnit = summaries.filter((s) => s.minutesPerUnit != null);
  const values = withMinutesPerUnit.map((s) => s.minutesPerUnit!);

  const avgMinutesPerUnit = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const bestMinutesPerUnit = values.length > 0 ? Math.min(...values) : null;
  const recentMinutesPerUnit = withMinutesPerUnit[0]?.minutesPerUnit ?? null;
  const avgUnitsPerHour = avgMinutesPerUnit != null && avgMinutesPerUnit > 0 ? 60 / avgMinutesPerUnit : null;

  const stepMinutesByLabel = new Map<string, number>();
  for (const s of summaries) {
    for (const step of s.steps) {
      if (step.activeLabourMinutes == null) continue;
      const label = step.taskType ?? step.taskName;
      stepMinutesByLabel.set(label, (stepMinutesByLabel.get(label) ?? 0) + step.activeLabourMinutes);
    }
  }
  const totalStepMinutes = [...stepMinutesByLabel.values()].reduce((a, b) => a + b, 0);
  const stepTimeShare = [...stepMinutesByLabel.entries()]
    .map(([label, minutes]) => ({
      label,
      minutes,
      share: totalStepMinutes > 0 ? minutes / totalStepMinutes : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const batchGroups = new Map<number, number[]>();
  for (const s of summaries) {
    if (s.targetUnitCount == null || s.minutesPerUnit == null) continue;
    const list = batchGroups.get(s.targetUnitCount) ?? [];
    list.push(s.minutesPerUnit);
    batchGroups.set(s.targetUnitCount, list);
  }
  const batchSizeEfficiency = [...batchGroups.entries()]
    .map(([batchSize, list]) => ({
      batchSize,
      avgMinutesPerUnit: list.reduce((a, b) => a + b, 0) / list.length,
      sessionCount: list.length,
    }))
    .sort((a, b) => a.batchSize - b.batchSize);

  return {
    sessionCount: summaries.length,
    avgMinutesPerUnit,
    bestMinutesPerUnit,
    recentMinutesPerUnit,
    avgUnitsPerHour,
    stepTimeShare,
    batchSizeEfficiency,
    sessions: summaries,
  };
}

export function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  return `${min.toFixed(1)}분`;
}

export function fmtUnitsPerHour(uph: number | null): string {
  if (uph == null) return "—";
  return `${uph.toFixed(1)}개/시간`;
}
