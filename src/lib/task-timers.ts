/**
 * TASK(work_session_tasks) 하나에 붙는 타이머 목록(2026-11-06).
 * 타이머마다 이름(메모)·분·시작/종료 시각을 따로 가진다. 기본으로 타이머 한 개가 배당된다.
 * 예전 단일 값(timer_minutes)이 있던 TASK는 첫 타이머의 분으로 이어받는다.
 */
import type { WorkSessionTask } from "@/lib/workflow";

export interface TaskTimer {
  id: string;
  label: string;
  minutes: number | null;
  started_at: string | null;
  done_at: string | null;
}

export const newTimer = (minutes: number | null = null): TaskTimer => ({
  id: crypto.randomUUID(),
  label: "",
  minutes,
  started_at: null,
  done_at: null,
});

export function readTimers(task: Pick<WorkSessionTask, "timers" | "timer_minutes">): TaskTimer[] {
  const raw = Array.isArray(task.timers) ? (task.timers as unknown[]) : [];
  const list = raw
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .map((t) => ({
      id: typeof t["id"] === "string" ? t["id"] : crypto.randomUUID(),
      label: typeof t["label"] === "string" ? t["label"] : "",
      minutes: typeof t["minutes"] === "number" ? t["minutes"] : null,
      started_at: typeof t["started_at"] === "string" ? t["started_at"] : null,
      done_at: typeof t["done_at"] === "string" ? t["done_at"] : null,
    }));
  // 저장된 타이머가 없으면 기본 타이머 하나(레거시 timer_minutes 이어받기) — 화면용 가짜 id는 저장 시 확정된다.
  return list.length > 0 ? list : [{ ...newTimer(task.timer_minutes), id: "default" }];
}

/** 타이머 남은 초 — 진행 중이 아니면 null. minutes가 없으면 경과 초를 음수 없이 돌려주려고 따로 elapsed를 쓴다. */
export const timerElapsedSec = (t: TaskTimer, now: Date): number =>
  t["started_at"] ? Math.max(0, (now.getTime() - new Date(t["started_at"]).getTime()) / 1000) : 0;
