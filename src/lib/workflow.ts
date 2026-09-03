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

/* ── Timeline 좌표 계산 (compute, don't store) ───────────────────── */

export const DEFAULT_TIMELINE_START_HOUR = 6;
export const DEFAULT_TIMELINE_END_HOUR = 18;

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
  /** 자정 기준 시작 분 (기본 06:00 = 360, Task가 더 이르면 30분 단위로 확장) */
  startMinute: number;
  /** 자정 기준 끝 분 (기본 18:00 = 1080, Task가 더 늦으면 30분 단위로 확장) */
  endMinute: number;
}

/**
 * 기본 06:00~18:00 범위를 쓰되, 계획된 Task가 그 범위를 벗어나면 30분 단위로 확장한다.
 * 자동으로 첫/마지막 Task에 맞춰 축소하지는 않는다(스펙 8번).
 */
export function computeTimelineRange(tasks: WorkSessionTask[]): TimelineRange {
  const starts = tasks.map((t) => t.planned_start_at).filter((v): v is string => Boolean(v));
  const dayStr =
    starts.length > 0
      ? toLocalDateString(new Date(starts.reduce((a, b) => (a < b ? a : b))))
      : toLocalDateString();

  let startMinute = DEFAULT_TIMELINE_START_HOUR * 60;
  let endMinute = DEFAULT_TIMELINE_END_HOUR * 60;

  for (const t of tasks) {
    if (t.planned_start_at) {
      const m = minutesFromDayStart(t.planned_start_at, dayStr);
      startMinute = Math.min(startMinute, Math.floor(m / 30) * 30);
    }
    if (t.planned_end_at) {
      const m = minutesFromDayStart(t.planned_end_at, dayStr);
      endMinute = Math.max(endMinute, Math.ceil(m / 30) * 30);
    }
  }

  return { dayStr, startMinute, endMinute };
}

/** Timeline 위 task bar의 left/width(px) — range와 px-per-minute만 있으면 항상 다시 계산 가능 */
export function taskBarPosition(
  task: Pick<WorkSessionTask, "planned_start_at" | "planned_end_at">,
  range: TimelineRange,
  pxPerMinute: number,
): { left: number; width: number } | null {
  if (!task.planned_start_at || !task.planned_end_at) return null;
  const startMin = minutesFromDayStart(task.planned_start_at, range.dayStr);
  const endMin = minutesFromDayStart(task.planned_end_at, range.dayStr);
  const left = (startMin - range.startMinute) * pxPerMinute;
  const width = Math.max((endMin - startMin) * pxPerMinute, 4);
  return { left, width };
}

/** "지금"의 timeline 위 px 위치 — 오늘 날짜(range.dayStr)일 때만 의미 있음 */
export function nowLinePosition(range: TimelineRange, pxPerMinute: number): number | null {
  const today = toLocalDateString();
  if (today !== range.dayStr) return null;
  const nowMin = minutesFromDayStart(new Date().toISOString(), range.dayStr);
  if (nowMin < range.startMinute || nowMin > range.endMinute) return null;
  return (nowMin - range.startMinute) * pxPerMinute;
}
