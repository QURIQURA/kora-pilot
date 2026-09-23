/**
 * WORKFLOW TIMELINE — Work Session의 Task 진행 뷰
 *
 * 절대 규칙 (src/lib/workflow.ts와 동일):
 * - "계획(planned_start_at/planned_end_at)" 개념은 폐기했다(2026-09-23) — 타임라인은 오직 실제
 *   시작/완료 시각(actual_started_at/completed_at)만 쓴다. 아직 시작 전인 TASK는 타임라인이 아니라
 *   "TASK 순서" 목록(위/아래로 재정렬 가능)에만 보인다.
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
  techniqueCategoriesQuery,
  workflowTemplatesByTechniqueQuery,
  type VersionIngredientRow,
} from "@/lib/queries";
import { leafTechniques } from "@/lib/technique";
import { localDateTimeToISO, toLocalDateString, formatTime } from "@/lib/datetime";
import {
  assignTimelineLanes,
  computeTimelineRange,
  hasObservationFields,
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
}) {
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("");
  const [formulaVersionId, setFormulaVersionId] = useState("");
  const [ingredientLineIds, setIngredientLineIds] = useState<string[]>([]);
  const [predecessorTaskIds, setPredecessorTaskIds] = useState<string[]>([]);
  // 관찰값(2026-09-23) — 지금은 BAKE에서만 쓰지만 hasObservationFields()로 대상 TASK TYPE을 넓힐 수 있다.
  const [obsStatus, setObsStatus] = useState("");
  const [obsHeightStart, setObsHeightStart] = useState("");
  const [obsHeightMid, setObsHeightMid] = useState("");
  const [obsHeightEnd, setObsHeightEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    taskType: string;
    formulaVersionId: string;
    /** 실제 시작/완료 시각 — 타임스탬프 버튼 누르는 걸 깜빡했을 때 수동으로 고칠 수 있게(2026-09-24) */
    actualDay: string;
    actualStartTime: string;
    actualEndTime: string;
    ingredientLineIds: string[];
    predecessorTaskIds: string[];
    obsStatus: string;
    obsHeightStart: string;
    obsHeightMid: string;
    obsHeightEnd: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);
  const queryClient = useQueryClient();

  const taskTypeColors = useQuery(taskTypeColorsQuery());

  // 제작방법(TECHNIQUE CATEGORY) 기준 WORKFLOW 템플릿 불러오기(2026-09-23) — 매번 같은 TASK를
  // 손으로 다시 입력하지 않도록, SETTINGS에서 미리 등록해둔 템플릿을 골라 한 번에 깔아준다.
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templateTechniqueId, setTemplateTechniqueId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const techniques = useQuery(techniqueCategoriesQuery());
  const templatesForTechnique = useQuery(workflowTemplatesByTechniqueQuery(templateTechniqueId || null));

  async function applyTemplate() {
    if (!templateId) return;
    setApplyingTemplate(true);
    setTemplateError(null);
    const userId = await currentUserId();
    const { data: templateTasks, error: e1 } = await supabase
      .from("workflow_template_tasks")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order");
    if (e1 || !templateTasks) {
      setApplyingTemplate(false);
      setTemplateError(`템플릿 TASK 조회 실패 — ${e1?.message ?? "unknown error"}`);
      return;
    }
    if (templateTasks.length === 0) {
      setApplyingTemplate(false);
      setTemplateError("이 템플릿에 TASK가 없습니다 — SETTINGS에서 먼저 TASK를 등록하세요.");
      return;
    }
    const { data: predRows, error: e2 } = await supabase
      .from("workflow_template_task_predecessors")
      .select("task_id, predecessor_task_id")
      .eq("template_id", templateId);
    if (e2) {
      setApplyingTemplate(false);
      setTemplateError(`템플릿 선행관계 조회 실패 — ${e2.message}`);
      return;
    }
    const maxSort = tasks.reduce((acc, t) => Math.max(acc, t.sort_order), 0);
    const { data: insertedRows, error: e3 } = await supabase
      .from("work_session_tasks")
      .insert(
        templateTasks.map((t, idx) => ({
          work_session_id: sessionId,
          user_id: userId,
          task_name: t.task_name,
          task_type: t.task_type,
          sort_order: maxSort + 1 + idx,
        })),
      )
      .select("id");
    if (e3 || !insertedRows) {
      setApplyingTemplate(false);
      setTemplateError(`TASK 생성 실패 — ${e3?.message ?? "unknown error"}`);
      return;
    }
    const idMap = new Map<string, string>();
    templateTasks.forEach((t, idx) => idMap.set(t.id, insertedRows[idx]!.id));
    const predInserts = (predRows ?? [])
      .filter((r) => idMap.has(r.task_id) && idMap.has(r.predecessor_task_id))
      .map((r) => ({
        user_id: userId,
        work_session_id: sessionId,
        task_id: idMap.get(r.task_id)!,
        predecessor_task_id: idMap.get(r.predecessor_task_id)!,
      }));
    if (predInserts.length > 0) {
      const { error: e4 } = await supabase.from("work_session_task_predecessors").insert(predInserts);
      if (e4) {
        setApplyingTemplate(false);
        setTemplateError(`선행관계 생성 실패 — ${e4.message}`);
        await onTasksChanged();
        return;
      }
    }
    setApplyingTemplate(false);
    setTemplatePanelOpen(false);
    setTemplateTechniqueId("");
    setTemplateId("");
    await onTasksChanged();
  }
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

  // "계획" 개념이 없어졌으므로(2026-09-23) 실제로 시작한(actual_started_at) TASK만 타임라인에
  // 올린다 — 여러 품목이 동시에 돌아갈 때 실제 시간축 기준으로 무엇이 진행 중인지 보여주는 것이
  // 이 타임라인의 목적이다.
  const scheduledByColumn = useMemo(() => {
    const map = new Map<string, WorkSessionTask[]>();
    for (const t of tasks) {
      if (!t.actual_started_at) continue;
      const key = t.formula_version_id ?? GENERAL_KEY;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  // "TASK 순서"는 아직 실제로 시작하지 않은 TASK 목록 — 시간을 미리 정하지 않고도 위/아래로
  // 순서를 조정해 작업할 순서를 미리 그려볼 수 있다(2026-09-23). sort_order 순으로 표시하며,
  // 실제로 시작하면(타임스탬프가 찍히면) 이 목록에서 빠지고 타임라인 쪽으로 넘어간다.
  const unscheduled = useMemo(() => tasks.filter((t) => !t.actual_started_at), [tasks]);

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
    const inProgress = tasks.find((t) => t.status === "IN_PROGRESS" && t.actual_started_at);
    const anchorMinute = inProgress?.actual_started_at
      ? minutesFromDayStart(inProgress.actual_started_at, range.dayStr)
      : (nowTop ?? 0) / PX_PER_MINUTE + range.startMinute;
    const top = Math.max(0, (anchorMinute - range.startMinute) * PX_PER_MINUTE - ROW_HEIGHT * 2);
    scrollRef.current.scrollTop = top;
  }, [tasks, range, nowTop]);

  const showObservationFields = hasObservationFields(taskType);

  async function addTask() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("TASK NAME IS REQUIRED");
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
        sort_order: maxSort + 1,
        observation_status: showObservationFields && obsStatus.trim() ? obsStatus.trim() : null,
        observation_height_start_mm:
          showObservationFields && obsHeightStart.trim() ? Number(obsHeightStart) : null,
        observation_height_mid_mm:
          showObservationFields && obsHeightMid.trim() ? Number(obsHeightMid) : null,
        observation_height_end_mm:
          showObservationFields && obsHeightEnd.trim() ? Number(obsHeightEnd) : null,
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
    if (predecessorTaskIds.length > 0) {
      const { error: predecessorError } = await supabase
        .from("work_session_task_predecessors")
        .insert(
          predecessorTaskIds.map((predecessorTaskId) => ({
            user_id: userId,
            work_session_id: sessionId,
            task_id: inserted.id,
            predecessor_task_id: predecessorTaskId,
          })),
        );
      if (predecessorError) {
        setSaving(false);
        setError(`선행 TASK 저장 실패 — ${predecessorError.message}`);
        await onTasksChanged();
        return;
      }
    }
    setSaving(false);
    setName("");
    setTaskType("");
    setObsStatus("");
    setObsHeightStart("");
    setObsHeightMid("");
    setObsHeightEnd("");
    setIngredientLineIds([]);
    setPredecessorTaskIds([]);
    await onTasksChanged();
  }

  /**
   * "TASK 순서" 목록(아직 실제로 시작하지 않은 TASK) 안에서 위/아래로 순서를 바꾼다(2026-09-23).
   * sort_order 값을 서로 맞바꿔서 저장 — 실제 시간이 없어도 이 순서가 작업할 순서를 미리 그려보는
   * 용도로 쓰인다. 목록에 없는 이웃(범위 밖)이면 아무 것도 하지 않는다.
   */
  async function moveUnscheduledTask(task: WorkSessionTask, direction: -1 | 1) {
    const idx = unscheduled.findIndex((t) => t.id === task.id);
    const neighbor = unscheduled[idx + direction];
    if (idx < 0 || !neighbor) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from("work_session_tasks")
        .update({ sort_order: neighbor.sort_order })
        .eq("id", task.id),
      supabase
        .from("work_session_tasks")
        .update({ sort_order: task.sort_order })
        .eq("id", neighbor.id),
    ]);
    if (e1 || e2) setError(`순서 변경 실패 — ${(e1 ?? e2)?.message}`);
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
      actualDay: task.actual_started_at
        ? toLocalDateString(new Date(task.actual_started_at))
        : task.completed_at
          ? toLocalDateString(new Date(task.completed_at))
          : toLocalDateString(),
      actualStartTime: task.actual_started_at ? formatTime(task.actual_started_at) : "",
      actualEndTime: task.completed_at ? formatTime(task.completed_at) : "",
      ingredientLineIds: (taskIngredients?.[task.id] ?? []).map((l) => l.lineId),
      predecessorTaskIds: (taskPredecessors?.[task.id] ?? []).map((p) => p.taskId),
      obsStatus: task.observation_status ?? "",
      obsHeightStart: task.observation_height_start_mm != null ? String(task.observation_height_start_mm) : "",
      obsHeightMid: task.observation_height_mid_mm != null ? String(task.observation_height_mid_mm) : "",
      obsHeightEnd: task.observation_height_end_mm != null ? String(task.observation_height_end_mm) : "",
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
        // 타임스탬프 버튼 누르는 걸 깜빡한 경우를 위한 수동 보정(2026-09-24) — 상태 버튼과 별개로
        // 여기서 직접 실제 시작/완료 시각을 쓰거나 비울 수 있다.
        actual_started_at: editDraft.actualStartTime
          ? localDateTimeToISO(editDraft.actualDay, editDraft.actualStartTime)
          : null,
        completed_at: editDraft.actualEndTime
          ? localDateTimeToISO(editDraft.actualDay, editDraft.actualEndTime)
          : null,
        observation_status: hasObservationFields(editDraft.taskType) && editDraft.obsStatus.trim()
          ? editDraft.obsStatus.trim()
          : null,
        observation_height_start_mm:
          hasObservationFields(editDraft.taskType) && editDraft.obsHeightStart.trim()
            ? Number(editDraft.obsHeightStart)
            : null,
        observation_height_mid_mm:
          hasObservationFields(editDraft.taskType) && editDraft.obsHeightMid.trim()
            ? Number(editDraft.obsHeightMid)
            : null,
        observation_height_end_mm:
          hasObservationFields(editDraft.taskType) && editDraft.obsHeightEnd.trim()
            ? Number(editDraft.obsHeightEnd)
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
    // 선행 TASK도 재료 그룹과 같은 방식(전체 삭제 후 재삽입)으로 다시 쓴다
    const { error: clearPredecessorsError } = await supabase
      .from("work_session_task_predecessors")
      .delete()
      .eq("task_id", taskId);
    if (clearPredecessorsError) {
      setEditSaving(false);
      setEditError(`선행 TASK 저장 실패 — ${clearPredecessorsError.message}`);
      await onTasksChanged();
      return;
    }
    if (editDraft.predecessorTaskIds.length > 0) {
      const { error: predecessorError } = await supabase
        .from("work_session_task_predecessors")
        .insert(
          editDraft.predecessorTaskIds.map((predecessorTaskId) => ({
            user_id: userId,
            work_session_id: sessionId,
            task_id: taskId,
            predecessor_task_id: predecessorTaskId,
          })),
        );
      if (predecessorError) {
        setEditSaving(false);
        setEditError(`선행 TASK 저장 실패 — ${predecessorError.message}`);
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
      {/* ── 템플릿 불러오기 ─────────────────────────────── */}
      <div className="border border-border p-3">
        <button
          type="button"
          className="text-xs tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setTemplatePanelOpen((v) => !v)}
        >
          {templatePanelOpen ? "▾" : "▸"} 템플릿 불러오기 (제작방법별 표준 TASK 순서)
        </button>
        {templatePanelOpen && (
          <div className="mt-2 flex flex-col gap-2 border-t border-dashed border-border pt-2 md:flex-row md:flex-wrap md:items-center">
            <select
              className={`${selectClass} md:w-56`}
              value={templateTechniqueId}
              onChange={(e) => {
                setTemplateTechniqueId(e.target.value);
                setTemplateId("");
              }}
            >
              <option value="">제작방법 선택…</option>
              {leafTechniques(techniques.data ?? []).map(({ category }) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className={`${selectClass} md:w-56`}
              value={templateId}
              disabled={!templateTechniqueId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">템플릿 선택…</option>
              {(templatesForTechnique.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`${primaryButtonClass} min-h-12`}
              disabled={!templateId || applyingTemplate}
              onClick={applyTemplate}
            >
              {applyingTemplate ? "적용 중..." : "이 템플릿 적용"}
            </button>
            {templateTechniqueId && (templatesForTechnique.data ?? []).length === 0 && (
              <p className="font-mono text-xs uppercase text-muted-foreground">
                이 제작방법에 등록된 템플릿이 없습니다 — SETTINGS→WORKFLOW TEMPLATES에서 만드세요.
              </p>
            )}
            {templateError && <p className="text-xs text-destructive">{templateError}</p>}
          </div>
        )}
      </div>

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
          <button
            type="button"
            className={`${primaryButtonClass} min-h-12`}
            disabled={saving}
            onClick={addTask}
          >
            {saving ? "ADDING..." : "ADD"}
          </button>
        </div>
        {showObservationFields && (
          <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
            <div className="text-[10px] tracking-wider text-muted-foreground">
              관찰값(선택) — 나중에 데이터로 모아 시각화할 예정
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              <input
                className={`${inputClass} md:w-56`}
                placeholder="상태(예: 고르게 부풀음)"
                value={obsStatus}
                onChange={(e) => setObsStatus(e.target.value)}
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                오븐투입시 높이
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={`${inputClass} w-24`}
                  placeholder="mm"
                  value={obsHeightStart}
                  onChange={(e) => setObsHeightStart(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                중간높이
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={`${inputClass} w-24`}
                  placeholder="mm"
                  value={obsHeightMid}
                  onChange={(e) => setObsHeightMid(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                최종높이
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={`${inputClass} w-24`}
                  placeholder="mm"
                  value={obsHeightEnd}
                  onChange={(e) => setObsHeightEnd(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
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
        {tasks.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
            <div className="text-[10px] tracking-wider text-muted-foreground">
              선행 TASK(선택, 여러 개 가능 — 예: Yolk mixture + Meringue → 이 TASK)
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {tasks.map((t) => {
                const checked = predecessorTaskIds.includes(t.id);
                return (
                  <label key={t.id} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setPredecessorTaskIds((prev) =>
                          e.target.checked
                            ? [...prev, t.id]
                            : prev.filter((id) => id !== t.id),
                        );
                      }}
                    />
                    {t.task_name}
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
                      {/* 레인별 연결선(rail) — TASK TYPE 색, 시작~종료 구간을 차지 */}
                      {positioned.map(({ task, pos }) => {
                        const lane = laneOf.get(task.id) ?? 0;
                        const railEnd = railEndByTask.get(task.id) ?? pos.top + pos.height;
                        return (
                          <div
                            key={`rail-${task.id}`}
                            className={`pointer-events-none absolute opacity-80 ${taskTypeLineColorClass(task.task_type, colorOverrides)} ${
                              task.status === "SKIPPED" ? "opacity-30" : ""
                            }`}
                            style={{ top: pos.top, height: railEnd - pos.top, left: lane * RAIL_W, width: RAIL_W - 2 }}
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
                              onClick={() => cycleStatus(task)}
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
                              title={task.task_name}
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

          {unscheduled.length > 0 && (
            <div className="border border-border p-3">
              <div className="mb-2 text-xs tracking-wider text-muted-foreground">
                TASK 순서 (아직 시작 전 — ▲▼로 작업할 순서를 미리 그려보세요)
              </div>
              <ul className="divide-y divide-border border border-border">
                {unscheduled.map((task, idx) => (
                  <li key={task.id} className="flex items-center gap-2 px-2 py-1.5">
                    <div className="flex flex-none flex-col">
                      <button
                        type="button"
                        className="px-1.5 py-0.5 text-xs disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => moveUnscheduledTask(task, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 text-xs disabled:opacity-30"
                        disabled={idx === unscheduled.length - 1}
                        onClick={() => moveUnscheduledTask(task, 1)}
                      >
                        ▼
                      </button>
                    </div>
                    <span className="w-5 flex-none font-mono text-[10px] text-muted-foreground">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleStatus(task)}
                      className={`${buttonClass} flex flex-1 items-center gap-1.5 text-left text-xs`}
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
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── TASK LIST (상세/삭제) ───────────────────── */}
          <div className="border border-border">
            {tasks.map((task) => {
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
                    {hasObservationFields(editDraft.taskType) && (
                      <div className="mt-2 flex flex-col gap-2 border-t border-dashed border-border pt-2 md:flex-row md:flex-wrap md:items-center">
                        <span className="text-[10px] tracking-wider text-muted-foreground">
                          관찰값(선택)
                        </span>
                        <input
                          className={`${inputClass} md:w-56`}
                          placeholder="상태"
                          value={editDraft.obsStatus}
                          onChange={(e) => setEditDraft({ ...editDraft, obsStatus: e.target.value })}
                        />
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          오븐투입시
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            className={`${inputClass} w-24`}
                            placeholder="mm"
                            value={editDraft.obsHeightStart}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, obsHeightStart: e.target.value })
                            }
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          중간
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            className={`${inputClass} w-24`}
                            placeholder="mm"
                            value={editDraft.obsHeightMid}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, obsHeightMid: e.target.value })
                            }
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          최종
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            className={`${inputClass} w-24`}
                            placeholder="mm"
                            value={editDraft.obsHeightEnd}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, obsHeightEnd: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    )}
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
                    {tasks.length > 1 && (
                      <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2">
                        <div className="text-[10px] tracking-wider text-muted-foreground">
                          선행 TASK(선택, 여러 개 가능)
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {tasks
                            .filter((t) => t.id !== task.id)
                            .map((t) => {
                              const checked = editDraft.predecessorTaskIds.includes(t.id);
                              return (
                                <label key={t.id} className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        predecessorTaskIds: e.target.checked
                                          ? [...editDraft.predecessorTaskIds, t.id]
                                          : editDraft.predecessorTaskIds.filter((id) => id !== t.id),
                                      })
                                    }
                                  />
                                  {t.task_name}
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
                    {(taskPredecessors?.[task.id]?.length ?? 0) > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        이전 단계: {taskPredecessors![task.id]!.map((p) => p.name).join(" + ")}
                      </div>
                    )}
                    {(task.actual_started_at || task.completed_at) && (
                      <div className="mt-1 text-[11px] tracking-wider text-foreground tabular-nums">
                        실제 {task.actual_started_at ? formatTime(task.actual_started_at) : "--:--"}
                        {" → "}
                        {task.completed_at ? formatTime(task.completed_at) : "--:--"}
                        {actualDuration !== null ? ` · ${Math.round(actualDuration)} MIN` : ""}
                      </div>
                    )}
                    {(task.observation_status ||
                      task.observation_height_start_mm != null ||
                      task.observation_height_mid_mm != null ||
                      task.observation_height_end_mm != null) && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        관찰
                        {task.observation_status ? ` ${task.observation_status}` : ""}
                        {" · "}
                        {task.observation_height_start_mm ?? "-"}mm → {task.observation_height_mid_mm ?? "-"}mm
                        → {task.observation_height_end_mm ?? "-"}mm
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
