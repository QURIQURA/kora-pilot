/**
 * WORKFLOW TIMELINE — Work Session의 Task 계획/진행 뷰
 *
 * 절대 규칙 (src/lib/workflow.ts와 동일):
 * - duration은 저장하지 않는다 — planned_start_at / planned_end_at으로만 계산한다.
 * - 대기 시간(gap)은 엔티티가 아니다 — 타임라인의 빈 공간일 뿐이다.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { localDateTimeToISO, toLocalDateString, formatTime } from "@/lib/datetime";
import {
  computeTimelineRange,
  minutesBetween,
  nextTaskStatus,
  nowLinePosition,
  taskBarPosition,
  TASK_STATUS_ICON,
  TASK_STATUS_LABEL,
  TASK_TYPE_SUGGESTIONS,
  type TaskStatus,
  type WorkSessionTask,
} from "@/lib/workflow";
import { buttonClass, inputClass, primaryButtonClass, selectClass } from "@/components/pilot/ui";

const PX_PER_MINUTE = 2;

interface FormulaOption {
  formulaVersionId: string;
  formulaName: string;
}

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

  const range = useMemo(() => computeTimelineRange(tasks), [tasks]);
  const totalWidth = (range.endMinute - range.startMinute) * PX_PER_MINUTE;
  const nowLeft = nowLinePosition(range, PX_PER_MINUTE);

  const hourTicks = useMemo(() => {
    const ticks: { minute: number; label: string }[] = [];
    const first = Math.ceil(range.startMinute / 60) * 60;
    for (let m = first; m <= range.endMinute; m += 60) {
      ticks.push({ minute: m, label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00` });
    }
    return ticks;
  }, [range]);

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
              <option value="">NO FORMULA</option>
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
          {/* ── TIMELINE ────────────────────────── */}
          <div className="overflow-x-auto border border-border">
            <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
              <div className="relative h-6 border-b border-border">
                {hourTicks.map((tick) => (
                  <div
                    key={tick.minute}
                    className="absolute top-0 h-full border-l border-border pl-1 text-[10px] leading-6 text-muted-foreground"
                    style={{ left: (tick.minute - range.startMinute) * PX_PER_MINUTE }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
              <div className="relative">
                {tasks.map((task) => {
                  const pos = taskBarPosition(task, range, PX_PER_MINUTE);
                  return (
                    <div key={task.id} className="relative h-9 border-b border-border">
                      {pos ? (
                        <button
                          type="button"
                          onClick={() => cycleStatus(task)}
                          className={`absolute top-1 h-7 truncate border px-2 text-left text-xs ${
                            task.status === "DONE"
                              ? "bg-foreground text-background"
                              : task.status === "IN_PROGRESS"
                                ? "border-foreground"
                                : "border-dashed border-border"
                          }`}
                          style={{ left: pos.left, width: pos.width }}
                          title={task.task_name}
                        >
                          {task.task_name}
                        </button>
                      ) : (
                        <span className="absolute top-2 left-1 text-[10px] text-muted-foreground">
                          {task.task_name} — UNSCHEDULED
                        </span>
                      )}
                    </div>
                  );
                })}
                {nowLeft !== null && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-destructive"
                    style={{ left: nowLeft }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── TASK LIST ───────────────────────── */}
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
                        <span className="ml-2 bg-foreground px-1.5 py-0.5 text-[10px] tracking-wider text-background">
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
