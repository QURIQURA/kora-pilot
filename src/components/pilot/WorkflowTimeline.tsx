/**
 * WORKFLOW TIMELINE — Work Session의 Task 진행 뷰
 *
 * 절대 규칙 (src/lib/workflow.ts와 동일):
 * - 별도의 "계획(planned)" 컬럼은 두지 않는다 — 시작/완료 시각은 actual_started_at/completed_at
 *   하나씩만 쓴다(2026-09-23). 다만 2026-09-30부터 이 값들은 TASK 목록에서 미리(작업 전이라도)
 *   직접 입력·수정할 수 있다 — "예정"과 "실제"를 구분하는 별도 개념 없이, 값이 들어가는 순간
 *   그 TASK가 타임라인에 나타난다. 별도의 "TASK 순서" 상자는 없다 — 시간표 자체가 순서다.
 * - duration은 저장하지 않는다 — actual_started_at / completed_at으로만 계산한다.
 * - 대기 시간(gap)은 엔티티가 아니다 — 타임라인의 빈 공간일 뿐이다.
 *
 * 레이아웃: 세로형 24시간 축 — 행(row)=시간(00:00~24:00), 열(column)=품목(Formula/GENERAL).
 * 시간 라벨 열은 스크롤 시에도 고정(sticky)된다. 여러 품목이 동시에 진행될 때 실제 시간축을
 * 기준으로 무엇이 돌아가고 있는지 한눈에 보여주는 것이 목적이다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  taskTypeColorsQuery,
  type VersionIngredientRow,
} from "@/lib/queries";
import { localDateTimeToISO, toLocalDateString, formatTime, formatDuration } from "@/lib/datetime";
import {
  assignTimelineLanes,
  computeTaskPhase,
  computeTimelineRange,
  hasObservationFields,
  hasTimerField,
  minutesBetween,
  minutesFromDayStart,
  nowLineOffset,
  parseChecklistLines,
  taskBlockPosition,
  taskTypeColorClass,
  taskTypeColorKey,
  taskTypeLineColorClass,
  TASK_PHASE_ICON,
  TASK_PHASE_LABEL,
  TASK_TYPE_COLOR_CLASSES,
  TASK_TYPE_SUGGESTIONS,
  type ChecklistItem,
  type TaskPhase,
  type WorkSessionTask,
} from "@/lib/workflow";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/pilot/ui";

// 2026-09-23: 텍스트/박스가 안 잘리고 가독성 좋도록 타임라인 가로(COL_WIDTH)·세로(ROW_HEIGHT) 확대.
const ROW_HEIGHT = 80; // 1시간당 px
const PX_PER_MINUTE = ROW_HEIGHT / 60;
const LABEL_WIDTH = 64;
const COL_WIDTH = 260;
/** 시작/종료 시각 라벨 한 줄 높이(px) — 실제 소요 시간이 아무리 짧아도 이 두 줄은 항상 보여야 한다 */
const MARKER_ROW_HEIGHT = 24;
/** TASK당 최소 세로 공간 — 연결선(rail)이 시작~종료 라벨 두 줄과 겹치지 않는 최소값(2026-09-24) */
const MIN_BLOCK_DISPLAY_HEIGHT = MARKER_ROW_HEIGHT * 2 + 10;
/** 겹치는 TASK끼리 서로 다른 레인에 그리는 연결선(rail) 너비 — wann-planner TIMELINE 참고(2026-09-24) */
const RAIL_W = 6;

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
  taskPredecessors,
  onTasksChanged,
  onTaskStarted,
}: {
  sessionId: string;
  tasks: WorkSessionTask[];
  formulaOptions: FormulaOption[];
  /** formula_version_id → 그 배합의 재료 줄 목록(2026-09-23) — TASK를 특정 재료 그룹으로 묶을 때 선택지로 씀 */
  ingredientsByVersion?: Record<string, VersionIngredientRow[]>;
  /** taskId → 그 TASK에 묶인 재료 줄(2026-09-23) */
  taskIngredients?: Record<string, { lineId: string; name: string }[]>;
  /** taskId → 그 TASK가 이어받는 선행 TASK(복수 가능, 2026-09-24) */
  taskPredecessors?: Record<string, { taskId: string; name: string }[]>;
  onTasksChanged: () => void | Promise<void>;
  /** WORK SESSION이 아직 PLANNED(START WORK 누르기 전)인데 TASK에 시작시각이 기록되면 그 시각으로
   * 세션도 자동 IN_PROGRESS 전환하도록 부모에 알린다(2026-09-30) — "START WORK 누르는 걸 깜빡해도
   * TASK 시작시간이 기록되는 순간 세션도 같이 시작된 걸로 쳐달라"는 요청. */
  onTaskStarted?: (iso: string) => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  // 포커스 모드(2026-09-24) — 한 품목(Component)의 "지금 할 일"에만 집중하는 간단 화면.
  const [focusColumnKey, setFocusColumnKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);

  const taskTypeColors = useQuery(taskTypeColorsQuery());

  // TASK TYPE 이름(소문자) → 사용자가 고른 color_class. 없으면 taskTypeColorClass()가 해시 기본색을 쓴다.
  const colorOverrides = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of taskTypeColors.data ?? []) map[taskTypeColorKey(row.task_type)] = row.color_class;
    return map;
  }, [taskTypeColors.data]);

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

  // 열(품목) = 선택된 Formula Version들 + Formula 없는 Task를 위한 GENERAL 열 + (2026-09-30) 이미
  // SELECTED FORMULA VERSIONS에서 REMOVE된 뒤에도 TASK 자체는 남아있는 경우(예전 데이터, REMOVE 시
  // TASK까지 함께 지우게 고치기 전에 생긴 것들)를 위한 안전장치 — TASK LIST에는 항상 보이는데
  // 타임라인 그리드에서만 조용히 사라지는 걸 막는다.
  const columns = useMemo(() => {
    const cols = formulaOptions.map((f) => ({ key: f.formulaVersionId, label: f.formulaName }));
    const knownKeys = new Set(cols.map((c) => c.key));
    for (const t of tasks) {
      if (t.formula_version_id && !knownKeys.has(t.formula_version_id)) {
        knownKeys.add(t.formula_version_id);
        cols.push({ key: t.formula_version_id, label: "(제거된 배합)" });
      }
    }
    cols.push({ key: GENERAL_KEY, label: "GENERAL" });
    return cols;
  }, [formulaOptions, tasks]);

  // 타임라인 위 세로 드래그로 시간 이동(2026-09-30) — rail을 마우스로 눌러 위/아래로 끌면
  // 시작시각(있으면 완료시각도 같은 만큼)이 5분 단위로 바뀐다. 진행 중인 드래그 값은 dragPreview에만
  // 두고, 마우스를 떼는 순간 DB에 커밋한다 — 실시간 미리보기를 위해 displayTasks에 얹어서 쓴다.
  const dragSessionRef = useRef<{
    taskId: string;
    startClientY: number;
    originalStartMs: number;
    originalEndMs: number | null;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    taskId: string;
    startedAtMs: number;
    completedAtMs: number | null;
  } | null>(null);

  function beginDrag(task: WorkSessionTask, clientY: number) {
    if (!task.actual_started_at) return;
    const originalStartMs = new Date(task.actual_started_at).getTime();
    const originalEndMs = task.completed_at ? new Date(task.completed_at).getTime() : null;
    dragSessionRef.current = { taskId: task.id, startClientY: clientY, originalStartMs, originalEndMs };
    setDragPreview({ taskId: task.id, startedAtMs: originalStartMs, completedAtMs: originalEndMs });
  }

  async function commitDrag(taskId: string, startMs: number, endMs: number | null) {
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({
        actual_started_at: new Date(startMs).toISOString(),
        completed_at: endMs != null ? new Date(endMs).toISOString() : null,
      })
      .eq("id", taskId);
    if (updateError) setError(`시간 이동 실패 — ${updateError.message}`);
    await onTasksChanged();
    await onTaskStarted?.(new Date(startMs).toISOString());
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const session = dragSessionRef.current;
      if (!session) return;
      const deltaMinutes = (e.clientY - session.startClientY) / PX_PER_MINUTE;
      const snapped = Math.round(deltaMinutes / 5) * 5;
      setDragPreview({
        taskId: session.taskId,
        startedAtMs: session.originalStartMs + snapped * 60000,
        completedAtMs: session.originalEndMs != null ? session.originalEndMs + snapped * 60000 : null,
      });
    }
    function onUp() {
      const session = dragSessionRef.current;
      if (!session) return;
      dragSessionRef.current = null;
      setDragPreview((preview) => {
        if (preview && preview.taskId === session.taskId) {
          void commitDrag(session.taskId, preview.startedAtMs, preview.completedAtMs);
        }
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드래그 중인 TASK는 미리보기 시각을 얹어서 타임라인 계산에 사용 — 실제 저장은 마우스를 뗄 때만.
  const displayTasks = useMemo(() => {
    if (!dragPreview) return tasks;
    return tasks.map((t) =>
      t.id === dragPreview.taskId
        ? {
            ...t,
            actual_started_at: new Date(dragPreview.startedAtMs).toISOString(),
            completed_at:
              dragPreview.completedAtMs != null ? new Date(dragPreview.completedAtMs).toISOString() : null,
          }
        : t,
    );
  }, [tasks, dragPreview]);

  // "계획" 개념이 없어졌으므로(2026-09-23) 실제로 시작한(actual_started_at) TASK만 타임라인에
  // 올린다 — 여러 품목이 동시에 돌아갈 때 실제 시간축 기준으로 무엇이 진행 중인지 보여주는 것이
  // 이 타임라인의 목적이다.
  const scheduledByColumn = useMemo(() => {
    const map = new Map<string, WorkSessionTask[]>();
    for (const t of displayTasks) {
      if (!t.actual_started_at) continue;
      const key = t.formula_version_id ?? GENERAL_KEY;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [displayTasks]);

  // id → task — LOCKED/READY 판정에 선행 TASK의 현재 status가 필요하다(2026-09-24).
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const predecessorIdsOf = (taskId: string) => (taskPredecessors?.[taskId] ?? []).map((p) => p.taskId);
  const phaseOf = (task: WorkSessionTask): TaskPhase =>
    computeTaskPhase(task, predecessorIdsOf(task.id), tasksById);

  // ACTIVE NOW/타이머용 1초 tick — 진행 중(IN_PROGRESS) TASK가 하나라도 있을 때만 돈다.
  const [now, setNow] = useState(() => new Date());
  const anyActive = tasks.some((t) => t.status === "IN_PROGRESS");
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [anyActive]);

  const activeNow = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "IN_PROGRESS" && t.actual_started_at)
        .sort((a, b) => (a.actual_started_at! < b.actual_started_at! ? -1 : 1)),
    [tasks],
  );

  function columnLabelOf(formulaVersionId: string | null): string {
    if (!formulaVersionId) return "GENERAL";
    return formulaOptions.find((f) => f.formulaVersionId === formulaVersionId)?.formulaName ?? "GENERAL";
  }

  /** READY → START: 실제 시작 시각 기록, IN_PROGRESS로 전환 */
  async function startTask(task: WorkSessionTask) {
    const startedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ status: "IN_PROGRESS", actual_started_at: startedAt })
      .eq("id", task.id);
    if (updateError) setError(`START FAILED — ${updateError.message}`);
    await onTasksChanged();
    await onTaskStarted?.(startedAt);
  }

  /** ACTIVE → COMPLETE: 실제 완료 시각 기록, DONE으로 전환. 다음 TASK는 자동으로 READY "로 보이게"
   * 될 뿐(계산값), 자동 START는 하지 않는다 — 사용자가 직접 다음 TASK를 눌러야 한다. */
  async function completeTask(task: WorkSessionTask) {
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ status: "DONE", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    if (updateError) setError(`COMPLETE FAILED — ${updateError.message}`);
    await onTasksChanged();
  }

  async function skipTask(task: WorkSessionTask) {
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ status: "SKIPPED", actual_started_at: task.actual_started_at, completed_at: null })
      .eq("id", task.id);
    if (updateError) setError(`SKIP FAILED — ${updateError.message}`);
    await onTasksChanged();
  }

  /** DONE/SKIPPED를 되돌려 다시 NOT_STARTED(LOCKED/READY)로 — 잘못 눌렀을 때 되돌리기용 */
  async function resetTask(task: WorkSessionTask) {
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ status: "NOT_STARTED", actual_started_at: null, completed_at: null })
      .eq("id", task.id);
    if (updateError) setError(`UNDO FAILED — ${updateError.message}`);
    await onTasksChanged();
  }

  /** 시작/완료 시각을 직접 설정·수정 — "계획" 개념을 다시 만들지 않고, 같은 컬럼(actual_started_at/
   * completed_at)에 미리(작업 전이라도) 값을 넣을 수 있게 열어준다(2026-09-30). 값을 넣는 순간부터
   * 그 TASK는 타임라인에 나타난다 — 별도의 "TASK 순서" 상자 없이 시간표가 곧 순서가 된다.
   * 날짜는 화면에 안 보이고 시간만 입력받는다(2026-09-30) — 날짜까지 매번 입력/표시하는 게
   * 번거롭다는 피드백. 날짜는 기존 값의 날짜(없으면 오늘)를 그대로 쓴다. */
  function taskDayFor(task: WorkSessionTask): string {
    if (task.actual_started_at) return toLocalDateString(new Date(task.actual_started_at));
    if (task.completed_at) return toLocalDateString(new Date(task.completed_at));
    return toLocalDateString();
  }

  async function setTaskStart(task: WorkSessionTask, timeValue: string) {
    const iso = timeValue ? localDateTimeToISO(taskDayFor(task), timeValue) : null;
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ actual_started_at: iso })
      .eq("id", task.id);
    if (updateError) setError(`시작시간 저장 실패 — ${updateError.message}`);
    await onTasksChanged();
    if (iso) await onTaskStarted?.(iso);
  }

  async function setTaskEnd(task: WorkSessionTask, timeValue: string) {
    const iso = timeValue ? localDateTimeToISO(taskDayFor(task), timeValue) : null;
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ completed_at: iso })
      .eq("id", task.id);
    if (updateError) setError(`완료시간 저장 실패 — ${updateError.message}`);
    await onTasksChanged();
  }

  function toTimeValue(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 관찰값(observation_*) 저장 — COMPONENT의 OBSERVATION 섹션이 이 값을 모아서 보여준다. */
  async function setObservationField(
    task: WorkSessionTask,
    patch: Partial<
      Pick<
        WorkSessionTask,
        | "observation_status"
        | "observation_height_start_mm"
        | "observation_height_mid_mm"
        | "observation_height_end_mm"
        | "observation_temperature_c"
      >
    >,
  ) {
    const { error: updateError } = await supabase.from("work_session_tasks").update(patch).eq("id", task.id);
    if (updateError) setError(`관찰값 저장 실패 — ${updateError.message}`);
    await onTasksChanged();
  }

  async function toggleChecklistItem(task: WorkSessionTask, index: number) {
    const items = (task.checklist_items as unknown as ChecklistItem[] | null) ?? [];
    const next = items.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    const { error: updateError } = await supabase
      .from("work_session_tasks")
      .update({ checklist_items: next as never })
      .eq("id", task.id);
    if (updateError) setError(`체크리스트 저장 실패 — ${updateError.message}`);
    await onTasksChanged();
  }


  // 마운트 시 현재 시각(또는 진행중 Task) 근처로 자동 스크롤
  useEffect(() => {
    if (autoScrolled.current || !scrollRef.current) return;
    autoScrolled.current = true;
    const inProgress = tasks.find((t) => t.status === "IN_PROGRESS" && t.actual_started_at);
    const anchorMinute = inProgress?.actual_started_at
      ? minutesFromDayStart(inProgress.actual_started_at, range.dayStr)
      : (nowTop ?? 0) / PX_PER_MINUTE + range.startMinute;
    const top = Math.max(0, (anchorMinute - range.startMinute) * PX_PER_MINUTE - ROW_HEIGHT * 2);
    scrollRef.current.scrollTop = top;
  }, [tasks, range, nowTop]);




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
      {error && (
        <div className="border border-destructive p-2 text-xs text-destructive">{error}</div>
      )}
      {/* ── ACTIVE NOW — 지금 여러 품목에서 동시에 진행 중인 TASK 전부(2026-09-24) ────── */}
      {activeNow.length > 0 && (
        <div className="border-2 border-foreground p-3">
          <div className="mb-2 text-xs font-medium tracking-wider text-foreground">
            ACTIVE NOW ({activeNow.length})
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeNow.map((task) => {
              const elapsedSec = task.actual_started_at
                ? (now.getTime() - new Date(task.actual_started_at).getTime()) / 1000
                : 0;
              const timerMin = task.timer_minutes;
              const remainSec = timerMin != null ? timerMin * 60 - elapsedSec : null;
              return (
                <li key={task.id} className="border border-border p-2">
                  <div className="label-caps text-[10px] text-muted-foreground">
                    {columnLabelOf(task.formula_version_id)}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                    {task.task_name}
                    {task.task_type ? (
                      <span
                        className={`rounded-sm border px-1 text-[9px] tracking-wider ${taskTypeColorClass(task.task_type, colorOverrides)}`}
                      >
                        {task.task_type.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      시작 {task.actual_started_at ? formatTime(task.actual_started_at) : "--:--"} · 경과{" "}
                      {timerMin != null && remainSec !== null && remainSec > 0
                        ? `남은 ${formatDuration(remainSec)}`
                        : formatDuration(elapsedSec)}
                    </span>
                    <button
                      type="button"
                      className={`${primaryButtonClass} px-3 py-1 text-xs`}
                      onClick={() => completeTask(task)}
                    >
                      COMPLETE
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}



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
                    className="flex h-8 flex-none items-center justify-between gap-1 truncate border-r border-b border-border bg-background px-2 text-[11px] tracking-wider text-foreground"
                    style={{ width: COL_WIDTH }}
                  >
                    <span className="truncate" title={col.label}>
                      {col.label}
                    </span>
                    <button
                      type="button"
                      className="label-caps flex-none px-1 text-[9px] text-muted-foreground hover:text-foreground"
                      onClick={() => setFocusColumnKey(col.key)}
                    >
                      포커스
                    </button>
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

                  // 시작-종료 마커 + 연결선(rail) 디자인(2026-09-24, wann-planner TIMELINE 참고).
                  // 겹치는 TASK는 서로 다른 레인에 자기만의 rail을 그려서, 긴 TASK 도중 다른 TASK가
                  // 시작해도 어느 선이 어느 TASK인지 명확히 구분된다(이전 박스-채우기 디자인은 겹치는
                  // TASK끼리 같은 자리를 그대로 덮어써서 구분이 안 됐다).
                  const positioned = colTasks
                    .map((task) => ({ task, pos: taskBlockPosition(task, range, PX_PER_MINUTE) }))
                    .filter(
                      (x): x is { task: WorkSessionTask; pos: { top: number; height: number } } =>
                        x.pos !== null,
                    );
                  const { laneOf, laneCount } = assignTimelineLanes(
                    positioned.map(({ task, pos }) => ({
                      id: task.id,
                      top: pos.top,
                      bottom: pos.top + Math.max(pos.height, MARKER_ROW_HEIGHT),
                    })),
                  );
                  const gutterWidth = Math.max(laneCount, 1) * RAIL_W;

                  type MarkerRow = {
                    key: string;
                    top: number;
                    kind: "start" | "end";
                    task: WorkSessionTask;
                  };
                  const markerRows: MarkerRow[] = [];
                  const railEndByTask = new Map<string, number>();
                  for (const { task, pos } of positioned) {
                    // 실제 소요 시간이 짧아도 시작/종료 라벨 두 줄이 겹치지 않도록 rail의 끝은
                    // 최소 MARKER_ROW_HEIGHT만큼 아래로 내린다.
                    const railEnd = pos.top + Math.max(pos.height, MARKER_ROW_HEIGHT);
                    railEndByTask.set(task.id, railEnd);
                    markerRows.push({ key: `${task.id}-start`, top: pos.top, kind: "start", task });
                    markerRows.push({ key: `${task.id}-end`, top: railEnd, kind: "end", task });
                  }
                  // 같은 시간대(±MARKER_ROW_HEIGHT)에 몰린 마커끼리는 폭을 나눠서 겹치지 않게 한다.
                  const bucketOf = (top: number) => Math.round(top / MARKER_ROW_HEIGHT);
                  const rowsByBucket = new Map<number, MarkerRow[]>();
                  for (const row of markerRows) {
                    const b = bucketOf(row.top);
                    const arr = rowsByBucket.get(b) ?? [];
                    arr.push(row);
                    rowsByBucket.set(b, arr);
                  }

                  return (
                    <div
                      key={col.key}
                      className="relative flex-none border-r border-border"
                      style={{
                        width: COL_WIDTH,
                        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${ROW_HEIGHT}px)`,
                      }}
                    >
                      {/* 레인별 연결선(rail) — TASK TYPE 색, 시작~종료 구간을 차지. 세로로 눌러
                          드래그하면 시작(+완료)시각이 5분 단위로 이동한다(2026-09-30). */}
                      {positioned.map(({ task, pos }) => {
                        const lane = laneOf.get(task.id) ?? 0;
                        const railEnd = railEndByTask.get(task.id) ?? pos.top + pos.height;
                        const isDragging = dragPreview?.taskId === task.id;
                        return (
                          <div
                            key={`rail-${task.id}`}
                            title="드래그해서 시간 이동"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              beginDrag(task, e.clientY);
                            }}
                            className={`absolute cursor-ns-resize opacity-80 hover:opacity-100 ${taskTypeLineColorClass(task.task_type, colorOverrides)} ${
                              task.status === "SKIPPED" ? "opacity-30" : ""
                            } ${isDragging ? "ring-2 ring-foreground" : ""}`}
                            style={{
                              top: pos.top,
                              height: railEnd - pos.top,
                              left: lane * RAIL_W,
                              width: RAIL_W + 8,
                            }}
                          />
                        );
                      })}

                      {/* 시작/종료 마커 — 같은 시간대에 몰리면 자동으로 폭을 나눠 그린다 */}
                      {Array.from(rowsByBucket.values()).flatMap((rows) =>
                        rows.map((row, idx) => {
                          const n = rows.length;
                          const { task } = row;
                          const startLabel = task.actual_started_at
                            ? formatTime(task.actual_started_at)
                            : "--:--";
                          const endLabel = task.completed_at ? formatTime(task.completed_at) : "--:--";
                          const isDone = task.status === "DONE";
                          const isSkipped = task.status === "SKIPPED";
                          const isInProgress = task.status === "IN_PROGRESS";
                          const colorClass = taskTypeColorClass(task.task_type, colorOverrides);
                          return (
                            <button
                              key={row.key}
                              type="button"
                              title={
                                isInProgress
                                  ? "클릭하면 COMPLETE 처리됩니다"
                                  : isDone || isSkipped
                                    ? "클릭하면 되돌립니다(NOT_STARTED)"
                                    : task.task_name
                              }
                              onClick={() => {
                                if (isInProgress) completeTask(task);
                                else if (isDone || isSkipped) resetTask(task);
                              }}
                              className={`absolute flex items-center gap-1 overflow-hidden border px-1 text-left leading-tight ${colorClass} ${
                                isDone
                                  ? "ring-2 ring-inset ring-foreground"
                                  : isInProgress
                                    ? "ring-1 ring-inset ring-foreground"
                                    : ""
                              } ${isSkipped ? "opacity-50" : ""}`}
                              style={{
                                top: row.top,
                                height: MARKER_ROW_HEIGHT,
                                left: `calc(${gutterWidth}px + ${(idx / n) * 100}%)`,
                                width: `calc((100% - ${gutterWidth}px) / ${n})`,
                              }}
                            >
                              {row.kind === "start" ? (
                                <>
                                  <span className="flex-none tabular-nums text-[9px] opacity-70">
                                    {startLabel}
                                  </span>
                                  <span
                                    className={`truncate text-[10px] font-medium ${isSkipped ? "line-through" : ""}`}
                                  >
                                    {task.task_name}
                                  </span>
                                  {task.task_type ? (
                                    <span className="ml-auto flex-none truncate text-[8px] tracking-wider opacity-80">
                                      {task.task_type.toUpperCase()}
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="ml-auto tabular-nums text-[9px] opacity-70">
                                  종료 {endLabel}
                                </span>
                              )}
                            </button>
                          );
                        }),
                      )}
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


          {/* ── TASK LIST (상세/삭제) ───────────────────── */}
          <div className="border border-border">
            {tasks.map((task) => {
              const actualDuration =
                task.actual_started_at && task.completed_at
                  ? minutesBetween(task.actual_started_at, task.completed_at)
                  : null;
              const linkedIngredients = taskIngredients?.[task.id] ?? [];


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
                    {(taskPredecessors?.[task.id]?.length ?? 0) > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        이전 단계: {taskPredecessors![task.id]!.map((p) => p.name).join(" + ")}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] tracking-wider text-foreground">
                      <input
                        type="time"
                        className="h-6 w-20 border border-border bg-background px-1 text-[11px] tabular-nums"
                        defaultValue={toTimeValue(task.actual_started_at)}
                        onBlur={(e) => setTaskStart(task, e.target.value)}
                      />
                      <span className="text-muted-foreground">→</span>
                      <input
                        type="time"
                        className="h-6 w-20 border border-border bg-background px-1 text-[11px] tabular-nums"
                        defaultValue={toTimeValue(task.completed_at)}
                        onBlur={(e) => setTaskEnd(task, e.target.value)}
                      />
                      {actualDuration !== null ? (
                        <span className="text-muted-foreground">· {Math.round(actualDuration)} MIN</span>
                      ) : null}
                    </div>
                    {hasObservationFields(task.task_type) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] tracking-wider text-foreground">
                        <span className="text-muted-foreground">관찰</span>
                        <input
                          type="text"
                          placeholder="상태"
                          className="h-6 w-16 border border-border bg-background px-1 text-[11px]"
                          defaultValue={task.observation_status ?? ""}
                          onBlur={(e) =>
                            setObservationField(task, { observation_status: e.target.value.trim() || null })
                          }
                        />
                        <input
                          type="number"
                          placeholder="시작mm"
                          className="h-6 w-14 border border-border bg-background px-1 text-[11px] tabular-nums"
                          defaultValue={task.observation_height_start_mm ?? ""}
                          onBlur={(e) =>
                            setObservationField(task, {
                              observation_height_start_mm: e.target.value.trim() ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <span className="text-muted-foreground">→</span>
                        <input
                          type="number"
                          placeholder="중간mm"
                          className="h-6 w-14 border border-border bg-background px-1 text-[11px] tabular-nums"
                          defaultValue={task.observation_height_mid_mm ?? ""}
                          onBlur={(e) =>
                            setObservationField(task, {
                              observation_height_mid_mm: e.target.value.trim() ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <span className="text-muted-foreground">→</span>
                        <input
                          type="number"
                          placeholder="끝mm"
                          className="h-6 w-14 border border-border bg-background px-1 text-[11px] tabular-nums"
                          defaultValue={task.observation_height_end_mm ?? ""}
                          onBlur={(e) =>
                            setObservationField(task, {
                              observation_height_end_mm: e.target.value.trim() ? Number(e.target.value) : null,
                            })
                          }
                        />
                        <input
                          type="number"
                          placeholder="°C"
                          className="h-6 w-14 border border-border bg-background px-1 text-[11px] tabular-nums"
                          defaultValue={task.observation_temperature_c ?? ""}
                          onBlur={(e) =>
                            setObservationField(task, {
                              observation_temperature_c: e.target.value.trim() ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                    )}
                    {task.checklist_items != null && (task.checklist_items as unknown as ChecklistItem[]).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {(task.checklist_items as unknown as ChecklistItem[]).map((item, idx) => (
                          <label key={idx} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => toggleChecklistItem(task, idx)}
                            />
                            <span className={item.done ? "line-through" : ""}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const phase = phaseOf(task);
                      if (phase === "LOCKED") {
                        return (
                          <span className="label-caps px-2 text-xs text-muted-foreground">
                            {TASK_PHASE_ICON.LOCKED} {TASK_PHASE_LABEL.LOCKED}
                          </span>
                        );
                      }
                      if (phase === "READY") {
                        return (
                          <>
                            <button
                              type="button"
                              className={`${primaryButtonClass} min-h-12`}
                              onClick={() => startTask(task)}
                            >
                              {hasTimerField(task.task_type) ? "START TIMER" : "▶ START"}
                            </button>
                            <button
                              type="button"
                              className={`${buttonClass} min-h-12`}
                              onClick={() => skipTask(task)}
                            >
                              SKIP
                            </button>
                          </>
                        );
                      }
                      if (phase === "ACTIVE") {
                        const elapsedSec = task.actual_started_at
                          ? (now.getTime() - new Date(task.actual_started_at).getTime()) / 1000
                          : 0;
                        const timerMin = task.timer_minutes;
                        const remainSec = timerMin != null ? timerMin * 60 - elapsedSec : null;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs tabular-nums text-foreground">
                              {timerMin != null
                                ? remainSec !== null && remainSec > 0
                                  ? `남은 ${formatDuration(remainSec)}`
                                  : `+${formatDuration(Math.abs(remainSec ?? 0))}`
                                : formatDuration(elapsedSec)}
                            </span>
                            <button
                              type="button"
                              className={`${primaryButtonClass} min-h-12`}
                              onClick={() => completeTask(task)}
                            >
                              ■ COMPLETE
                            </button>
                          </div>
                        );
                      }
                      // DONE / SKIPPED
                      return (
                        <>
                          <span className="label-caps px-2 text-xs text-foreground">
                            {TASK_PHASE_ICON[phase]} {TASK_PHASE_LABEL[phase]}
                          </span>
                          <button
                            type="button"
                            className={`${buttonClass} min-h-12`}
                            onClick={() => resetTask(task)}
                          >
                            되돌리기
                          </button>
                        </>
                      );
                    })()}
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

      {focusColumnKey &&
        (() => {
          const colTasks = tasks
            .filter((t) => (t.formula_version_id ?? GENERAL_KEY) === focusColumnKey)
            .sort((a, b) => a.sort_order - b.sort_order);
          const doneCount = colTasks.filter(
            (t) => t.status === "DONE" || t.status === "SKIPPED",
          ).length;
          const current = colTasks.find((t) => t.status !== "DONE" && t.status !== "SKIPPED");
          const label = columnLabelOf(focusColumnKey === GENERAL_KEY ? null : focusColumnKey);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
              <div className="w-full max-w-md border-2 border-foreground bg-background p-6 text-center">
                <button
                  type="button"
                  className="mb-4 ml-auto block text-xs tracking-wider text-muted-foreground hover:text-foreground"
                  onClick={() => setFocusColumnKey(null)}
                >
                  ✕ 닫기
                </button>
                <div className="label-caps text-xs text-muted-foreground">{label}</div>
                {!current ? (
                  <p className="mt-6 text-sm text-muted-foreground">모든 TASK가 끝났습니다 🎉</p>
                ) : (
                  <>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      TASK {doneCount + 1} / {colTasks.length}
                    </div>
                    <div className="mt-3 text-2xl font-medium uppercase text-foreground">
                      {current.task_name}
                    </div>
                    {current.task_type && (
                      <span
                        className={`mt-2 inline-block rounded-sm border px-2 py-0.5 text-[10px] tracking-wider ${taskTypeColorClass(current.task_type, colorOverrides)}`}
                      >
                        {current.task_type.toUpperCase()}
                      </span>
                    )}
                    {(() => {
                      const phase = phaseOf(current);
                      if (phase === "LOCKED") {
                        const predNames = (taskPredecessors?.[current.id] ?? [])
                          .filter(
                            (p) =>
                              tasksById.get(p.taskId)?.status !== "DONE" &&
                              tasksById.get(p.taskId)?.status !== "SKIPPED",
                          )
                          .map((p) => p.name);
                        return (
                          <p className="mt-6 text-xs text-muted-foreground">
                            {TASK_PHASE_ICON.LOCKED} 선행 대기: {predNames.join(" + ")}
                          </p>
                        );
                      }
                      if (phase === "READY") {
                        return (
                          <button
                            type="button"
                            className={`${primaryButtonClass} mt-6 min-h-14 w-full text-base`}
                            onClick={() => startTask(current)}
                          >
                            {hasTimerField(current.task_type) ? "START TIMER" : "START"}
                          </button>
                        );
                      }
                      if (phase === "ACTIVE") {
                        const elapsedSec = current.actual_started_at
                          ? (now.getTime() - new Date(current.actual_started_at).getTime()) / 1000
                          : 0;
                        return (
                          <>
                            <div className="mt-4 font-mono text-3xl tabular-nums text-foreground">
                              {formatDuration(elapsedSec)}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              시작 {formatTime(current.actual_started_at!)}
                            </p>
                            <button
                              type="button"
                              className={`${primaryButtonClass} mt-6 min-h-14 w-full text-base`}
                              onClick={() => completeTask(current)}
                            >
                              COMPLETE &amp; NEXT
                            </button>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
                <p className="mt-6 text-[10px] text-muted-foreground">
                  COMPLETE는 이 품목의 다음 TASK를 READY로만 바꿉니다 — 자동으로 START하지 않아요.
                </p>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
