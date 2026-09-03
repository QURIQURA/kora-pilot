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

/** TASK TYPE별 배지 색상 — task 이름과 구분되도록, 같은 type이면 항상 같은 색 */
const TASK_TYPE_COLOR_CLASSES = [
  "bg-amber-100 text-amber-900 border-amber-300",
  "bg-blue-100 text-blue-900 border-blue-300",
  "bg-emerald-100 text-emerald-900 border-emerald-300",
  "bg-rose-100 text-rose-900 border-rose-300",
  "bg-violet-100 text-violet-900 border-violet-300",
  "bg-cyan-100 text-cyan-900 border-cyan-300",
  "bg-orange-100 text-orange-900 border-orange-300",
  "bg-lime-100 text-lime-900 border-lime-300",
];

export function taskTypeColorClass(taskType: string | null | undefined): string {
  if (!taskType) return "bg-muted text-muted-foreground border-border";
  let hash = 0;
  for (let i = 0; i < taskType.length; i++) hash = (hash * 31 + taskType.charCodeAt(i)) >>> 0;
  return TASK_TYPE_COLOR_CLASSES[hash % TASK_TYPE_COLOR_CLASSES.length]!;
}

/* ── Timeline 좌표 계산 (compute, don't store) ───────────────────── */
/* 세로형 24시간 축: 행(row)=시간, 열(column)=품목(Formula/GENERAL) */

export const DEFAULT_TIMELINE_START_HOUR = 0;
export const DEFAULT_TIMELINE_END_HOUR = 24;

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

/** Timeline은 항상 00:00~24:00 하루 전체를 보여준다(스펙: "시간은 24시간"). */
export function computeTimelineRange(tasks: WorkSessionTask[]): TimelineRange {
  const starts = tasks.map((t) => t.planned_start_at).filter((v): v is string => Boolean(v));
  const dayStr =
    starts.length > 0
      ? toLocalDateString(new Date(starts.reduce((a, b) => (a < b ? a : b))))
      : toLocalDateString();

  return {
    dayStr,
    startMinute: DEFAULT_TIMELINE_START_HOUR * 60,
    endMinute: DEFAULT_TIMELINE_END_HOUR * 60,
  };
}

/** Timeline 위 task block의 top/height(px) — range와 px-per-minute만 있으면 항상 다시 계산 가능 */
export function taskBlockPosition(
  task: Pick<WorkSessionTask, "planned_start_at" | "planned_end_at">,
  range: TimelineRange,
  pxPerMinute: number,
): { top: number; height: number } | null {
  if (!task.planned_start_at || !task.planned_end_at) return null;
  const startMin = minutesFromDayStart(task.planned_start_at, range.dayStr);
  const endMin = minutesFromDayStart(task.planned_end_at, range.dayStr);
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
