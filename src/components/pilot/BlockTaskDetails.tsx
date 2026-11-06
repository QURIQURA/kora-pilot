/**
 * 대시보드에서 선택한 작업 블록(= TASK)의 상세 — Start/End 시간, 타이머(여러 개 + 타이머별 메모),
 * 관찰값, 메모, 체크리스트. 값은 work_session_tasks 행에 저장한다(EFFICIENCY 화면이 이 테이블을 읽음).
 * 블록이 처음 선택될 때 행이 없으면 만들어 work_blocks.work_session_task_id로 잇는다.
 * 효율(작업시간·생산량)은 여기서 입력하지 않고 EFFICIENCY 화면에서 상세로 본다(2026-11-06).
 */
import { Fragment, useEffect, useRef, useState } from "react";
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
import { hasObservationFields, type ChecklistItem, type WorkSessionTask } from "@/lib/workflow";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
import { newTimer, readTimers, timerElapsedSec, type TaskTimer } from "@/lib/task-timers";
import { buttonClass, primaryButtonClass } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

const smallInput = "h-7 border border-border bg-background px-1.5 text-xs tabular-nums";

/** 분 단위로 맞춘(초 버림) 시간차 — 시작에 초가 남아 있어도 60분이 59분으로 보이지 않는다. */
function wholeMinutes(startIso: string, endIso: string): number {
  return (
    Math.floor(new Date(endIso).getTime() / 60_000) -
    Math.floor(new Date(startIso).getTime() / 60_000)
  );
}

/** 24시간제 시각 입력 — "17:30", "1730", "930" 모두 허용. 잘못된 값은 되돌리고 비우면 ""로 확정한다. */
function TimeText({
  value,
  onCommit,
  className,
  title,
  placeholder,
}: {
  value: string;
  onCommit: (hm: string) => void;
  className?: string | undefined;
  title?: string | undefined;
  placeholder?: string | undefined;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className={`${className ?? ""} text-center tabular-nums`}
      inputMode="numeric"
      maxLength={5}
      title={title}
      placeholder={placeholder ?? "--:--"}
      value={text ?? value}
      onFocus={(e) => {
        setText(value);
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const raw = (text ?? value).trim();
        setText(null);
        if (raw === value) return;
        if (raw === "") {
          onCommit("");
          return;
        }
        const m = /^(\d{1,2}):?(\d{2})?$/.exec(raw);
        const h = m ? Number(m[1]) : NaN;
        const mi = m ? Number(m[2] ?? 0) : NaN;
        if (!m || h > 23 || mi > 59) return;
        const hm = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
        if (hm !== value) onCommit(hm);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function timeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const nowHm = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  onRetime?:
    | ((block: WorkBlock, startIso: string | null, endIso?: string) => void | Promise<void>)
    | undefined;
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

  const timers = readTimers(task);
  const saveTimerList = async (next: TaskTimer[]) => {
    const e = await saveTimers(task, next);
    setError(e ? `타이머 저장 실패 — ${e.message}` : null);
    await refresh();
  };
  // 타이머 하나의 시작/종료/분을 고친다 — 분은 시작(초 버림)에 더해 종료로 환산하고, TASK의 Start/End도 타이머들에 맞춘다.
  const editTimer = async (
    t: TaskTimer,
    edit: { start?: string; end?: string; minutes?: number },
  ) => {
    const toIso = (hm: string) => (hm ? localDateTimeToISO(block.block_date, hm) : null);
    let started = t.started_at;
    let done = t.done_at;
    if (edit.start !== undefined) started = toIso(edit.start);
    if (edit.end !== undefined) done = toIso(edit.end);
    if (edit.minutes !== undefined) {
      started = started ?? localDateTimeToISO(block.block_date, block.start_time.slice(0, 5));
      done = new Date(
        (Math.floor(new Date(started).getTime() / 60_000) + edit.minutes) * 60_000,
      ).toISOString();
    }
    if (started && done && new Date(done) < new Date(started)) {
      setError("종료 시각이 시작보다 빨라요.");
      return;
    }
    const next = timers.map((x) =>
      x.id === t.id ? { ...x, started_at: started, done_at: done } : x,
    );
    const e = await saveTimers(task, next);
    if (e) {
      setError(`타이머 저장 실패 — ${e.message}`);
      return;
    }
    setError(null);
    const starts = next.map((x) => x.started_at).filter((x): x is string => Boolean(x));
    const anyRunning = next.some((x) => x.started_at && !x.done_at);
    const dones = next.map((x) => x.done_at).filter((x): x is string => Boolean(x));
    const taskPatch: { actual_started_at?: string | null; completed_at?: string | null } = {};
    if (starts.length) taskPatch.actual_started_at = [...starts].sort()[0] ?? null;
    if (!anyRunning && dones.length)
      taskPatch.completed_at = [...dones].sort().slice(-1)[0] ?? null;
    if (Object.keys(taskPatch).length) await update(taskPatch, "시간");
    else await refresh();
    if (taskPatch.actual_started_at) {
      await onStarted?.(sessionId, taskPatch.actual_started_at);
      // 블록의 시작·종료도 타이머 시작·종료에 맞춘다(진행 중 타이머가 있으면 종료는 건드리지 않음).
      await onRetime?.(block, taskPatch.actual_started_at, taskPatch.completed_at ?? undefined);
    }
  };
  const patchTimer = (id: string, patch: Partial<TaskTimer>) =>
    saveTimerList(timers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const doneMinutes =
    task.actual_started_at && task.completed_at
      ? Math.floor(new Date(task.completed_at).getTime() / 60_000) -
        Math.floor(new Date(task.actual_started_at).getTime() / 60_000)
      : null;
  const workMinutes = timers.reduce(
    (sum, t) =>
      t.started_at && t.done_at ? sum + Math.max(0, wholeMinutes(t.started_at, t.done_at)) : sum,
    0,
  );
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

      {/* 시간 기록 — 타이머마다 한 줄. 작업 전체 Start/End는 타이머에서 자동 계산(요약) */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="label-caps text-[11px] text-muted-foreground">시간 기록</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {task.actual_started_at ? timeValue(task.actual_started_at) : "--:--"} →{" "}
            {task.completed_at ? timeValue(task.completed_at) : "진행 중"}
            {doneMinutes !== null && doneMinutes > 0 && <> · 총 {doneMinutes}분</>}
            {workMinutes > 0 && workMinutes !== doneMinutes && <> · 실작업 {workMinutes}분</>}
          </span>
        </div>
        <div className="grid grid-cols-[1rem_minmax(5rem,1fr)_4rem_4rem_3rem_4.5rem] items-center gap-x-1.5 gap-y-1">
          <span />
          <span className="text-[10px] text-muted-foreground">이름</span>
          <span className="text-[10px] text-muted-foreground">시작</span>
          <span className="text-[10px] text-muted-foreground">종료</span>
          <span className="text-[10px] text-muted-foreground">분</span>
          <span />
          {timers.map((t, idx) => {
            const spent =
              t.started_at && t.done_at ? Math.max(1, wholeMinutes(t.started_at, t.done_at)) : null;
            const running = Boolean(t.started_at && !t.done_at);
            return (
              <Fragment key={`${t.id}-${k}`}>
                <span
                  className={cn(
                    "font-mono text-[11px] text-muted-foreground",
                    running && "font-semibold text-[#6B5BB5]",
                  )}
                >
                  {idx + 1}
                </span>
                <input
                  className={`${smallInput} min-w-0`}
                  placeholder="이름"
                  defaultValue={t.label}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== t.label)
                      void patchTimer(t.id, { label: e.target.value.trim() });
                  }}
                />
                <TimeText
                  className={smallInput}
                  title="시작 시각 (24시간, 예: 17:30 또는 1730)"
                  value={timeValue(t.started_at)}
                  onCommit={(hm) => void editTimer(t, { start: hm })}
                />
                <TimeText
                  className={cn(smallInput, running && "border-[#6B5BB5]")}
                  title={running ? "진행 중 — 시각을 입력하면 종료돼요" : "종료 시각 (24시간)"}
                  placeholder={running ? "진행중" : ""}
                  value={timeValue(t.done_at)}
                  onCommit={(hm) => void editTimer(t, { end: hm })}
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={`${smallInput} text-right`}
                  title="진행 분 — 입력하면 종료가 시작 + 분으로 바뀝니다"
                  defaultValue={spent ?? ""}
                  onBlur={(e) => {
                    const m = Number(e.target.value);
                    if (!e.target.value || !Number.isFinite(m) || m <= 0 || m === spent) return;
                    void editTimer(t, { minutes: m });
                  }}
                />
                <span className="flex items-center justify-end gap-1">
                  {!t.started_at ? (
                    <button
                      type="button"
                      className={`${buttonClass} !min-h-[26px] px-1.5 text-[11px]`}
                      title="지금 시작"
                      onClick={() => void editTimer(t, { start: nowHm() })}
                    >
                      ▶
                    </button>
                  ) : running ? (
                    <button
                      type="button"
                      className={`${buttonClass} !min-h-[26px] px-1.5 text-[11px]`}
                      title="지금 종료"
                      onClick={() => void editTimer(t, { end: nowHm() })}
                    >
                      ■
                    </button>
                  ) : (
                    <span className="px-1.5 text-[11px] text-[#3E8E5A]">✓</span>
                  )}
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
                </span>
              </Fragment>
            );
          })}
        </div>
        <button
          type="button"
          className={`${buttonClass} !min-h-[26px] px-2 text-[11px]`}
          onClick={() => void saveTimerList([...timers, newTimer()])}
        >
          ＋ 타이머 추가
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 반죽 높이 */}
        <label className="space-y-1">
          <span className="label-caps block text-[11px] text-muted-foreground">반죽 높이</span>
          <span className="flex items-center gap-1">
            <input
              key={`bh-${k}`}
              type="number"
              step="0.5"
              className={`${smallInput} w-20`}
              defaultValue={task.batter_height_mm ?? ""}
              onBlur={(e) => {
                const v = numOrNull(e.target.value);
                if (v !== task.batter_height_mm) void update({ batter_height_mm: v }, "반죽 높이");
              }}
            />
            <span className="text-xs text-muted-foreground">mm</span>
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

      {/* 체크리스트 */}
      <label className="block space-y-1">
        <span className="label-caps text-[11px] text-muted-foreground">메모</span>
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
  onRetime?:
    | ((block: WorkBlock, startIso: string | null, endIso?: string) => void | Promise<void>)
    | undefined;
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
    // 타이머 이름은 위 타이머 칩에 "1. 이름: 시간"으로 표시되므로 여기엔 메모만 둔다.
    const text = [task.note].filter(Boolean).join(" · ");
    return text ? (
      <p className="truncate text-[11px] opacity-80" title={text}>
        ✎ {text}
      </p>
    ) : null;
  }

  return (
    <>
      {timers.map((t, idx) => {
        // 타이머마다 "1. 머랭휘핑: 13분" / "2. Oven: 진행중 0:23" 형식으로 이름과 시간을 함께 표기한다.
        const tag = timers.length > 1 ? `${idx + 1}.` : "";
        const name = t.label ? (
          <span className="max-w-[7rem] truncate opacity-80">{t.label}:</span>
        ) : null;
        if (t.started_at && !t.done_at) {
          return (
            <span key={t.id} className="flex shrink-0 items-center gap-1" title={t.label}>
              {tag && <span className="font-mono text-[10px] opacity-70">{tag}</span>}
              {name && <span className="font-mono text-[11px]">{name}</span>}
              <span className="font-mono text-[11px] font-medium tabular-nums">
                진행중 {formatDuration(timerElapsedSec(t, now))}
              </span>
              <button
                type="button"
                draggable={false}
                className={chipButton}
                title="타이머 종료"
                onMouseDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  const endIso = new Date().toISOString();
                  void (async () => {
                    await patchTimer(t.id, { done_at: endIso });
                    // 마지막으로 돌던 타이머가 끝나면 블록 종료도 그 시각으로 맞춘다.
                    const othersRunning = timers.some(
                      (x) => x.id !== t.id && x.started_at && !x.done_at,
                    );
                    if (!othersRunning) await onRetime?.(block, task.actual_started_at, endIso);
                  })();
                }}
              >
                ■
              </button>
            </span>
          );
        }
        if (t.started_at && t.done_at) {
          return (
            <span
              key={t.id}
              className="flex shrink-0 items-center gap-1 font-mono text-[11px]"
              title={t.label}
            >
              {tag && <span className="opacity-70">{tag}</span>}
              {name}
              <span>✓ {Math.max(1, wholeMinutes(t.started_at, t.done_at))}분</span>
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
              const othersRunning = timers.some((x) => x.id !== t.id && x.started_at && !x.done_at);
              await patchTimer(t.id, { started_at: iso, done_at: null });
              // 다른 타이머가 안 돌고 있으면 시작 버튼이 곧 새 시작 — 수기로 고친 Start/End를 리셋한다.
              if (!othersRunning) {
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
            {tag}
            {t.label ? `${t.label} ` : ""}▶
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
            const endIso = new Date().toISOString();
            const userId = await currentUserId();
            await supabase
              .from("work_session_tasks")
              .update({ status: "DONE", completed_at: endIso })
              .eq("id", task.id)
              .eq("user_id", userId);
            await refresh();
            await onRetime?.(block, task.actual_started_at, endIso);
          }}
        >
          ✔
        </button>
      )}
      {task.status === "DONE" &&
        task.actual_started_at &&
        task.completed_at &&
        !timers.some((t) => t.started_at && t.done_at) && (
          <span className="shrink-0 font-mono text-[11px]">
            ✓ {Math.max(1, wholeMinutes(task.actual_started_at, task.completed_at))}분
          </span>
        )}
    </>
  );
}
