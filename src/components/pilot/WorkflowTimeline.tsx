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
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, taskTypeColorsQuery, type VersionIngredientRow } from "@/lib/queries";
import { localDateTimeToISO, toLocalDateString, formatTime } from "@/lib/datetime";
import {
  computeTimelineRange,
  minutesBetween,
  minutesFromDayStart,
  nextTaskStatus,
  nowLineOffset,
  taskBlockPosition,
  taskTypeColorClass,
  taskTypeColorKey,
  taskTypeLineColorClass,
  TASK_STATUS_ICON,
  TASK_STATUS_LABEL,
  TASK_TYPE_COLOR_CLASSES,
  TASK_TYPE_SUGGESTIONS,
  type TaskStatus,
  type WorkSessionTask,
} from "@/lib/workflow";
import { buttonClass, inputClass, primaryButtonClass, selectClass } from "@/components/pilot/ui";

const ROW_HEIGHT = 56; // 1시간당 px
const PX_PER_MINUTE = ROW_HEIGHT / 60;
const LABEL_WIDTH = 64;
const COL_WIDTH = 190;
/** 시작/종료 시각 라벨 한 줄 높이(px) — 실제 소요 시간이 아무리 짧아도 이 두 줄은 항상 보여야 한다 */
const MARKER_ROW_HEIGHT = 18;
/** TASK 블록의 최소 표시 높이 — 시작 라벨+연결선+종료 라벨이 겹치지 않고 다 보이는 최소값(2026-09-24) */
const MIN_BLOCK_DISPLAY_HEIGHT = MARKER_ROW_HEIGHT * 2 + 10;

interface FormulaOption {
  formulaVersionId: string;
  formulaName: string;
}

const GENERAL_KEY = "__general__";

export function WorkflowView({
  sessionId,
  tasks,
  formulaOptions,
  ingredientsByVersion,
  taskIngredients,
  onTasksChanged,
}: {
  sessionId: string;
  tasks: WorkSessionTask[];
  formulaOptions: FormulaOption[];
  /** formula_version_id → 그 배합의 재료 줄 목록(2026-09-23) — TASK를 특정 재료 그룹으로 묶을 때 선택지로 씀 */
  ingredientsByVersion?: Record<string, VersionIngredientRow[]>;
  /** taskId → 그 TASK에 묶인 재료 줄(2026-09-23) */
  taskIngredients?: Record<string, { lineId: string; name: string }[]>;
  onTasksChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("");
  const [formulaVersionId, setFormulaVersionId] = useState("");
  const [ingredientLineIds, setIngredientLineIds] = useState<string[]>([]);
  const [day, setDay] = useState(() => toLocalDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    taskType: string;
    formulaVersionId: string;
    day: string;
    startTime: string;
    endTime: string;
    /** 실제 시작/완료 시각 — 타임스탬프 버튼 누르는 걸 깜빡했을 때 수동으로 고칠 수 있게(2026-09-24) */
    actualDay: string;
    actualStartTime: string;
    actualEndTime: string;
    ingredientLineIds: string[];
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);
  const queryClient = useQueryClient();

  const taskTypeColors = useQuery(taskTypeColorsQuery());
  // TASK TYPE 이름(소문자) → 사용자가 고른 color_class. 없으면 taskTypeColorClass()가 해시 기본색을 쓴다.
  const colorOverrides = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of taskTypeColors.data ?? []) map[taskTypeColorKey(row.task_type)] = row.color_class;
    return map;
  }, [taskTypeColors.data]);

  const setTaskTypeColor = useMutation({
    mutationFn: async ({ taskType, colorClass }: { taskType: string; colorClass: string }) => {
      const userId = await currentUserId();
      const { error: upsertError } = await supabase
        .from("task_type_colors")
        .upsert(
          { user_id: userId, task_type: taskTypeColorKey(taskType), color_class: colorClass },
          { onConflict: "user_id,task_type" },
        );
      if (upsertError) throw upsertError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task_type_colors"] }),
  });

  // 색상 설정 목록에 보여줄 TASK TYPE — 미리 정의된 제안 + 지금 실제로 쓰이고 있는 커스텀 TYPE 전부
  const knownTaskTypes = useMemo(() => {
    const set = new Set<string>(TASK_TYPE_SUGGESTIONS);
    for (const t of tasks) if (t.task_type) set.add(t.task_type);
    return Array.from(set);
  }, [tasks]);

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

  // "시간 미정 TASK"는 계획 시간이 없는(또는 한쪽만 있는) TASK 중에서도, 아직 실제로 시작/완료
  // 타임스탬프가 찍히지 않은 것만 보여준다 — 실제 타임스탬프가 찍히면(작업이 시작/완료됐다는 뜻)
  // 더 이상 "미정" 취급하지 않고 목록에서 빠진다(2026-09-24).
  const unscheduled = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!t.planned_start_at || !t.planned_end_at) && !t.actual_started_at && !t.completed_at,
      ),
    [tasks],
  );

  // 이미 다른 TASK에 묶인 재료 라인 — 중복 배정 방지용. 지금 수정 중인 TASK 자신의 기존 배정은 제외한다
  // (그래야 EDIT 화면에서 자기 자신이 이미 골라둔 재료까지 회색으로 막히지 않는다).
  const ingredientUsedElsewhere = useMemo(() => {
    const used = new Set<string>();
    for (const [taskId, links] of Object.entries(taskIngredients ?? {})) {
      if (taskId === editingTaskId) continue;
      for (const link of links) used.add(link.lineId);
    }
    return used;
  }, [taskIngredients, editingTaskId]);

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
    const { data: inserted, error: insertError } = await supabase
      .from("work_session_tasks")
      .insert({
        work_session_id: sessionId,
        user_id: userId,
        task_name: trimmed,
        task_type: taskType.trim() || null,
        formula_version_id: formulaVersionId || null,
        planned_start_at: startTime ? localDateTimeToISO(day, startTime) : null,
        planned_end_at: endTime ? localDateTimeToISO(day, endTime) : null,
        sort_order: maxSort + 1,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      setSaving(false);
      setError(`ADD FAILED — ${insertError?.message ?? "unknown error"}`);
      return;
    }
    if (ingredientLineIds.length > 0) {
      const { error: linkError } = await supabase.from("work_session_task_ingredients").insert(
        ingredientLineIds.map((lineId) => ({
          user_id: userId,
          work_session_id: sessionId,
          task_id: inserted.id,
          formula_version_ingredient_id: lineId,
        })),
      );
      if (linkError) {
        setSaving(false);
        setError(`재료 그룹 저장 실패 — ${linkError.message}`);
        await onTasksChanged();
        return;
      }
    }
    setSaving(false);
    setName("");
    setTaskType("");
    setStartTime("");
    setEndTime("");
    setIngredientLineIds([]);
    await onTasksChanged();
  }

  async function cycleStatus(task: WorkSessionTask) {
    const next = nextTaskStatus(task.status as TaskStatus);
    const patch: { status: TaskStatus; completed_at: string | null; actual_started_at?: string | null } = {
      status: next,
      completed_at: next === "DONE" ? new Date().toISOString() : null,
    };
    // 실제 시작 시각은 IN_PROGRESS로 처음 넘어갈 때 한 번만 자동 기록하고, 완전히 한 바퀴 돌아
    // NOT_STARTED로 돌아오면 초기화한다(재시작). completed_at과 동일한 "매 전환마다 재계산" 규칙.
    if (next === "IN_PROGRESS") {
      patch.actual_started_at = task.actual_started_at ?? new Date().toISOString();
    } else if (next === "NOT_STARTED") {
      patch.actual_started_at = null;
    }
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update(patch)
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

  function startEditing(task: WorkSessionTask) {
    setEditingTaskId(task.id);
    setEditError(null);
    setEditDraft({
      name: task.task_name,
      taskType: task.task_type ?? "",
      formulaVersionId: task.formula_version_id ?? "",
      day: task.planned_start_at ? toLocalDateString(new Date(task.planned_start_at)) : day,
      startTime: task.planned_start_at ? formatTime(task.planned_start_at) : "",
      endTime: task.planned_end_at ? formatTime(task.planned_end_at) : "",
      actualDay: task.actual_started_at
        ? toLocalDateString(new Date(task.actual_started_at))
        : task.completed_at
          ? toLocalDateString(new Date(task.completed_at))
          : day,
      actualStartTime: task.actual_started_at ? formatTime(task.actual_started_at) : "",
      actualEndTime: task.completed_at ? formatTime(task.completed_at) : "",
      ingredientLineIds: (taskIngredients?.[task.id] ?? []).map((l) => l.lineId),
    });
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditDraft(null);
    setEditError(null);
  }

  async function saveEdit(taskId: string) {
    if (!editDraft) return;
    const trimmed = editDraft.name.trim();
    if (!trimmed) {
      setEditError("TASK NAME IS REQUIRED");
      return;
    }
    if (editDraft.startTime && editDraft.endTime && editDraft.endTime <= editDraft.startTime) {
      setEditError("END TIME MUST BE AFTER START TIME");
      return;
    }
    if (
      editDraft.actualStartTime &&
      editDraft.actualEndTime &&
      editDraft.actualEndTime <= editDraft.actualStartTime
    ) {
      setEditError("실제 완료 시각은 실제 시작 시각보다 뒤여야 합니다");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const userId = await currentUserId();
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({
        task_name: trimmed,
        task_type: editDraft.taskType.trim() || null,
        formula_version_id: editDraft.formulaVersionId || null,
        planned_start_at: editDraft.startTime
          ? localDateTimeToISO(editDraft.day, editDraft.startTime)
          : null,
        planned_end_at: editDraft.endTime
          ? localDateTimeToISO(editDraft.day, editDraft.endTime)
          : null,
        // 타임스탬프 버튼 누르는 걸 깜빡한 경우를 위한 수동 보정(2026-09-24) — 상태 버튼과 별개로
        // 여기서 직접 실제 시작/완료 시각을 쓰거나 비울 수 있다.
        actual_started_at: editDraft.actualStartTime
          ? localDateTimeToISO(editDraft.actualDay, editDraft.actualStartTime)
          : null,
        completed_at: editDraft.actualEndTime
          ? localDateTimeToISO(editDraft.actualDay, editDraft.actualEndTime)
          : null,
      })
      .eq("id", taskId);
    if (updateError) {
      setEditSaving(false);
      setEditError(`SAVE FAILED — ${updateError.message}`);
      return;
    }
    // 재료 그룹은 매번 통째로 다시 쓴다(기존 링크 삭제 후 선택된 것만 재삽입) — 부분 diff보다 단순하고 안전
    const { error: clearError } = await supabase
      .from("work_session_task_ingredients")
      .delete()
      .eq("task_id", taskId);
    if (clearError) {
      setEditSaving(false);
      setEditError(`재료 그룹 저장 실패 — ${clearError.message}`);
      await onTasksChanged();
      return;
    }
    if (editDraft.ingredientLineIds.length > 0) {
      const { error: linkError } = await supabase.from("work_session_task_ingredients").insert(
        editDraft.ingredientLineIds.map((lineId) => ({
          user_id: userId,
          work_session_id: sessionId,
          task_id: taskId,
          formula_version_ingredient_id: lineId,
        })),
      );
      if (linkError) {
        setEditSaving(false);
        setEditError(`재료 그룹 저장 실패 — ${linkError.message}`);
        await onTasksChanged();
        return;
      }
    }
    setEditSaving(false);
    setEditingTaskId(null);
    setEditDraft(null);
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
              onChange={(e) => {
                setFormulaVersionId(e.target.value);
                setIngredientLineIds([]);
              }}
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
        {formulaVersionId && (ingredientsByVersion?.[formulaVersionId]?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
            <div className="text-[10px] tracking-wider text-muted-foreground">
              이 스텝에 묶을 재료(선택, 예: 흰자+설탕 → MERINGUE)
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(ingredientsByVersion?.[formulaVersionId] ?? []).map((line) => {
                const checked = ingredientLineIds.includes(line.id);
                const used = ingredientUsedElsewhere.has(line.id);
                return (
                  <label
                    key={line.id}
                    className={`flex items-center gap-1 text-xs ${
                      used ? "text-muted-foreground line-through opacity-60" : ""
                    }`}
                    title={used ? "이미 다른 TASK에 묶인 재료입니다" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={used}
                      onChange={(e) => {
                        setIngredientLineIds((prev) =>
                          e.target.checked
                            ? [...prev, line.id]
                            : prev.filter((id) => id !== line.id),
                        );
                      }}
                    />
                    {line.ingredients.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
      </div>

      {/* ── TASK TYPE 색상 설정 ─────────────── */}
      <div className="border border-border p-3">
        <button
          type="button"
          className="text-xs tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setColorSettingsOpen((v) => !v)}
        >
          {colorSettingsOpen ? "▾" : "▸"} TASK TYPE 색상 설정
        </button>
        {colorSettingsOpen && (
          <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
            {knownTaskTypes.map((type) => {
              const current = colorOverrides[taskTypeColorKey(type)] ?? taskTypeColorClass(type);
              return (
                <div key={type} className="flex flex-wrap items-center gap-2">
                  <span
                    className={`w-28 flex-none truncate rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider ${taskTypeColorClass(type, colorOverrides)}`}
                  >
                    {type.toUpperCase()}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {TASK_TYPE_COLOR_CLASSES.map((cls) => (
                      <button
                        key={cls}
                        type="button"
                        title={cls}
                        className={`h-5 w-5 rounded-sm border ${cls} ${
                          current === cls ? "ring-2 ring-foreground ring-offset-1" : ""
                        }`}
                        onClick={() => setTaskTypeColor.mutate({ taskType: type, colorClass: cls })}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                        // 실제 소요 시간이 짧아도 시작/종료 라벨이 항상 다 보이도록 표시 높이는
                        // 최소값을 보장한다 — 그 안의 연결선만 실제 길이(짧으면 아주 얇게)를 반영한다
                        // (2026-09-24: "줄만 보이고 뭔지 안 보인다" 피드백 — 이전엔 높이가 4px로
                        // 눌려서 이름이 렌더링될 공간이 없었다).
                        const displayHeight = Math.max(pos.height, MIN_BLOCK_DISPLAY_HEIGHT);
                        const lineHeight = Math.max(displayHeight - MARKER_ROW_HEIGHT * 2, 2);
                        const startLabel = task.actual_started_at
                          ? formatTime(task.actual_started_at)
                          : task.planned_start_at
                            ? formatTime(task.planned_start_at)
                            : "--:--";
                        const endLabel = task.completed_at
                          ? formatTime(task.completed_at)
                          : task.planned_end_at
                            ? formatTime(task.planned_end_at)
                            : "--:--";
                        const isDone = task.status === "DONE";
                        const isSkipped = task.status === "SKIPPED";
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => cycleStatus(task)}
                            className={`absolute right-1 left-1 flex flex-col overflow-hidden text-left ${
                              isSkipped ? "opacity-60" : ""
                            }`}
                            style={{ top: pos.top, height: displayHeight }}
                            title={task.task_name}
                          >
                            {/* 시작 박스: 시작 시각 + TASK 이름 + TYPE 배지 */}
                            <div
                              className={`flex items-center gap-1 truncate border px-1 text-[10px] leading-tight ${
                                isDone
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-background text-foreground"
                              }`}
                              style={{ height: MARKER_ROW_HEIGHT }}
                            >
                              <span className="flex-none tabular-nums text-[9px] opacity-70">
                                {startLabel}
                              </span>
                              <span
                                className={`truncate font-medium ${isSkipped ? "line-through" : ""}`}
                              >
                                {task.task_name}
                              </span>
                              {task.task_type ? (
                                <span
                                  className={`flex-none truncate rounded-sm border px-1 text-[8px] tracking-wider ${taskTypeColorClass(task.task_type, colorOverrides)}`}
                                >
                                  {task.task_type.toUpperCase()}
                                </span>
                              ) : null}
                            </div>
                            {/* 시작-종료를 잇는 색선 — TASK TYPE 색(사용자 지정 우선) */}
                            <div className="flex flex-1 justify-center py-0.5">
                              <div
                                className={`w-[3px] rounded-full ${
                                  isSkipped
                                    ? "bg-border"
                                    : taskTypeLineColorClass(task.task_type, colorOverrides)
                                }`}
                                style={{ height: lineHeight }}
                              />
                            </div>
                            {/* 종료 박스: 종료 시각만 */}
                            <div
                              className="flex flex-none items-center px-1 text-[9px] tabular-nums text-muted-foreground"
                              style={{ height: MARKER_ROW_HEIGHT }}
                            >
                              {endLabel}
                            </div>
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
                        className={`rounded-sm border px-1 text-[9px] tracking-wider ${taskTypeColorClass(task.task_type, colorOverrides)}`}
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
              const actualDuration =
                task.actual_started_at && task.completed_at
                  ? minutesBetween(task.actual_started_at, task.completed_at)
                  : null;
              const linkedIngredients = taskIngredients?.[task.id] ?? [];

              if (editingTaskId === task.id && editDraft) {
                const editIngredientOptions = editDraft.formulaVersionId
                  ? (ingredientsByVersion?.[editDraft.formulaVersionId] ?? [])
                  : [];
                return (
                  <div key={task.id} className="border-b border-border p-3 last:border-b-0">
                    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                      <input
                        className={`${inputClass} md:w-56`}
                        placeholder="TASK NAME"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                      <input
                        className={`${inputClass} md:w-40`}
                        placeholder="TYPE"
                        list="workflow-task-types"
                        value={editDraft.taskType}
                        onChange={(e) => setEditDraft({ ...editDraft, taskType: e.target.value })}
                      />
                      {formulaOptions.length > 0 && (
                        <select
                          className={`${selectClass} md:w-56`}
                          value={editDraft.formulaVersionId}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              formulaVersionId: e.target.value,
                              ingredientLineIds: [],
                            })
                          }
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
                        value={editDraft.day}
                        onChange={(e) => setEditDraft({ ...editDraft, day: e.target.value })}
                      />
                      <input
                        type="time"
                        className={`${inputClass} md:w-32`}
                        value={editDraft.startTime}
                        onChange={(e) => setEditDraft({ ...editDraft, startTime: e.target.value })}
                      />
                      <input
                        type="time"
                        className={`${inputClass} md:w-32`}
                        value={editDraft.endTime}
                        onChange={(e) => setEditDraft({ ...editDraft, endTime: e.target.value })}
                      />
                    </div>
                    <div className="mt-2 flex flex-col gap-2 border-t border-dashed border-border pt-2 md:flex-row md:flex-wrap md:items-center">
                      <span className="text-[10px] tracking-wider text-muted-foreground">
                        실제 시작/완료 (타임스탬프 버튼 깜빡했을 때 직접 수정)
                      </span>
                      <input
                        type="date"
                        className={`${inputClass} md:w-40`}
                        value={editDraft.actualDay}
                        onChange={(e) => setEditDraft({ ...editDraft, actualDay: e.target.value })}
                      />
                      <input
                        type="time"
                        className={`${inputClass} md:w-32`}
                        value={editDraft.actualStartTime}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, actualStartTime: e.target.value })
                        }
                      />
                      <input
                        type="time"
                        className={`${inputClass} md:w-32`}
                        value={editDraft.actualEndTime}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, actualEndTime: e.target.value })
                        }
                      />
                    </div>
                    {editIngredientOptions.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
                        <div className="text-[10px] tracking-wider text-muted-foreground">
                          이 스텝에 묶을 재료(선택)
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {editIngredientOptions.map((line) => {
                            const checked = editDraft.ingredientLineIds.includes(line.id);
                            const used = ingredientUsedElsewhere.has(line.id);
                            return (
                              <label
                                key={line.id}
                                className={`flex items-center gap-1 text-xs ${
                                  used ? "text-muted-foreground line-through opacity-60" : ""
                                }`}
                                title={used ? "이미 다른 TASK에 묶인 재료입니다" : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={used}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      ingredientLineIds: e.target.checked
                                        ? [...editDraft.ingredientLineIds, line.id]
                                        : editDraft.ingredientLineIds.filter((id) => id !== line.id),
                                    })
                                  }
                                />
                                {line.ingredients.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {editError && <div className="mt-2 text-xs text-destructive">{editError}</div>}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className={`${primaryButtonClass} min-h-12`}
                        disabled={editSaving}
                        onClick={() => saveEdit(task.id)}
                      >
                        {editSaving ? "SAVING..." : "저장"}
                      </button>
                      <button
                        type="button"
                        className={`${buttonClass} min-h-12`}
                        onClick={cancelEditing}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                );
              }

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
                          className={`ml-2 rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider ${taskTypeColorClass(task.task_type, colorOverrides)}`}
                        >
                          {task.task_type.toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    {linkedIngredients.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {linkedIngredients.map((l) => l.name).join(" + ")}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] tracking-wider text-muted-foreground tabular-nums">
                      계획 {task.planned_start_at ? formatTime(task.planned_start_at) : "--:--"}
                      {" → "}
                      {task.planned_end_at ? formatTime(task.planned_end_at) : "--:--"}
                      {duration !== null ? ` · ${Math.round(duration)} MIN` : ""}
                    </div>
                    {(task.actual_started_at || task.completed_at) && (
                      <div className="mt-0.5 text-[11px] tracking-wider text-foreground tabular-nums">
                        실제 {task.actual_started_at ? formatTime(task.actual_started_at) : "--:--"}
                        {" → "}
                        {task.completed_at ? formatTime(task.completed_at) : "--:--"}
                        {actualDuration !== null ? ` · ${Math.round(actualDuration)} MIN` : ""}
                      </div>
                    )}
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
                      onClick={() => startEditing(task)}
                    >
                      EDIT
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
