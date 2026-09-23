/**
 * PRODUCTION WORKFLOW TIMELINE — Work Session Task 도메인 헬퍼
 *
 * 절대 규칙:
 * - duration은 저장하지 않는다 — 항상 planned_end_at - planned_start_at으로 계산한다.
 * - Time gap(대기 시간)은 별도 엔티티가 아니다 — 두 Task 사이의 빈 타임라인 공간일 뿐이다.
 * - 자동 scheduling / dependency 엔진은 여기 없다 — predecessor_task_id는 순서 표시용 데이터일 뿐이다.
 */
import type { Tables } from "@/integrations/supabase/types";
import { localDateTimeToISO, toLocalDateString } from "@/lib/datetime";

export type WorkSessionTask = Tables<"work_session_tasks">;

export const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "DONE", "SKIPPED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_ICON: Record<TaskStatus, string> = {
  NOT_STARTED: "○",
  IN_PROGRESS: "●",
  DONE: "☑",
  SKIPPED: "⊘",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "NOT STARTED",
  IN_PROGRESS: "IN PROGRESS",
  DONE: "DONE",
  SKIPPED: "SKIPPED",
};

/** UI 빠른 선택용 제안일 뿐 — DB enum 아님, 사용자가 자유 입력 가능 */
export const TASK_TYPE_SUGGESTIONS = [
  "Mix",
  "Cook",
  "Bake",
  "Cool",
  "Chill",
  "Rest",
  "Freeze",
  "Prepare",
  "Assemble",
  "Finish",
  "Pack",
];

export function nextTaskStatus(current: TaskStatus): TaskStatus {
  const idx = TASK_STATUSES.indexOf(current);
  return TASK_STATUSES[(idx + 1) % TASK_STATUSES.length] ?? "NOT_STARTED";
}

/**
 * TASK TYPE별 색상 팔레트 — 배지(badge)용 연한 색과 타임라인 연결선(line)용 진한 색이 짝을 이룬다.
 * 사용자가 TASK TYPE마다 이 팔레트 중 하나를 직접 골라 task_type_colors에 저장할 수 있다(2026-09-23).
 */
export const TASK_TYPE_PALETTE: { badge: string; line: string }[] = [
  { badge: "bg-amber-100 text-amber-900 border-amber-300", line: "bg-amber-400" },
  { badge: "bg-blue-100 text-blue-900 border-blue-300", line: "bg-blue-400" },
  { badge: "bg-emerald-100 text-emerald-900 border-emerald-300", line: "bg-emerald-400" },
  { badge: "bg-rose-100 text-rose-900 border-rose-300", line: "bg-rose-400" },
  { badge: "bg-violet-100 text-violet-900 border-violet-300", line: "bg-violet-400" },
  { badge: "bg-cyan-100 text-cyan-900 border-cyan-300", line: "bg-cyan-400" },
  { badge: "bg-orange-100 text-orange-900 border-orange-300", line: "bg-orange-400" },
  { badge: "bg-lime-100 text-lime-900 border-lime-300", line: "bg-lime-400" },
];

/** 하위 호환/색상 선택 UI용 — 배지 클래스만 뽑아둔 목록 */
export const TASK_TYPE_COLOR_CLASSES = TASK_TYPE_PALETTE.map((p) => p.badge);

/** TASK TYPE 이름 → color_class 매핑 키(대소문자/양끝 공백 무시) */
export function taskTypeColorKey(taskType: string): string {
  return taskType.trim().toLowerCase();
}

function paletteIndexForType(taskType: string): number {
  let hash = 0;
  for (let i = 0; i < taskType.length; i++) hash = (hash * 31 + taskType.charCodeAt(i)) >>> 0;
  return hash % TASK_TYPE_PALETTE.length;
}

/**
 * TASK TYPE 배지 색상 — overrides에 사용자가 직접 고른 색이 있으면 그걸 쓰고, 없으면 기존처럼
 * 이름 해시로 항상 같은 기본색을 고정 배정한다(2026-09-23: 사용자 지정 색 기능 추가).
 */
export function taskTypeColorClass(
  taskType: string | null | undefined,
  overrides?: Record<string, string>,
): string {
  if (!taskType) return "bg-muted text-muted-foreground border-border";
  const override = overrides?.[taskTypeColorKey(taskType)];
  if (override) return override;
  return TASK_TYPE_PALETTE[paletteIndexForType(taskType)]!.badge;
}

/** taskTypeColorClass와 짝을 이루는 진한 색 — 타임라인의 시작-종료 연결선에 쓴다(2026-09-24) */
export function taskTypeLineColorClass(
  taskType: string | null | undefined,
  overrides?: Record<string, string>,
): string {
  if (!taskType) return "bg-muted-foreground/40";
  const override = overrides?.[taskTypeColorKey(taskType)];
  if (override) {
    const idx = TASK_TYPE_PALETTE.findIndex((p) => p.badge === override);
    if (idx >= 0) return TASK_TYPE_PALETTE[idx]!.line;
  }
  return TASK_TYPE_PALETTE[paletteIndexForType(taskType)]!.line;
}

/* ── Timeline 좌표 계산 (compute, don't store) ───────────────────── */
/* 세로형 24시간 축: 행(row)=시간, 열(column)=품목(Formula/GENERAL) */

export const DEFAULT_TIMELINE_START_HOUR = 0;
export const DEFAULT_TIMELINE_END_HOUR = 24;
/** 타임라인에 한 번에 보여주는 창(window) 길이 — 24시간 전체 대신 시작 시각 기준 4시간만 표시(2026-09-24) */
export const TIMELINE_WINDOW_HOURS = 4;

/** 두 ISO 타임스탬프 사이의 분(minute) 차이 (end - start) */
export function minutesBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
}

/** 주어진 로컬 날짜("YYYY-MM-DD") 자정부터 ISO 타임스탬프까지 경과한 분 */
export function minutesFromDayStart(iso: string, dayStr: string): number {
  const dayStartIso = localDateTimeToISO(dayStr, "00:00");
  return minutesBetween(dayStartIso, iso);
}

export interface TimelineRange {
  /** Timeline의 기준 날짜(로컬) — Task가 하나도 없으면 오늘 */
  dayStr: string;
  /** 자정 기준 시작 분 — 항상 0(00:00), 24시간 전체를 보여준다 */
  startMinute: number;
  /** 자정 기준 끝 분 — 항상 1440(24:00) */
  endMinute: number;
}

/**
 * TASK의 "실제 표시 시작 시각" — 계획 시작 시각(planned_start_at)과 실제 시작 시각(actual_started_at)
 * 중 더 이른 쪽을 쓴다(2026-09-24: 계획보다 일찍 실제로 시작한 경우, 타임라인이 그 실제 시각을 반영해야
 * 한다는 피드백). 계획만 있으면 계획을, 실제만 있으면 실제를 쓴다.
 */
function effectiveStartAt(
  task: Pick<WorkSessionTask, "planned_start_at" | "actual_started_at">,
): string | null {
  if (task.planned_start_at && task.actual_started_at) {
    return task.actual_started_at < task.planned_start_at
      ? task.actual_started_at
      : task.planned_start_at;
  }
  return task.planned_start_at ?? task.actual_started_at ?? null;
}

/** 위와 대칭 — 계획 종료 시각과 실제 완료 시각 중 더 이른 쪽 */
function effectiveEndAt(
  task: Pick<WorkSessionTask, "planned_end_at" | "completed_at">,
): string | null {
  if (task.planned_end_at && task.completed_at) {
    return task.completed_at < task.planned_end_at ? task.completed_at : task.planned_end_at;
  }
  return task.planned_end_at ?? task.completed_at ?? null;
}

/**
 * Timeline은 24시간 전체 대신, 시간이 지정된 Task 중 가장 이른 시각(계획 시작 또는 실제 시작 중
 * 이른 쪽)을 기준으로 TIMELINE_WINDOW_HOURS(4시간)만 보여준다(2026-09-24, 이전엔 하루 전체라
 * 스크롤이 너무 길다는 피드백; 이후 계획보다 일찍 실제로 시작한 경우도 반영하도록 보강).
 * 계획도 실제 시작도 없는 Task는 이 범위 계산에 포함되지 않는다.
 * 어느 Task에도 시각이 하나도 없으면 현재 시각이 속한 시(hour)를 기준으로 삼는다.
 */
export function computeTimelineRange(tasks: WorkSessionTask[]): TimelineRange {
  const starts = tasks
    .map((t) => effectiveStartAt(t))
    .filter((v): v is string => Boolean(v));
  const earliestIso = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const dayStr = earliestIso ? toLocalDateString(new Date(earliestIso)) : toLocalDateString();
  const anchorMinute = earliestIso
    ? minutesFromDayStart(earliestIso, dayStr)
    : minutesFromDayStart(new Date().toISOString(), dayStr);
  const startMinute = Math.floor(anchorMinute / 60) * 60;

  return {
    dayStr,
    startMinute,
    endMinute: startMinute + TIMELINE_WINDOW_HOURS * 60,
  };
}

/**
 * Timeline 위 task block의 top/height(px) — range와 px-per-minute만 있으면 항상 다시 계산 가능.
 *
 * 시작 시각(계획 또는 실제 중 하나)만 있으면 블록을 그린다 — 계획 종료 시각을 안 채워도(현장에서
 * 그냥 타임스탬프 버튼만 누르는 경우가 많음) 타임라인에서 사라지지 않아야 한다(2026-09-24: "TASK TYPE
 * 색이 타임라인에 전혀 안 보인다" 피드백 — 원인은 planned_end_at이 없는 TASK가 통째로 안 그려지던
 * 버그였다. 이전엔 계획 시작/종료가 둘 다 있어야만 블록을 그렸다).
 * 종료 시각은 우선순위대로: 실제 완료(completed_at) → 계획 종료(planned_end_at) → 진행 중이면
 * "지금" → 그마저 없으면 화면 표시용으로만 30분 폭을 임시로 준다(저장하지 않음, 순수 표시용).
 */
export function taskBlockPosition(
  task: Pick<
    WorkSessionTask,
    "planned_start_at" | "planned_end_at" | "actual_started_at" | "completed_at" | "status"
  >,
  range: TimelineRange,
  pxPerMinute: number,
): { top: number; height: number } | null {
  const effectiveStart = effectiveStartAt(task);
  if (!effectiveStart) return null;
  const effectiveEnd =
    effectiveEndAt(task) ??
    (task.status === "IN_PROGRESS" ? new Date().toISOString() : null) ??
    new Date(new Date(effectiveStart).getTime() + 30 * 60000).toISOString();
  const startMin = minutesFromDayStart(effectiveStart, range.dayStr);
  const endMin = minutesFromDayStart(effectiveEnd, range.dayStr);
  const top = (startMin - range.startMinute) * pxPerMinute;
  const height = Math.max((endMin - startMin) * pxPerMinute, 4);
  return { top, height };
}

/** "지금"의 timeline 위 px 위치(세로축 top) — 오늘 날짜(range.dayStr)일 때만 의미 있음 */
export function nowLineOffset(range: TimelineRange, pxPerMinute: number): number | null {
  const today = toLocalDateString();
  if (today !== range.dayStr) return null;
  const nowMin = minutesFromDayStart(new Date().toISOString(), range.dayStr);
  if (nowMin < range.startMinute || nowMin > range.endMinute) return null;
  return (nowMin - range.startMinute) * pxPerMinute;
}
