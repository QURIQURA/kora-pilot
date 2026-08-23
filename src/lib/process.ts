/**
 * PILOT — PROCESS TIMELINE 도메인 헬퍼
 * process_events는 사용자의 실험 공정 기록. 시간은 timestamptz(초 단위)로 저장하고
 * 표시는 datetime.ts 유틸(Australia/Sydney)만 거친다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ProcessCategory = Tables<"process_categories">;
export type ProcessEvent = Tables<"process_events">;

export type ProcessEventType = ProcessEvent["event_type"];

/** 진행 중인 span 이벤트 (ended_at이 null) */
export function isRunningSpan(event: ProcessEvent): boolean {
  return event.event_type === "span" && event.ended_at === null;
}

/**
 * 이벤트 duration(초). point 이벤트는 null.
 * 진행 중인 span은 now 기준 경과 시간을 반환한다.
 */
export function eventDurationSeconds(
  event: ProcessEvent,
  now: Date = new Date()
): number | null {
  if (event.event_type !== "span") return null;
  const start = new Date(event.started_at).getTime();
  const end = event.ended_at
    ? new Date(event.ended_at).getTime()
    : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}
