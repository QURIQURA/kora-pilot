/**
 * PILOT — PROCESS TIMELINE 도메인 헬퍼
 * process_events는 사용자의 실험 공정 기록. 시간은 timestamptz(초 단위)로 저장하고
 * 표시는 datetime.ts 유틸(Australia/Sydney)만 거친다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ProcessCategory = Tables<"process_categories">;
export type ProcessEvent = Tables<"process_events">;

export type ProcessEventType = ProcessEvent["event_type"];

/** "manual": QUICK LOG 수동 입력. "voice": 음성 로그(STEP10). */
export type ProcessEventSource = "manual" | "voice";

/**
 * 음성 로그 AI 파싱이 우선 시도하는 표준 액션 어휘.
 * 목록에 없는 발화는 action="NOTE" 또는 "OBSERVATION"으로 안전하게 분류된다 —
 * 즉 이 목록은 강제 enum이 아니라 파싱 힌트이며, action 컬럼은 여전히 자유 텍스트다.
 */
export const VOICE_ACTION_VOCABULARY = [
  "MIX_START",
  "MIX_COMPLETE",
  "REST_START",
  "REST_END",
  "OVEN_IN",
  "OVEN_CHECK",
  "OVEN_OUT",
  "COOLING_START",
  "COOLING_COMPLETE",
  "ASSEMBLY_START",
  "ASSEMBLY_COMPLETE",
  "OBSERVATION",
  "NOTE",
  "ADJUSTMENT",
  "DECISION",
] as const;

/** 확신도가 이 값 미만이면 UI에서 저확신으로 표시하고 확인을 유도한다 */
export const VOICE_LOW_CONFIDENCE_THRESHOLD = 0.6;

/** 진행 중인 span 이벤트 (ended_at이 null) */
export function isRunningSpan(event: ProcessEvent): boolean {
  return event.event_type === "span" && event.ended_at === null;
}

/**
 * 이벤트 duration(초). point 이벤트는 null.
 * 진행 중인 span은 now 기준 경과 시간을 반환한다.
 */
export function eventDurationSeconds(event: ProcessEvent, now: Date = new Date()): number | null {
  if (event.event_type !== "span") return null;
  const start = new Date(event.started_at).getTime();
  const end = event.ended_at ? new Date(event.ended_at).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}
