/**
 * 대시보드에서 선택한 작업 블록(= TASK)의 상세 — Start/End 시간, 타이머(여러 개 + 타이머별 메모),
 * 관찰값, 메모, 체크리스트. 값은 work_session_tasks 행에 저장한다(EFFICIENCY 화면이 이 테이블을 읽음).
 * 블록이 처음 선택될 때 행이 없으면 만들어 work_blocks.work_session_task_id로 잇는다.
 * 효율(작업시간·생산량)은 여기서 입력하지 않고 EFFICIENCY 화면에서 상세로 본다(2026-11-06).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  taskTypeDefinitionsQuery,
  workSessionTasksQuery,
  type DashboardComponentRow,
  type WorkBlock,
} from "@/lib/queries";
import { formatDuration, formatTime, localDateTimeToISO } from "@/lib/datetime";
import {
  hasObservationFields,
  minutesBetween,
  type ChecklistItem,
  type WorkSessionTask,
} from "@/lib/workflow";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
import { newTimer, readTimers, timerElapsedSec, type TaskTimer } from "@/lib/task-timers";
import { buttonClass, primaryButtonClass } from "@/components/pilot/ui";

const smallInput = "h-7 border border-border bg-background px-1.5 text-xs tabular-nums";

function timeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const numOrNull = (v: string) => (v.trim() ? Number(v) : null);

/** 타이머 목록 저장 — 레거시 timer_minutes는 첫 타이머로 옮겨졌으므로 비운다. */
async function saveTimers(task: Pick<WorkSessionTask, "id">, timers: TaskTimer[]) {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("work_session_tasks")
    .update({
      timers: timers.map((t) => ({
        ...t,
        id: t.id === "default" ? crypto.randomUUID() : t.id,
      })) as never,
      timer_minutes: null,
    })
    .eq("id", task.id)
    .eq("user_id", userId);
  return error;
}

export function BlockTaskDetails({
  block,
  row,
  title,
  onStarted,
  onRetime,
  embedded = false,
}: {
  block: WorkBlock;
  row: DashboardComponentRow;
  title: string;
  embedded?: boolean;
  /** TASK 시작시각이 기록되면 세션이 PLANNED일 때 IN_PROGRESS로 올리도록 알린다 */
  onStarted?: (sessionId: string, iso: string) => void | Promise<void>;
  /** 실제 시작시각이 정해지면 타임라인 블록을 그 시각에 맞춘다 */
  onRetime?: ((block: WorkBlock, iso: string) => void | Promise<void>) | undefined;
}) {
  const queryClient = useQueryClient();
  const sessionId = row.work_session_id;
  const tasks = useQuery(workSessionTasksQuery(sessionId));
  const typeDefs = useQuery(taskTypeDefinitionsQuery());
  const [error, setError] = useState<string | null>(null);
  const creating = useRef<string | null>(null);

  const task: WorkSessionTask | undefined = (tasks.data ?? []).find(
    (t) => t.id === block.work_session_task_id,
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_session_tasks", sessionId] });
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
  };

  // 블록에 TASK 행이 없으면(처음 선택) 만들어 연결한다 — 컴포넌트의 기본 템플릿이 있으면 그 값으로.
  useEffect(() => {
    if (block.work_session_task_id || tasks.isLoading || creating.current === block.id) return;
    creating.current = block.id;
    void (async () => {
      try {
        const user_id = await currentUserId();
        const { data: sel, error: selError } = await supabase
          .from("work_session_formula_versions")
          .select("formula_version_id")
          .eq("id", block.work_session_formula_version_id)
          .single();
        if (selError) throw selError;
        const maxSort = (tasks.data ?? []).reduce((m, t) => Math.max(m, t.sort_order), -1);
        const { data: created, error: insError } = await supabase
          .from("work_session_tasks")
          .insert({
            user_id,
            work_session_id: sessionId,
            formula_version_id: sel.formula_version_id,
            task_name: title,
            // 구움 시트 컴포넌트는 관찰값(높이·온도)·플래너 굽기 줄이 동작하도록 Bake로 둔다(화면엔 안 보임).
            task_type: row.slot === "SHEET" ? "Bake" : null,
            timers: [newTimer()] as never,
            sort_order: maxSort + 1,
          })
          .select("id")
          .single();
        if (insError) throw insError;
        const { error: linkError } = await supabase
          .from("work_blocks")
          .update({ work_session_task_id: created.id })
          .eq("id", block.id);
        if (linkError) throw linkError;
        await refresh();
      } catch (e) {
        setError((e as Error).message);
        creating.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, block.work_session_task_id, tasks.isLoading]);

  if (!task) {
    return (
      <p className="border border-border p-3 font-mono text-xs text-muted-foreground">
        {error ? `TASK 준비 실패 — ${error}` : "TASK 준비 중…"}
      </p>
    );
  }

  const update = async (patch: Record<string, unknown>, label: string) => {
    const userId = await currentUserId();
    const { error: e } = await supabase
      .from("work_session_tasks")
      .update(patch as never)
      .eq("id", task.id)
      .eq("user_id", userId);
    if (e) setError(`${label} 저장 실패 — ${e.message}`);
    else setError(null);
    await refresh();
    // 관찰값은 플래너 TASK의 상세항목("관찰 — …")에도 반영한다.
    if (!e && Object.keys(patch).some((k) => k.startsWith("observation_"))) {
      const syncError = await syncWorkSessionToPlanner(sessionId);
      if (syncError) setError(`플래너 반영 실패 — ${syncError}`);
    }
  };

  const observationOverrides: Record<string, boolean> = {};
  for (const d of typeDefs.data ?? []) observationOverrides[d.key] = d.has_observation_fields;

  const setTime = async (field: "actual_started_at" | "completed_at", value: string) => {
    const iso = value ? localDateTimeToISO(block.block_date, value) : null;
    await update({ [field]: iso }, "시간");
    if (field === "actual_started_at" && iso) {
      await onStarted?.(sessionId, iso);
      await onRetime?.(block, iso);
    }
  };

  const timers = readTimers(task);
  const saveTimerList = async (next: TaskTimer[]) => {
    const e = await saveTimers(task, next);
    setError(e ? `타이머 저장 실패 — ${e.message}` : null);
    await refresh();
  };
  const patchTimer = (id: string, patch: Partial<TaskTimer>) =>
    saveTimerList(timers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const doneMinutes =
    task.actual_started_at && task.completed_at
      ? minutesBetween(task.actual_started_at, task.completed_at)
      : null;
  const checklist = (task.checklist_items as unknown as ChecklistItem[] | null) ?? [];
  const k = task.updated_at; // 저장 뒤 입력칸 defaultValue를 새로 반영

  return (
    <div
      className={embedded ? "space-y-3 pb-3 pl-4" : "space-y-3 border border-border bg-card p-3"}
    >
      {!embedded && <p className="label-caps text-xs">TASK DETAILS · {title}</p>}
      {error && (
        <p className="border border-destructive px-2 py-1 text-xs text-destructive">{error}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* 시간 */}
        <label className="space-y-1">
          <span className="label-caps block text-[11px] text-muted-foreground">Start → End</span>
          <span className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="타이머 추가"
              className={`${buttonClass} !min-h-[28px] !w-7 px-0 text-sm leading-none`}
              onClick={(e) => {
                e.preventDefault();
                void saveTimerList([...timers, newTimer()]);
              }}
            >
              +
            </button>
            <input
              key={`s-${k}`}
              type="time"
              className={`${smallInput} w-24`}
              defaultValue={timeValue(task.actual_started_at)}
              onBlur={(e) => {
                if (e.target.value !== timeValue(task.actual_started_at))
                  void setTime("actual_started_at", e.target.value);
              }}
            />
            <span className="text-muted-foreground">→</span>
            <input
              key={`e-${k}`}
              type="time"
              className={`${smallInput} w-24`}
              defaultValue={timeValue(task.completed_at)}
              onBlur={(e) => {
                if (e.target.value !== timeValue(task.completed_at))
                  void setTime("completed_at", e.target.value);
              }}
            />
            {doneMinutes !== null && (
              <span className="text-xs text-muted-foreground">· {Math.round(doneMinutes)} MIN</span>
            )}
          </span>
        </label>

        {/* 관찰값 */}
        {hasObservationFields(task.task_type, observationOverrides) && (
          <div className="space-y-1 md:col-span-2">
            <span className="label-caps block text-[11px] text-muted-foreground">관찰</span>
            <span className="flex flex-wrap items-center gap-1">
              <input
                key={`os-${k}`}
                className={`${smallInput} w-20`}
                placeholder="상태"
                defaultValue={task.observation_status ?? ""}
                onBlur={(e) =>
                  void update({ observation_status: e.target.value.trim() || null }, "관찰")
                }
              />
              {(
                [
                  ["observation_height_start_mm", "시작mm"],
                  ["observation_height_mid_mm", "중간mm"],
                  ["observation_height_end_mm", "끝mm"],
                  ["observation_temperature_c", "°C"],
                ] as const
              ).map(([field, ph]) => (
                <input
                  key={`${field}-${k}`}
                  type="number"
                  className={`${smallInput} w-16`}
                  placeholder={ph}
                  defaultValue={task[field] ?? ""}
                  onBlur={(e) => {
                    const v = numOrNull(e.target.value);
                    if (v !== task[field]) void update({ [field]: v }, "관찰");
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* 타이머 기록 — 시작/종료는 왼쪽 타임라인에서, 여기는 표기·메모용 */}
      <div className="space-y-1.5">
        {timers.map((t, idx) => {
          const spent =
            t.started_at && t.done_at
              ? Math.max(1, Math.round(minutesBetween(t.started_at, t.done_at)))
              : null;
          return (
            <div
              key={`${t.id}-${k}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            >
              <span className="w-4 font-mono text-[11px] text-muted-foreground">{idx + 1}</span>
              <span className="w-28 font-mono tabular-nums">
                {t.started_at ? formatTime(t.started_at) : "--:--"}
                {" – "}
                {t.done_at ? formatTime(t.done_at) : t.started_at ? "진행 중" : "--:--"}
              </span>
              <span className="w-12 font-mono tabular-nums">
                {spent != null ? `${spent}분` : "—"}
              </span>
              <input
                className={`${smallInput} min-w-0 flex-1 basis-32`}
                placeholder="메모 (무슨 타이머?)"
                defaultValue={t.label}
                onBlur={(e) => {
                  if (e.target.value.trim() !== t.label)
                    void patchTimer(t.id, { label: e.target.value.trim() });
                }}
              />
              <input
                type="number"
                className={`${smallInput} w-14`}
                placeholder="목표분"
                title="타임라인 카운트다운 길이(분)"
                disabled={Boolean(t.started_at && !t.done_at)}
                defaultValue={t.minutes ?? ""}
                onBlur={(e) => {
                  const v = numOrNull(e.target.value);
                  if (v !== t.minutes) void patchTimer(t.id, { minutes: v });
                }}
              />
              {timers.length > 1 && (
                <button
                  type="button"
                  className="px-1 text-xs text-muted-foreground hover:text-destructive"
                  title="타이머 삭제"
                  onClick={() => void saveTimerList(timers.filter((x) => x.id !== t.id))}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 체크리스트 */}
      <label className="block space-y-1">
        <span className="label-caps text-[11px] text-muted-foreground">
          이 생산 단계 메모 · {title}
        </span>
        <textarea
          key={`note-${k}`}
          className="min-h-16 w-full border border-border bg-background p-2 text-xs"
          defaultValue={task.note ?? ""}
          onBlur={(e) => {
            if ((e.target.value.trim() || null) !== task.note)
              void update({ note: e.target.value.trim() || null }, "메모");
          }}
        />
      </label>
      {checklist.length > 0 && (
        <div className="flex flex-col gap-1">
          {checklist.map((item, idx) => (
            <label key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={item.done}
                onChange={() =>
                  void update(
                    {
                      checklist_items: checklist.map((c, i) =>
                        i === idx ? { ...c, done: !c.done } : c,
                      ),
                    },
                    "체크리스트",
                  )
                }
              />
              <span className={item.done ? "line-through" : ""}>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 타이머가 도는 동안 task 행을 1초마다 다시 그리기 위한 공용 훅.
 */
function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * 타임라인 블록 안에 들어가는 아주 작은 타이머 + 메모 표기.
 * 타이머마다 ▶ 시작 / 남은(또는 경과) 시간 + ■ 종료 / ✓ 소요를 보여주고(이름이 있으면 함께),
 * 아무 타이머도 안 돌고 TASK가 진행 중이면 TASK 완료 버튼을 보인다. 자세한 입력은 오른쪽 디테일 창.
 */
export function BlockTimerChip({
  block,
  row,
  onStarted,
  onRetime,
  part,
}: {
  block: WorkBlock;
  row: DashboardComponentRow;
  onStarted?: (sessionId: string, iso: string) => void | Promise<void>;
  onRetime?: ((block: WorkBlock, iso: string) => void | Promise<void>) | undefined;
  /** timer: 블록 첫 줄의 타이머 / note: 블록 아래쪽의 메모 한 줄 */
  part: "timer" | "note";
}) {
  const queryClient = useQueryClient();
  const sessionId = row.work_session_id;
  const tasks = useQuery(workSessionTasksQuery(sessionId));
  const task = (tasks.data ?? []).find((t) => t.id === block.work_session_task_id);
  const timers = task ? readTimers(task) : [];
  const running = task?.status === "IN_PROGRESS";
  const now = useTick(timers.some((t) => t.started_at && !t.done_at));
  if (!task) return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_session_tasks", sessionId] });
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
  };
  const patchTimer = async (id: string, patch: Partial<TaskTimer>) => {
    await saveTimers(
      task,
      timers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
    await refresh();
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const chipButton =
    "shrink-0 border border-current px-1 font-mono text-[11px] leading-4 hover:opacity-70";

  if (part === "note") {
    const labels = timers.filter((t) => t.label);
    const text = [
      task.note,
      ...labels.map((t) => `${t.label}${t.minutes ? ` ${t.minutes}분` : ""}`),
    ]
      .filter(Boolean)
      .join(" · ");
    return text ? (
      <p className="truncate text-[11px] opacity-80" title={text}>
        ✎ {text}
      </p>
    ) : null;
  }

  return (
    <>
      {timers.map((t, idx) => {
        const tag = timers.length > 1 ? `${idx + 1}` : "";
        if (t.started_at && !t.done_at) {
          const remain = t.minutes != null ? t.minutes * 60 - timerElapsedSec(t, now) : null;
          const over = remain !== null && remain <= 0;
          return (
            <span key={t.id} className="flex shrink-0 items-center gap-1" title={t.label}>
              {tag && <span className="font-mono text-[10px] opacity-70">{tag}</span>}
              <span
                className={`font-mono text-[11px] font-medium tabular-nums ${over ? "underline" : ""}`}
              >
                {remain !== null
                  ? over
                    ? `+${formatDuration(Math.abs(remain))}`
                    : formatDuration(remain)
                  : formatDuration(timerElapsedSec(t, now))}
              </span>
              <button
                type="button"
                draggable={false}
                className={chipButton}
                title="타이머 종료"
                onMouseDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  void patchTimer(t.id, { done_at: new Date().toISOString() });
                }}
              >
                ■
              </button>
            </span>
          );
        }
        if (t.started_at && t.done_at) {
          return (
            <span key={t.id} className="shrink-0 font-mono text-[11px]" title={t.label}>
              {tag && <span className="opacity-70">{tag} </span>}✓{" "}
              {Math.max(1, Math.round(minutesBetween(t.started_at, t.done_at)))}분
            </span>
          );
        }
        return (
          <button
            key={t.id}
            type="button"
            draggable={false}
            className={chipButton}
            title={t.label ? `${t.label} 타이머 시작` : "타이머 시작"}
            onMouseDown={stop}
            onClick={async (e) => {
              e.stopPropagation();
              const iso = new Date().toISOString();
              await patchTimer(t.id, { started_at: iso, done_at: null });
              if (task.status === "NOT_STARTED") {
                const userId = await currentUserId();
                await supabase
                  .from("work_session_tasks")
                  .update({ status: "IN_PROGRESS", actual_started_at: iso, completed_at: null })
                  .eq("id", task.id)
                  .eq("user_id", userId);
                await refresh();
                await onStarted?.(sessionId, iso);
                await onRetime?.(block, iso);
              }
            }}
          >
            {tag}▶{t.minutes != null ? ` ${t.minutes}분` : ""}
          </button>
        );
      })}
      {running && !timers.some((t) => t.started_at && !t.done_at) && (
        <button
          type="button"
          draggable={false}
          className={chipButton}
          title="작업 완료"
          onMouseDown={stop}
          onClick={async (e) => {
            e.stopPropagation();
            const userId = await currentUserId();
            await supabase
              .from("work_session_tasks")
              .update({ status: "DONE", completed_at: new Date().toISOString() })
              .eq("id", task.id)
              .eq("user_id", userId);
            await refresh();
          }}
        >
          ✔
        </button>
      )}
      {task.status === "DONE" && task.actual_started_at && task.completed_at && (
        <span className="shrink-0 font-mono text-[11px]">
          ✓ {Math.max(1, Math.round(minutesBetween(task.actual_started_at, task.completed_at)))}분
        </span>
      )}
    </>
  );
}
