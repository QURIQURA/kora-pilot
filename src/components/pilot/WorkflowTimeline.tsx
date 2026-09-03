/**
 * WORKFLOW TIMELINE — Work Session의 Task 계획/진행 뷰
 *
 * 절대 규칙 (src/lib/workflow.ts와 동일):
 * - duration은 저장하지 않는다 — planned_start_at / planned_end_at으로만 계산한다.
 * - 대기 시간(gap)은 엔티티가 아니다 — 타임라인의 빈 공간일 뿐이다.
 *
 * 레이아웃: 세로형 24시간 축 — 행(row)=시간(00:00~24:00), 열(column)=품목(Formula/GENERAL).
 * 시간 라벨 열은 스크롤 시에도 고정(sticky)된다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { localDateTimeToISO, toLocalDateString, formatTime } from "@/lib/datetime";
import {
  computeTimelineRange,
  minutesBetween,
  minutesFromDayStart,
  nextTaskStatus,
  nowLineOffset,
  taskBlockPosition,
  taskTypeColorClass,
  TASK_STATUS_ICON,
  TASK_STATUS_LABEL,
  TASK_TYPE_SUGGESTIONS,
  type TaskStatus,
  type WorkSessionTask,
} from "@/lib/workflow";
import { buttonClass, inputClass, primaryButtonClass, selectClass } from "@/components/pilot/ui";

const ROW_HEIGHT = 56; // 1시간당 px
const PX_PER_MINUTE = ROW_HEIGHT / 60;
const LABEL_WIDTH = 64;
const COL_WIDTH = 190;

interface FormulaOption {
  formulaVersionId: string;
  formulaName: string;
}

const GENERAL_KEY = "__general__";

export function WorkflowView({
  sessionId,
  tasks,
  formulaOptions,
  onTasksChanged,
}: {
  sessionId: string;
  tasks: WorkSessionTask[];
  formulaOptions: FormulaOption[];
  onTasksChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("");
  const [formulaVersionId, setFormulaVersionId] = useState("");
  const [day, setDay] = useState(() => toLocalDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);

  const range = useMemo(() => computeTimelineRange(tasks), [tasks]);
  const nowTop = nowLineOffset(range, PX_PER_MINUTE);
  const bodyHeight = (range.endMinute - range.startMinute) * PX_PER_MINUTE;

  const hourTicks = useMemo(() => {
    const ticks: { minute: number; label: string }[] = [];
    for (let m = range.startMinute; m < range.endMinute; m += 60) {
      ticks.push({ minute: m, label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00` });
    }
    return ticks;
  }, [range]);

  // 열(품목) = 선택된 Formula Version들 + Formula 없는 Task를 위한 GENERAL 열
  const columns = useMemo(() => {
    const cols = formulaOptions.map((f) => ({ key: f.formulaVersionId, label: f.formulaName }));
    cols.push({ key: GENERAL_KEY, label: "GENERAL" });
    return cols;
  }, [formulaOptions]);

  const scheduledByColumn = useMemo(() => {
    const map = new Map<string, WorkSessionTask[]>();
    for (const t of tasks) {
      if (!t.planned_start_at || !t.planned_end_at) continue;
      const key = t.formula_version_id ?? GENERAL_KEY;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.planned_start_at || !t.planned_end_at),
    [tasks],
  );

  // 마운트 시 현재 시각(또는 진행중 Task) 근처로 자동 스크롤
  useEffect(() => {
    if (autoScrolled.current || !scrollRef.current) return;
    autoScrolled.current = true;
    const inProgress = tasks.find((t) => t.status === "IN_PROGRESS" && t.planned_start_at);
    const anchorMinute = inProgress?.planned_start_at
      ? minutesFromDayStart(inProgress.planned_start_at, range.dayStr)
      : (nowTop ?? 0) / PX_PER_MINUTE + range.startMinute;
    const top = Math.max(0, (anchorMinute - range.startMinute) * PX_PER_MINUTE - ROW_HEIGHT * 2);
    scrollRef.current.scrollTop = top;
  }, [tasks, range, nowTop]);

  async function addTask() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("TASK NAME IS REQUIRED");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setError("END TIME MUST BE AFTER START TIME");
      return;
    }
    setSaving(true);
    setError(null);
    const userId = await currentUserId();
    const maxSort = tasks.reduce((acc, t) => Math.max(acc, t.sort_order), 0);
    const { error: insertError } = await supabase.from("work_session_tasks").insert({
      work_session_id: sessionId,
      user_id: userId,
      task_name: trimmed,
      task_type: taskType.trim() || null,
      formula_version_id: formulaVersionId || null,
      planned_start_at: startTime ? localDateTimeToISO(day, startTime) : null,
      planned_end_at: endTime ? localDateTimeToISO(day, endTime) : null,
      sort_order: maxSort + 1,
    });
    setSaving(false);
    if (insertError) {
      setError(`ADD FAILED — ${insertError.message}`);
      return;
    }
    setName("");
    setTaskType("");
    setStartTime("");
    setEndTime("");
    await onTasksChanged();
  }

  async function cycleStatus(task: WorkSessionTask) {
    const next = nextTaskStatus(task.status as TaskStatus);
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({
        status: next,
        completed_at: next === "DONE" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (updateError) setError(`UPDATE FAILED — ${updateError.message}`);
    await onTasksChanged();
  }

  async function removeTask(task: WorkSessionTask) {
    const { error: deleteError } = await supabase
      .from("work_session_tasks")
      .delete()
      .eq("id", task.id);
    if (deleteError) setError(`DELETE FAILED — ${deleteError.message}`);
    await onTasksChanged();
  }

  return (
    <div className="space-y-6">
      {/* ── ADD TASK ─────────────────────────────── */}
      <div className="border border-border p-3">
        <div className="mb-2 text-xs tracking-wider text-muted-foreground">+ ADD TASK</div>
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <input
            className={`${inputClass} md:w-56`}
            placeholder="TASK NAME"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={`${inputClass} md:w-40`}
            placeholder="TYPE"
            list="workflow-task-types"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
          />
          <datalist id="workflow-task-types">
            {TASK_TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {formulaOptions.length > 0 && (
            <select
              className={`${selectClass} md:w-56`}
              value={formulaVersionId}
              onChange={(e) => setFormulaVersionId(e.target.value)}
            >
              <option value="">NO FORMULA (GENERAL)</option>
              {formulaOptions.map((f) => (
                <option key={f.formulaVersionId} value={f.formulaVersionId}>
                  {f.formulaName}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            className={`${inputClass} md:w-40`}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <input
            type="time"
            className={`${inputClass} md:w-32`}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <input
            type="time"
            className={`${inputClass} md:w-32`}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
          <button
            type="button"
            className={`${primaryButtonClass} min-h-12`}
            disabled={saving}
            onClick={addTask}
          >
            {saving ? "ADDING..." : "ADD"}
          </button>
        </div>
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
      </div>

      {tasks.length === 0 ? (
        <div className="border border-border p-6 text-center text-xs tracking-wider text-muted-foreground">
          NO TASKS YET
        </div>
      ) : (
        <>
          {/* ── TIMELINE (세로 24시간 × 가로 품목) ─────────────── */}
          <div ref={scrollRef} className="max-h-[640px] overflow-auto border border-border">
            <div
              className="relative"
              style={{ width: LABEL_WIDTH + columns.length * COL_WIDTH, minWidth: "100%" }}
            >
              {/* 헤더: 품목 이름 (sticky top) */}
              <div className="sticky top-0 z-30 flex bg-background">
                <div
                  className="sticky left-0 z-40 h-8 flex-none border-r border-b border-border bg-background"
                  style={{ width: LABEL_WIDTH }}
                />
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="flex h-8 flex-none items-center truncate border-r border-b border-border bg-background px-2 text-[11px] tracking-wider text-foreground"
                    style={{ width: COL_WIDTH }}
                    title={col.label}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* 본문: 시간 라벨(sticky left) + 품목별 열 */}
              <div className="relative flex" style={{ height: bodyHeight }}>
                <div
                  className="sticky left-0 z-20 flex-none border-r border-border bg-background"
                  style={{ width: LABEL_WIDTH }}
                >
                  {hourTicks.map((tick) => (
                    <div
                      key={tick.minute}
                      className="absolute w-full border-t border-border px-1 text-[10px] text-muted-foreground"
                      style={{ top: (tick.minute - range.startMinute) * PX_PER_MINUTE }}
                    >
                      {tick.label}
                    </div>
                  ))}
                </div>

                {columns.map((col) => {
                  const colTasks = scheduledByColumn.get(col.key) ?? [];
                  return (
                    <div
                      key={col.key}
                      className="relative flex-none border-r border-border"
                      style={{
                        width: COL_WIDTH,
                        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${ROW_HEIGHT}px)`,
                      }}
                    >
                      {colTasks.map((task) => {
                        const pos = taskBlockPosition(task, range, PX_PER_MINUTE);
                        if (!pos) return null;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => cycleStatus(task)}
                            className={`absolute right-1 left-1 overflow-hidden border px-1.5 py-0.5 text-left text-[11px] leading-tight ${
                              task.status === "DONE"
                                ? "border-foreground bg-foreground text-background"
                                : task.status === "SKIPPED"
                                  ? "border-dashed border-border text-muted-foreground line-through"
                                  : task.status === "IN_PROGRESS"
                                    ? "border-foreground bg-background text-foreground"
                                    : "border-dashed border-border bg-background text-foreground"
                            }`}
                            style={{ top: pos.top, height: pos.height }}
                            title={task.task_name}
                          >
                            <div className="truncate font-medium">{task.task_name}</div>
                            {task.task_type ? (
                              <span
                                className={`mt-0.5 inline-block truncate rounded-sm border px-1 text-[9px] tracking-wider ${taskTypeColorClass(task.task_type)}`}
                              >
                                {task.task_type.toUpperCase()}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}

                {nowTop !== null && (
                  <div
                    className="pointer-events-none absolute right-0 left-0 z-10 h-px bg-destructive"
                    style={{ top: nowTop }}
                  />
                )}
              </div>
            </div>
          </div>

          {unscheduled.length > 0 && (
            <div className="border border-border p-3">
              <div className="mb-2 text-xs tracking-wider text-muted-foreground">
                시간 미정 TASK
              </div>
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => cycleStatus(task)}
                    className={`${buttonClass} flex items-center gap-1.5 text-xs`}
                  >
                    {TASK_STATUS_ICON[task.status as TaskStatus] ?? "○"} {task.task_name}
                    {task.task_type ? (
                      <span
                        className={`rounded-sm border px-1 text-[9px] tracking-wider ${taskTypeColorClass(task.task_type)}`}
                      >
                        {task.task_type.toUpperCase()}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── TASK LIST (상세/삭제) ───────────────────── */}
          <div className="border border-border">
            {tasks.map((task) => {
              const duration =
                task.planned_start_at && task.planned_end_at
                  ? minutesBetween(task.planned_start_at, task.planned_end_at)
                  : null;
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-2 border-b border-border p-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">
                      {task.task_name}
                      {task.task_type ? (
                        <span
                          className={`ml-2 rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider ${taskTypeColorClass(task.task_type)}`}
                        >
                          {task.task_type.toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] tracking-wider text-muted-foreground tabular-nums">
                      {task.planned_start_at ? formatTime(task.planned_start_at) : "--:--"}
                      {" → "}
                      {task.planned_end_at ? formatTime(task.planned_end_at) : "--:--"}
                      {duration !== null ? ` · ${Math.round(duration)} MIN` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`${buttonClass} min-h-12`}
                      onClick={() => cycleStatus(task)}
                    >
                      {TASK_STATUS_ICON[task.status as TaskStatus] ?? "○"}{" "}
                      {TASK_STATUS_LABEL[task.status as TaskStatus] ?? task.status}
                    </button>
                    <button
                      type="button"
                      className={`${buttonClass} min-h-12`}
                      onClick={() => removeTask(task)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
