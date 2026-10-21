import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  currentUserId,
  formulasQuery,
  mouldsQuery,
  productsQuery,
  productSizesQuery,
  productComponentsQuery,
  techniqueCategoriesQuery,
  versionIngredientsBulkQuery,
  versionIngredientsQuery,
  workSessionFormulaVersionsQuery,
  workSessionMultiplierHistoryQuery,
  workSessionProgressQuery,
  workSessionQuery,
  workSessionTaskIngredientsQuery,
  workSessionTaskPredecessorsQuery,
  workSessionTasksQuery,
  CORE_SLOTS,
  CORE_SLOT_LABELS,
  type CoreSlot,
  type VersionIngredientRow,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { resolveSlotGroup } from "@/lib/technique";
import { fmtNumber, toGrams, versionLabel, UNITS, type Mould } from "@/lib/formula";
import { formatProductSizeLabel } from "@/lib/product-size";
import { mouldBatchMultiplier } from "@/lib/formula-calc";
import { MouldSelect } from "@/components/pilot/MouldSelect";
import { IngredientPicker } from "@/components/pilot/IngredientPicker";
import { formatDateTime } from "@/lib/datetime";
import {
  buildMultiplierSnapshot,
  buildWeighingGroups,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  workingAmount,
  sumBaseGrams,
  suggestedMultiplierFromTarget,
  syncWorkSessionToPlanner,
  type WorkSessionProgressStatus,
} from "@/lib/work-session";
import { WorkflowView } from "@/components/pilot/WorkflowTimeline";
import { adjustStock, STOCK_REASON_LABEL, type StockReason } from "@/lib/stock";
import { applyDefaultWorkflowForFormulaVersion } from "@/lib/workflow-template";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

const NEXT_ACTIONS: Record<string, { label: string; nextStatus: string }[]> = {
  PLANNED: [{ label: "START WORK", nextStatus: "IN_PROGRESS" }],
  IN_PROGRESS: [
    { label: "PAUSE", nextStatus: "PAUSED" },
    { label: "COMPLETE", nextStatus: "COMPLETED" },
  ],
  PAUSED: [
    { label: "RESUME", nextStatus: "IN_PROGRESS" },
    { label: "CANCEL", nextStatus: "CANCELLED" },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

/** 세션 하나의 작업 화면(코어/데코/계량/워크플로/노트). 세션 상세 페이지와 PRODUCTION DASHBOARD의
 * 타임라인 아래 박스들이 같이 쓴다. embedded=true면 페이지 전용 요소(브레드크럼, 작업일정 박스)를 숨긴다. */
export function WorkSessionWorkspace({
  sessionId,
  embedded = false,
}: {
  sessionId: string;
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();

  const session = useQuery(workSessionQuery(sessionId));
  const selections = useQuery(workSessionFormulaVersionsQuery(sessionId));
  const versionIds = useMemo(
    () => (selections.data ?? []).map((s) => s.formula_version_id),
    [selections.data],
  );
  const ingredients = useQuery(versionIngredientsBulkQuery(versionIds));
  const progress = useQuery(workSessionProgressQuery(sessionId));
  const tasks = useQuery(workSessionTasksQuery(sessionId));
  const taskIngredients = useQuery(workSessionTaskIngredientsQuery(sessionId));
  const taskPredecessors = useQuery(workSessionTaskPredecessorsQuery(sessionId));

  const [viewMode, setViewMode] = useState<"WEIGHING" | "FORMULA">("WEIGHING");
  const [adding, setAdding] = useState(false);
  // 2026-10-06: CORE(Sheet/Cream/Filling) 슬롯은 한 번에 하나씩만 추가 폼을 열 수 있게 슬롯별 상태로 관리
  const [addingSlot, setAddingSlot] = useState<CoreSlot | null>(null);
  // 2026-10-14 사용자 요청: WEIGHING MATRIX에서 포뮬라 열별로 "EDIT" 버튼을 눌러 포뮬라 페이지로
  // 이동하지 않고도 재료량을 조정/추가한 뒤 새 버전으로 저장할 수 있게 한다 — 열(선택) 하나를
  // 가리키는 WeighingColumn을 담아두면 모달이 뜬다.
  const [editingColumn, setEditingColumn] = useState<WeighingColumn | null>(null);

  useSetBreadcrumb(
    embedded
      ? null
      : [
          { label: "PILOT", path: "/" },
          { label: "PRODUCTION", path: "/production" },
          { label: (session.data?.name ?? "…").toUpperCase() },
        ],
  );

  // 2026-10-20 사용자 요청으로 "단독 TASK" 생성 방식은 제거했었고(ORDER가 CONFIRMED될 때 만드는
  // WANN 프로젝트와 별개로 떠서 중복이 쌓이는 문제), 대신 이 WORK SESSION이 연결된 ORDER의 WANN
  // 프로젝트 하위에 CORE ELEMENT(SHEET/CREAM/FILLING)별로 TASK를 생성하는 방식으로 재설계했다
  // ("시트/크림을 task 이름으로 해서 생성"). ORDER에 연결 안 된 세션이거나 그 ORDER에 아직 WANN
  // 프로젝트가 없으면(CONFIRMED 전환 전) 아무것도 만들지 않는다 — Edge Function이 조건을 직접
  // 체크해서 알아서 skip/정리한다. 실패해도 조용히 무시(네트워크 문제로 WORK SESSION 저장 자체가
  // 막히면 안 됨).
  const syncPlanner = () => syncWorkSessionToPlanner(sessionId);

  const invalidateSession = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    await queryClient.invalidateQueries({ queryKey: ["work_sessions", sessionId] });
  };
  const invalidateSelections = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["work_session_formula_versions", sessionId],
    });
    // 대시보드 작업 대기공간도 컴포넌트 추가/삭제를 바로 반영
    await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
  };
  const invalidateProgress = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_session_progress", sessionId] });
  };
  const invalidateTasks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_session_tasks", sessionId] });
    await queryClient.invalidateQueries({
      queryKey: ["work_session_task_ingredients", sessionId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["work_session_task_predecessors", sessionId],
    });
  };

  const updateSession = useMutation({
    mutationFn: async (patch: TablesUpdate<"work_sessions">) => {
      const { error } = await supabase.from("work_sessions").update(patch).eq("id", sessionId);
      if (error) throw error;
      return patch;
    },
    onSuccess: async (patch) => {
      await invalidateSession();
      // 작업일정(날짜/시간)이 바뀐 경우에만 Planner 재동기화 — 다른 필드(상태 전환 등) 변경 시
      // 불필요한 호출을 피한다.
      if (
        "scheduled_date" in patch ||
        "scheduled_start_time" in patch ||
        "scheduled_end_time" in patch
      ) {
        await syncPlanner();
      }
    },
  });

  const setStatus = (nextStatus: string) => {
    const patch: TablesUpdate<"work_sessions"> = { status: nextStatus };
    if (nextStatus === "IN_PROGRESS" && !session.data?.started_at) {
      patch.started_at = new Date().toISOString();
    }
    if (nextStatus === "COMPLETED") {
      patch.completed_at = new Date().toISOString();
    }
    updateSession.mutate(patch);
  };

  /** START WORK를 깜빡 안 눌러도, WORKFLOW에서 TASK 하나라도 시작시각이 기록되면 그 시각으로
   * 세션을 자동으로 IN_PROGRESS 전환한다(2026-09-30) — PLANNED 상태일 때만 동작, 이미
   * 시작/일시정지/완료/취소된 세션은 건드리지 않는다. */
  const ensureSessionStartedAt = (iso: string) => {
    if (session.data?.status === "PLANNED") {
      updateSession.mutate({ status: "IN_PROGRESS", started_at: iso });
    }
  };

  const rows = useMemo(() => selections.data ?? [], [selections.data]);

  const removeFormulaVersion = useMutation({
    mutationFn: async (row: WorkSessionFormulaVersionRow) => {
      // 계량 진행상태는 이제 "이 선택(work_session_formula_versions 행)"에 직접 묶여 있으므로
      // (2026-10-07, 동일 포뮬라 중복 추가 허용) 이 행의 id로만 지우면 된다 — 같은 FORMULA
      // VERSION의 다른 선택(중복 추가본)이 있어도 그쪽 진행상태는 건드리지 않는다.
      const { error: progressError } = await supabase
        .from("work_session_progress")
        .delete()
        .eq("work_session_formula_version_id", row.id);
      if (progressError) throw progressError;

      // TASK는 formula_version_id로만 연결돼 선택 단위로 분리돼 있지 않다 — 같은 FORMULA
      // VERSION의 다른 선택이 이 세션에 남아있다면(중복 추가) 그 TASK는 여전히 유효하므로
      // 지우지 않는다.
      const hasSiblingSelection = rows.some(
        (r) => r.id !== row.id && r.formula_version_id === row.formula_version_id,
      );
      if (!hasSiblingSelection) {
        // work_session_task_ingredients/predecessors는 FK ON DELETE CASCADE라 같이 정리된다.
        const { error: tasksError } = await supabase
          .from("work_session_tasks")
          .delete()
          .eq("work_session_id", sessionId)
          .eq("formula_version_id", row.formula_version_id);
        if (tasksError) throw tasksError;
      }

      // 2026-10-22: 행을 지우면 그 행의 작업 블록(work_blocks)도 CASCADE로 사라지므로, 지우기 전에
      // 그 행/블록이 만든 플래너 TASK id를 모아서 동기화 함수에 넘겨 함께 정리한다.
      const plannerTaskIds: string[] = [];
      if (row.kind === "CORE") {
        if (row.planner_task_id) plannerTaskIds.push(row.planner_task_id);
        const { data: blockRows } = await supabase
          .from("work_blocks")
          .select("planner_task_id")
          .eq("work_session_formula_version_id", row.id);
        for (const b of blockRows ?? []) if (b.planner_task_id) plannerTaskIds.push(b.planner_task_id);
      }

      const { error } = await supabase
        .from("work_session_formula_versions")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      return plannerTaskIds;
    },
    onSuccess: async (plannerTaskIds, row) => {
      await invalidateSelections();
      await invalidateProgress();
      await invalidateTasks();
      // CORE(SHEET/CREAM/FILLING) 행을 지운 경우 Planner의 해당 TASK도 정리.
      if (row.kind === "CORE") {
        await syncWorkSessionToPlanner(sessionId, { deletePlannerTaskIds: plannerTaskIds });
      }
    },
  });

  const decorativeRows = useMemo(() => rows.filter((r) => r.kind !== "CORE"), [rows]);
  const ingredientsByVersion = useMemo(() => ingredients.data ?? {}, [ingredients.data]);
  // key: `${work_session_formula_version_id}:${formula_version_ingredient_id}` — 2026-10-07,
  // 같은 FORMULA VERSION이 두 번 이상 선택돼도 선택마다 독립된 진행상태를 갖도록 바뀌었다.
  const progressBySelectionAndLine = useMemo(() => {
    const map: Record<string, { status: string; note: string | null }> = {};
    for (const p of progress.data ?? []) {
      map[`${p.work_session_formula_version_id}:${p.formula_version_ingredient_id}`] = {
        status: p.status,
        note: p.note,
      };
    }
    return map;
  }, [progress.data]);

  const orderedSelections = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({
          selectionId: r.id,
          formulaVersionId: r.formula_version_id,
          formulaId: r.formula_versions.formulas.id,
          formulaName:
            r.formula_versions.formulas.components?.name ?? r.formula_versions.formulas.name,
          versionNumber: r.formula_versions.version_number,
          multiplier: Number(r.multiplier),
          sortOrder: r.sort_order,
        })),
    [rows],
  );

  const weighingGroups = useMemo(
    () =>
      buildWeighingGroups({
        selections: orderedSelections,
        ingredientsByVersion,
        progressBySelectionAndLine,
      }),
    [orderedSelections, ingredientsByVersion, progressBySelectionAndLine],
  );

  if (session.isLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }
  if (!session.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">WORK SESSION NOT FOUND</p>
    );
  }

  const data = session.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineName value={data.name} onSave={(name) => updateSession.mutate({ name })} />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            CREATED {formatDateTime(data.created_at)}
            {data.started_at ? ` · STARTED ${formatDateTime(data.started_at)}` : ""}
            {data.completed_at ? ` · COMPLETED ${formatDateTime(data.completed_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps border border-foreground bg-foreground px-3 py-1 text-background">
            {data.status}
          </span>
          {(NEXT_ACTIONS[data.status] ?? []).map((action) => (
            <button
              key={action.nextStatus}
              type="button"
              className={buttonClass}
              onClick={() => setStatus(action.nextStatus)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {!embedded && (
        <WorkScheduleSection
          scheduledDate={data.scheduled_date}
          scheduledStartTime={data.scheduled_start_time}
          scheduledEndTime={data.scheduled_end_time}
          onSave={(patch) => updateSession.mutate(patch)}
        />
      )}

      <ProductionEfficiencyLinkSection
        productId={data.product_id}
        productSizeId={data.product_size_id}
        targetUnitCount={data.target_unit_count}
        onSave={(patch) => updateSession.mutate(patch)}
      />

      {/* 2026-10-06 사용자 정정: Order에서 넘어온 CORE ELEMENT(Sheet/Cream/Filling 고정 슬롯)와
          자유롭게 추가하는 DECORATIVE를 구분해서 보여준다 — 새 테이블이 아니라 기존
          work_session_formula_versions 행에 kind/slot 태그만 붙여서 표현한다. */}
      <SectionCard title="CORE ELEMENTS — SHEET / CREAM / FILLING">
        <ul className="divide-y divide-border border border-border">
          {CORE_SLOTS.map((slot) => {
            // 2026-10-07: 같은 FORMULA VERSION 중복 추가를 허용하면서, 한 슬롯에 여러 개(예: 같은
            // 레시피를 다른 몰드/배치로 두 번)가 들어갈 수도 있게 됐다 — 하나만 찾지 않고 전부 보여준다.
            const slotRows = rows.filter((r) => r.kind === "CORE" && r.slot === slot);
            return (
              <li key={slot} className="p-3">
                <p className="label-caps mb-2 text-xs text-muted-foreground">
                  {CORE_SLOT_LABELS[slot]}
                </p>
                {slotRows.length > 0 && (
                  <ul className="mb-2 divide-y divide-border border border-border">
                    {slotRows.map((row) => (
                      <FormulaVersionRow
                        key={row.id}
                        row={row}
                        sessionId={sessionId}
                        lines={ingredientsByVersion[row.formula_version_id] ?? []}
                        onRemove={() => removeFormulaVersion.mutate(row)}
                      />
                    ))}
                  </ul>
                )}
                {addingSlot === slot ? (
                  <AddFormulaVersionForm
                    sessionId={sessionId}
                    nextSort={rows.length}
                    kind="CORE"
                    slot={slot}
                    productId={data.product_id}
                    productSizeId={data.product_size_id}
                    onDone={async () => {
                      setAddingSlot(null);
                      await invalidateSelections();
                      await invalidateTasks();
                      await syncPlanner();
                    }}
                  />
                ) : (
                  <button type="button" className={buttonClass} onClick={() => setAddingSlot(slot)}>
                    {`+ ADD ${CORE_SLOT_LABELS[slot].toUpperCase()}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="DECORATIVE ELEMENTS"
        action={
          <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
            {adding ? "CLOSE" : "+ ADD FORMULA VERSION"}
          </button>
        }
      >
        <div className="space-y-3">
          {adding && (
            <AddFormulaVersionForm
              sessionId={sessionId}
              nextSort={rows.length}
              productId={data.product_id}
              productSizeId={data.product_size_id}
              onDone={async () => {
                setAdding(false);
                await invalidateSelections();
                await invalidateTasks();
              }}
            />
          )}
          {decorativeRows.length === 0 ? (
            <p className="font-mono text-xs uppercase text-muted-foreground">
              NO FORMULA VERSIONS SELECTED YET
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {decorativeRows.map((row) => (
                <FormulaVersionRow
                  key={row.id}
                  row={row}
                  sessionId={sessionId}
                  lines={ingredientsByVersion[row.formula_version_id] ?? []}
                  onRemove={() => removeFormulaVersion.mutate(row)}
                />
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="WORK VIEW"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={viewMode === "WEIGHING" ? primaryButtonClass : buttonClass}
              onClick={() => setViewMode("WEIGHING")}
            >
              WEIGHING MATRIX
            </button>
            <button
              type="button"
              className={viewMode === "FORMULA" ? primaryButtonClass : buttonClass}
              onClick={() => setViewMode("FORMULA")}
            >
              FORMULA VIEW
            </button>
          </div>
        }
      >
        {viewMode === "WEIGHING" ? (
          <WeighingView
            sessionId={sessionId}
            groups={weighingGroups}
            columns={orderedSelections}
            onProgressChanged={invalidateProgress}
            onEditColumn={setEditingColumn}
          />
        ) : (
          <FormulaView rows={rows} ingredientsByVersion={ingredientsByVersion} />
        )}
      </SectionCard>

      {/* 2026-09-30: WORKFLOW은 WORK VIEW 탭에서 분리해서 아래 별도 박스로 뺐다 — 계량표/포뮬라뷰와
          성격이 달라(공정 타임라인) 탭 전환으로 숨겨두기보다 항상 보이는 게 낫다는 사용자 피드백. */}
      <SectionCard title="WORKFLOW">
        <WorkflowView
          sessionId={sessionId}
          tasks={tasks.data ?? []}
          formulaOptions={orderedSelections.map((s) => ({
            formulaVersionId: s.formulaVersionId,
            formulaName: s.formulaName,
          }))}
          ingredientsByVersion={ingredientsByVersion}
          taskIngredients={taskIngredients.data ?? {}}
          taskPredecessors={taskPredecessors.data ?? {}}
          onTasksChanged={invalidateTasks}
          onTaskStarted={ensureSessionStartedAt}
          showEfficiencyFields={Boolean(data.product_id)}
        />
      </SectionCard>

      <SectionCard title="NOTES">
        <NotesEditor value={data.notes ?? ""} onSave={(notes) => updateSession.mutate({ notes })} />
      </SectionCard>

      {/* 재고 반영은 작업이 끝난 뒤 하는 일이므로 시퀀스상 맨 마지막(NOTES 다음)에 둔다(2026-09-30). */}
      {data.status === "COMPLETED" && <StockReflectSection sessionId={sessionId} rows={rows} />}

      {editingColumn && (
        <EditFormulaVersionModal
          column={editingColumn}
          onClose={() => setEditingColumn(null)}
          onSaved={async () => {
            setEditingColumn(null);
            await invalidateSelections();
            await invalidateProgress();
          }}
        />
      )}
    </div>
  );
}

function InlineName({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      className="w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-lg text-foreground outline-none hover:border-border focus:border-foreground"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
    />
  );
}

/**
 * PRODUCTION EFFICIENCY 연결(2026-10-06) — 이 세션이 "어떤 Product를 몇 개 만드는 작업인지"
 * 선택하는 옵션 블록. 비워두면 지금까지와 완전히 동일한 순수 R&D/계량 세션으로 동작한다
 * (사용자 요청: 처음부터 목표/예상시간을 넣지 않고, 실제 데이터가 먼저 쌓이는 구조).
 */
function ProductionEfficiencyLinkSection({
  productId,
  productSizeId,
  targetUnitCount,
  onSave,
}: {
  productId: string | null;
  productSizeId: string | null;
  targetUnitCount: number | null;
  onSave: (patch: TablesUpdate<"work_sessions">) => void;
}) {
  const products = useQuery(productsQuery());
  const sizes = useQuery(productSizesQuery(productId ?? ""));
  const [batchDraft, setBatchDraft] = useState(
    targetUnitCount != null ? String(targetUnitCount) : "",
  );
  useEffect(() => {
    setBatchDraft(targetUnitCount != null ? String(targetUnitCount) : "");
  }, [targetUnitCount]);

  return (
    <SectionCard title="PRODUCT / BATCH SIZE (EFFICIENCY)">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="PRODUCT">
          <select
            className={selectClass + " !w-56"}
            value={productId ?? ""}
            onChange={(e) => onSave({ product_id: e.target.value || null, product_size_id: null })}
          >
            <option value="">— 연결 안 함(순수 계량 세션) —</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {productId && (sizes.data ?? []).length > 0 && (
          <Field label="SIZE">
            <select
              className={selectClass + " !w-40"}
              value={productSizeId ?? ""}
              onChange={(e) => onSave({ product_size_id: e.target.value || null })}
            >
              <option value="">(전체/미지정)</option>
              {(sizes.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {formatProductSizeLabel(s)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {productId && (
          <Field label="BATCH SIZE(개)">
            <input
              type="number"
              className={inputClass + " !w-24"}
              value={batchDraft}
              onChange={(e) => setBatchDraft(e.target.value)}
              onBlur={() => {
                const next = batchDraft.trim() ? Number(batchDraft) : null;
                if (next !== targetUnitCount) onSave({ target_unit_count: next });
              }}
            />
          </Field>
        )}
      </div>
      {productId && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          WORKFLOW의 각 TASK에 "실제 작업시간"/"생산량"을 입력하면, 이 Product의 EFFICIENCY
          화면(PRODUCTS 상세 또는 사이드바 EFFICIENCY 탭)에 Minutes/Unit·Units/Hour로 집계됩니다.
        </p>
      )}
    </SectionCard>
  );
}

/**
 * 작업 일정(2026-10-13 사용자 요청) — 이 Work Session을 언제 작업할지 계획하는 DATE/START/END
 * TIME 입력. 실제 작업 시작(started_at, START WORK 버튼)과는 별개 개념 — 이건 "계획"이고 그건
 * "실제"다.
 * 2026-10-20 재설계: 이 세션이 ORDER에 연결되어 있고 그 ORDER에 WANN 프로젝트가 있으면, 여기서
 * 날짜/시간을 입력/변경할 때마다 CORE ELEMENT(SHEET/CREAM/FILLING) TASK가 그 프로젝트 하위에
 * 자동 생성/갱신된다(sync-work-session-to-planner). ORDER 미연결 세션은 KORA 안에서만 쓰이는
 * 순수 계획값으로 남는다.
 */
function WorkScheduleSection({
  scheduledDate,
  scheduledStartTime,
  scheduledEndTime,
  onSave,
}: {
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  onSave: (patch: TablesUpdate<"work_sessions">) => void;
}) {
  const toTimeInputValue = (v: string | null) => (v ? v.slice(0, 5) : "");

  return (
    <SectionCard title="작업 일정">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="DATE">
          <input
            type="date"
            className={inputClass + " !w-40"}
            value={scheduledDate ?? ""}
            onChange={(e) => onSave({ scheduled_date: e.target.value || null })}
          />
        </Field>
        <Field label="START TIME">
          <input
            type="time"
            className={inputClass + " !w-28"}
            value={toTimeInputValue(scheduledStartTime)}
            onChange={(e) => onSave({ scheduled_start_time: e.target.value || null })}
          />
        </Field>
        <Field label="END TIME">
          <input
            type="time"
            className={inputClass + " !w-28"}
            value={toTimeInputValue(scheduledEndTime)}
            onChange={(e) => onSave({ scheduled_end_time: e.target.value || null })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

function NotesEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      rows={3}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      placeholder="예: Butter 부족 — 다음 입고 후 진행"
    />
  );
}

function AddFormulaVersionForm({
  sessionId,
  nextSort,
  onDone,
  kind = "DECORATIVE",
  slot = null,
  productId = null,
  productSizeId = null,
}: {
  sessionId: string;
  nextSort: number;
  onDone: () => void;
  /** 2026-10-06: CORE(Sheet/Cream/Filling 고정 슬롯)에서 추가할 때 전달 — 기본은 자유 추가인 DECORATIVE */
  kind?: "CORE" | "DECORATIVE";
  slot?: CoreSlot | null;
  /** 2026-10-12 사용자 요청: WORK SESSION이 특정 PRODUCT/PRODUCT SIZE에 연결돼 있으면,
   * product_components.quantity_g(그 사이즈의 COMPONENT별 목표중량)를 읽어와서 배수를
   * 자동으로 미리 채워준다 — 몰드개수/기본중량개수를 매번 수동 입력하지 않도록. */
  productId?: string | null;
  productSizeId?: string | null;
}) {
  const formulas = useQuery(formulasQuery());
  // 2026-10-12 사용자 요청: CORE(SHEET/CREAM/FILLING) 슬롯에서 추가할 때는 TECHNIQUE
  // CATEGORIES에서 그 슬롯으로 분류된 COMPONENT의 FORMULA만 보여준다. DECORATIVE(자유 추가)는
  // 기존처럼 전체를 다 보여준다.
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const formulaList = (formulas.data ?? []).filter((f) => {
    if (!slot) return true;
    // 2026-10-12 사용자 발견: COMPONENT에 연결 안 된 FORMULA(예: Tiramisu Mousse)는
    // components?.technique_category_id가 없어서 늘 빠졌다 — FORMULA 자체의
    // technique_category_id도 폴백으로 같이 봐야 CORE 슬롯에 정상적으로 뜬다.
    const catId = f.components?.technique_category_id ?? f.technique_category_id ?? null;
    return resolveSlotGroup(techniqueCategories.data ?? [], catId) === slot;
  });
  const moulds = useQuery(mouldsQuery());
  const [formulaId, setFormulaId] = useState("");
  const [versionId, setVersionId] = useState("");
  // 2026-09-30: 몰드+개수 기준 자동 배수 계산을 되살렸다(FORMULA 페이지의 mouldBatchMultiplier()와
  // 동일 로직) — "6인치 3개"처럼 실제 만들 몰드/개수를 입력하면 배수가 자동 계산된다. 같은 몰드면
  // 개수 그대로가 배수, 다른 몰드면 기준중량 비율로 환산(기준중량 미등록이면 개수를 그대로 쓰고
  // ⚠ 표시). BASE_WEIGHT 방식 Component는 몰드 개념이 없어 기존처럼 배수 직접입력만 가능하다.
  const [mouldId, setMouldId] = useState("");
  const [mouldCount, setMouldCount] = useState("1");
  const [manualMultiplier, setManualMultiplier] = useState("1");
  const [targetGrams, setTargetGrams] = useState("");
  const [useManual, setUseManual] = useState(false);

  const formula = formulaList.find((f) => f.id === formulaId) ?? null;
  const versionOptions = [...(formula?.formula_versions ?? [])].sort(
    (a, b) => b.version_number - a.version_number,
  );
  const selectedVersion = versionOptions.find((v) => v.id === versionId) ?? null;

  // 2026-10-12 사용자 요청: PRODUCT SIZE가 연결돼 있으면 그 사이즈의 product_components.quantity_g
  // (COMPONENT별 목표중량)를 읽어와서 배수를 자동으로 미리 채운다.
  const productComponents = useQuery({
    ...productComponentsQuery(productId ?? ""),
    enabled: Boolean(productId && productSizeId),
  });
  const sizeMatch = formula?.components?.id
    ? (productComponents.data ?? []).find(
        (pc) => pc.component_id === formula.components!.id && pc.product_size_id === productSizeId,
      )
    : undefined;
  const sizeTargetGrams = sizeMatch?.quantity_g != null ? Number(sizeMatch.quantity_g) : null;
  const versionIngredients = useQuery({
    ...versionIngredientsBulkQuery(selectedVersion ? [selectedVersion.id] : []),
    enabled: Boolean(selectedVersion && sizeTargetGrams != null),
  });
  const baseTotalGrams = selectedVersion
    ? sumBaseGrams(versionIngredients.data?.[selectedVersion.id] ?? [])
    : 0;

  useEffect(() => {
    setMouldId(selectedVersion?.default_mould_id ?? "");
    // PRODUCT SIZE 목표중량을 알 수 있으면 몰드 개수 대신 그 중량 기준 배수를 기본값으로 채운다
    // — 사용자가 매번 몰드개수/배수를 직접 입력하지 않아도 되게.
    if (sizeTargetGrams != null && baseTotalGrams > 0) {
      const suggested = suggestedMultiplierFromTarget(sizeTargetGrams, 1, baseTotalGrams);
      if (suggested != null) {
        setUseManual(true);
        setManualMultiplier(fmtNumber(suggested, 2));
        setTargetGrams(fmtNumber(sizeTargetGrams, 0));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion?.id, sizeTargetGrams, baseTotalGrams]);

  const scalingMode = formula?.components?.scaling_mode ?? null;
  const usingMould = scalingMode === "MOULD" && !useManual;
  const baseMould = moulds.data?.find((m) => m.id === selectedVersion?.default_mould_id) ?? null;
  const targetMould = moulds.data?.find((m) => m.id === mouldId) ?? null;
  const { multiplier: computedMultiplier, mismatch } = mouldBatchMultiplier(
    Number(mouldCount) || 1,
    targetMould,
    baseMould,
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!versionId) throw new Error("Select a formula version");
      // 2026-10-07 사용자 요청: 같은 FORMULA VERSION도 이 WORK SESSION에 중복으로 추가할 수
      // 있다(예: 같은 레시피를 다른 몰드/배치로 각각) — 더 이상 막지 않는다.
      const user_id = await currentUserId();
      const finalMultiplier = usingMould ? computedMultiplier : Number(manualMultiplier) || 1;
      const { error } = await supabase.from("work_session_formula_versions").insert({
        user_id,
        work_session_id: sessionId,
        formula_version_id: versionId,
        multiplier: finalMultiplier,
        // 2026-10-27 사용자 요청("몰드·용량 시스템 통합 개선안" 3단계 선반영): PRODUCT SIZE
        // 기반으로 배수를 자동 계산(useManual=true)하는 경로여도 scaling_mode가 MOULD인
        // Component라면 몰드 정체성(mould_id)은 계속 채워 넣는다. 예전에는 usingMould가 false가
        // 되는 순간 mould_id/mould_qty를 통째로 null로 지웠는데, 그러면 사이즈 기준으로 만든
        // 행은 어떤 몰드를 썼는지 화면에서 보이지 않고 SETTINGS 몰드 사용 현황에서도 빠졌다.
        mould_id: scalingMode === "MOULD" ? mouldId || null : null,
        mould_qty: scalingMode === "MOULD" ? Number(mouldCount) || 1 : null,
        base_weight_id: null,
        base_weight_qty: null,
        // 2026-10-19 "테이블 통합" 1단계: moulds/base_weight_presets를 capacities로 통합한
        // 신규 참조 컬럼도 함께 채운다(전환 기간 dual-write — 기존 mould_id 등은 그대로 유지).
        capacity_id: scalingMode === "MOULD" ? mouldId || null : null,
        capacity_qty: scalingMode === "MOULD" ? Number(mouldCount) || 1 : null,
        sort_order: nextSort,
        kind,
        slot,
      });
      if (error) throw error;
      // Component에 기본 WORKFLOW TEMPLATE이 등록돼 있고 "자동 적용"이 켜져 있으면, 이 Formula
      // Version(=열/품목)에 바로 TASK를 깔아준다(2026-09-24) — 매번 수동으로 템플릿 불러오기를
      // 반복하지 않도록. 템플릿이 없거나 꺼져있으면 기본 TASK 1개를 만든다(2026-10-14).
      // 2026-10-21: ORDER 페이지의 "work session 생성"에서도 같은 로직을 써야 해서
      // applyDefaultWorkflowForFormulaVersion()으로 공용화했다.
      const { error: templateError } = await applyDefaultWorkflowForFormulaVersion({
        sessionId,
        userId: user_id,
        formulaVersionId: versionId,
        component: formula?.components ?? null,
        formulaTechniqueCategoryId: formula?.technique_category_id ?? null,
        techniqueCategories: techniqueCategories.data ?? [],
      });
      if (templateError) {
        // 선택 자체는 이미 성공했으니 기본 워크플로 적용 실패는 조용히 콘솔에만 남기고 흐름을 막지 않는다.
        console.error("기본 워크플로 자동 적용 실패:", templateError);
      }
    },
    onSuccess: async () => {
      onDone();
      // 2026-10-21: CORE(SHEET/CREAM/FILLING)를 새로 추가하면 Planner에도 TASK가 생겨야 한다 —
      // 예전에는 일정을 저장할 때만 동기화돼서, 일정을 먼저 잡고 나중에 추가한 CREAM 등은 누락됐다.
      if (kind === "CORE") await syncWorkSessionToPlanner(sessionId);
    },
  });

  return (
    <form
      className="space-y-3 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="FORMULA">
          <select
            className={selectClass}
            value={formulaId}
            onChange={(e) => {
              setFormulaId(e.target.value);
              setVersionId("");
            }}
            required
          >
            <option value="">SELECT FORMULA…</option>
            {formulaList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.components?.name ?? f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="VERSION">
          <select
            className={selectClass}
            value={versionId}
            disabled={!formulaId}
            onChange={(e) => setVersionId(e.target.value)}
            required
          >
            <option value="">SELECT VERSION…</option>
            {versionOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {versionLabel(v.version_number)} · {v.status}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={usingMould ? "몰드 + 개수" : "배수 ×N"}>
        {usingMould ? (
          <div className="flex flex-wrap items-center gap-2">
            <MouldSelect
              className={`${selectClass} !w-40`}
              value={mouldId}
              onChange={setMouldId}
              emptyLabel="몰드 미지정"
            />
            <span className="label-caps text-xs text-muted-foreground">×</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              className={`${inputClass} !w-20 text-center`}
              value={mouldCount}
              onChange={(e) => setMouldCount(e.target.value)}
            />
            <span className="font-mono text-xs text-muted-foreground">
              = ×{fmtNumber(computedMultiplier, Number.isInteger(computedMultiplier) ? 0 : 2)}
            </span>
            {mismatch && (
              <span className="label-caps text-xs text-destructive">⚠ 기준중량 없음</span>
            )}
            {scalingMode === "MOULD" && (
              <button
                type="button"
                className="label-caps text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setUseManual(true)}
              >
                배수 직접입력으로
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              className={`${inputClass} !w-24`}
              value={manualMultiplier}
              onChange={(e) => {
                setManualMultiplier(e.target.value);
                const next = Number(e.target.value);
                if (baseTotalGrams > 0 && Number.isFinite(next) && next > 0) {
                  setTargetGrams(fmtNumber(baseTotalGrams * next, 0));
                }
              }}
            />
            {baseTotalGrams > 0 && (
              <label className="flex items-center gap-2">
                <span className="label-caps text-xs text-muted-foreground">또는 총 중량(g)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  className={`${inputClass} !w-24 text-center`}
                  value={targetGrams}
                  onChange={(e) => {
                    setTargetGrams(e.target.value);
                    const grams = Number(e.target.value);
                    if (!Number.isFinite(grams) || grams <= 0) return;
                    const next = suggestedMultiplierFromTarget(grams, 1, baseTotalGrams);
                    if (next != null) setManualMultiplier(fmtNumber(next, 2));
                  }}
                />
              </label>
            )}
            {sizeTargetGrams != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                PRODUCT SIZE 목표: {fmtNumber(sizeTargetGrams, 0)}g 기준 자동 적용됨
              </span>
            )}
            {scalingMode === "MOULD" && (
              <button
                type="button"
                className="label-caps text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setUseManual(false)}
              >
                몰드 기준으로
              </button>
            )}
          </div>
        )}
      </Field>
      {add.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(add.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={add.isPending}>
          ADD
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

function FormulaVersionRow({
  row,
  sessionId,
  lines,
  onRemove,
}: {
  row: WorkSessionFormulaVersionRow;
  sessionId: string;
  lines: VersionIngredientRow[];
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({
    ...workSessionMultiplierHistoryQuery(sessionId, row.id),
    enabled: showHistory,
  });
  const moulds = useQuery(mouldsQuery());

  const formula = row.formula_versions.formulas;
  const scalingMode = formula.components?.scaling_mode ?? null;

  // 2026-09-30: 몰드+개수 기준 자동 배수 계산 복원(FORMULA 페이지와 동일 mouldBatchMultiplier()).
  // 예전(2026-09-24)에 저장된 행은 mould_id/mould_qty가 null일 수 있어, 이 경우 기본 몰드 +
  // 기존 배수를 그대로 개수로 간주해 자연스럽게 이어받는다.
  const [mouldId, setMouldId] = useState(
    row.mould_id ?? row.formula_versions.default_mould_id ?? "",
  );
  const [mouldCount, setMouldCount] = useState(
    row.mould_qty != null ? String(row.mould_qty) : String(Number(row.multiplier)),
  );
  const [manualMultiplier, setManualMultiplier] = useState(String(Number(row.multiplier)));
  const [useManual, setUseManual] = useState(scalingMode !== "MOULD");
  // 2026-10-12 사용자 요청: "배수 직접입력" 대신 원하는 총 반죽량(g)을 입력하면 역산해서
  // 배수를 자동 적용 — 배수 = 목표 총g ÷ BASE(×1) 총g. 배수 입력칸과 서로 양방향으로
  // 동기화(한쪽을 바꾸면 다른 쪽도 같이 갱신)된다.
  const baseTotalGrams = sumBaseGrams(lines);
  const [targetGrams, setTargetGrams] = useState(
    baseTotalGrams > 0 ? fmtNumber(baseTotalGrams * Number(row.multiplier), 0) : "",
  );
  useEffect(() => {
    setMouldId(row.mould_id ?? row.formula_versions.default_mould_id ?? "");
    setMouldCount(row.mould_qty != null ? String(row.mould_qty) : String(Number(row.multiplier)));
    setManualMultiplier(String(Number(row.multiplier)));
    setTargetGrams(baseTotalGrams > 0 ? fmtNumber(baseTotalGrams * Number(row.multiplier), 0) : "");
  }, [row.id, row.multiplier, row.mould_id, row.mould_qty, baseTotalGrams]);

  const usingMould = scalingMode === "MOULD" && !useManual;
  const baseMould =
    moulds.data?.find((m) => m.id === row.formula_versions.default_mould_id) ?? null;
  const targetMould = moulds.data?.find((m) => m.id === mouldId) ?? null;
  const { multiplier: computedMultiplier, mismatch } = mouldBatchMultiplier(
    Number(mouldCount) || 1,
    targetMould,
    baseMould,
  );

  const applyBatch = useMutation({
    mutationFn: async (next: {
      multiplier: number;
      mouldId: string | null;
      mouldQty: number | null;
    }) => {
      const previous = Number(row.multiplier);
      if (
        next.multiplier === previous &&
        next.mouldId === (row.mould_id ?? null) &&
        next.mouldQty === (row.mould_qty ?? null)
      )
        return;
      const user_id = await currentUserId();
      const snapshot = buildMultiplierSnapshot(lines, next.multiplier);
      const { error: historyError } = await supabase
        .from("work_session_multiplier_history")
        .insert({
          user_id,
          work_session_id: sessionId,
          formula_version_id: row.formula_version_id,
          // 2026-10-07: 같은 FORMULA VERSION 중복 추가 시 히스토리가 섞이지 않도록 선택 단위로도 남긴다.
          work_session_formula_version_id: row.id,
          previous_multiplier: previous,
          applied_multiplier: next.multiplier,
          resulting_working_quantity_snapshot: snapshot,
        });
      if (historyError) throw historyError;
      const { error: updateError } = await supabase
        .from("work_session_formula_versions")
        .update({
          multiplier: next.multiplier,
          mould_id: next.mouldId,
          mould_qty: next.mouldQty,
          // 2026-10-19 "테이블 통합" 1단계: 통합 capacity_id/capacity_qty도 함께 갱신(dual-write).
          capacity_id: next.mouldId,
          capacity_qty: next.mouldQty,
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["work_session_formula_versions", sessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["work_session_multiplier_history", sessionId, row.id],
      });
    },
  });

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm">{formula.components?.name ?? formula.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {versionLabel(row.formula_versions.version_number)} · {row.formula_versions.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {usingMould ? (
            <div className="flex flex-wrap items-center gap-2">
              <MouldSelect
                className={`${selectClass} !w-36`}
                value={mouldId}
                onChange={(id) => {
                  setMouldId(id);
                  const count = Number(mouldCount) || 1;
                  const target = moulds.data?.find((m) => m.id === id) ?? null;
                  const { multiplier } = mouldBatchMultiplier(count, target, baseMould);
                  applyBatch.mutate({ multiplier, mouldId: id || null, mouldQty: count });
                }}
                emptyLabel="몰드 미지정"
              />
              <span className="label-caps text-xs text-muted-foreground">×</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                className={`${inputClass} !w-16 text-center`}
                value={mouldCount}
                onChange={(e) => setMouldCount(e.target.value)}
                onBlur={(e) => {
                  const count = Number(e.target.value) || 1;
                  applyBatch.mutate({
                    multiplier: computedMultiplier,
                    mouldId: mouldId || null,
                    mouldQty: count,
                  });
                }}
              />
              <span className="font-mono text-xs text-muted-foreground">
                = ×{fmtNumber(computedMultiplier, Number.isInteger(computedMultiplier) ? 0 : 2)}
              </span>
              {mismatch && (
                <span className="label-caps text-xs text-destructive">⚠ 기준중량 없음</span>
              )}
              <button
                type="button"
                className="label-caps text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setUseManual(true)}
              >
                배수 직접입력으로
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="label-caps text-xs text-muted-foreground">개수(배수) ×</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  className={`${inputClass} !w-24 text-center`}
                  value={manualMultiplier}
                  onChange={(e) => setManualMultiplier(e.target.value)}
                  onBlur={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next) || next <= 0) return;
                    // 2026-10-27: "개수(배수) 직접입력" 모드여도 MOULD Component라면 몰드
                    // 정체성은 유지한다(추가 폼과 동일 원칙 — 위 add 참고).
                    applyBatch.mutate({
                      multiplier: next,
                      mouldId: scalingMode === "MOULD" ? mouldId || null : null,
                      mouldQty: scalingMode === "MOULD" ? Number(mouldCount) || 1 : null,
                    });
                    if (baseTotalGrams > 0) setTargetGrams(fmtNumber(baseTotalGrams * next, 0));
                  }}
                />
              </label>
              {baseTotalGrams > 0 && (
                <label className="flex items-center gap-2">
                  <span className="label-caps text-xs text-muted-foreground">또는 총 중량(g)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    className={`${inputClass} !w-24 text-center`}
                    value={targetGrams}
                    onChange={(e) => setTargetGrams(e.target.value)}
                    onBlur={(e) => {
                      const grams = Number(e.target.value);
                      if (!Number.isFinite(grams) || grams <= 0) return;
                      const next = suggestedMultiplierFromTarget(grams, 1, baseTotalGrams);
                      if (next == null) return;
                      setManualMultiplier(fmtNumber(next, 2));
                      applyBatch.mutate({
                        multiplier: next,
                        mouldId: scalingMode === "MOULD" ? mouldId || null : null,
                        mouldQty: scalingMode === "MOULD" ? Number(mouldCount) || 1 : null,
                      });
                    }}
                  />
                </label>
              )}
              {scalingMode === "MOULD" && (
                <button
                  type="button"
                  className="label-caps text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setUseManual(false)}
                >
                  몰드 기준으로
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 border-l border-border pl-3">
            <button
              type="button"
              className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "HIDE HISTORY" : "HISTORY"}
            </button>
            <button
              type="button"
              className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (confirm(`REMOVE "${formula.name}" FROM THIS WORK SESSION?`)) onRemove();
              }}
            >
              REMOVE
            </button>
          </div>
        </div>
      </div>
      {applyBatch.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(applyBatch.error as Error).message}
        </p>
      )}
      {showHistory && (
        <ul className="space-y-1 border border-dashed border-border p-2">
          {(history.data ?? []).length === 0 ? (
            <li className="font-mono text-xs text-muted-foreground">NO MULTIPLIER CHANGES YET</li>
          ) : (
            (history.data ?? []).map((h) => (
              <li key={h.id} className="font-mono text-xs text-muted-foreground">
                {formatDateTime(h.applied_at)} · ×{fmtNumber(Number(h.previous_multiplier), 2)} → ×
                {fmtNumber(Number(h.applied_multiplier), 2)}
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

type WeighingColumn = {
  /** work_session_formula_versions.id — 열의 고유 키(동일 FORMULA VERSION 중복 추가 시에도 구분됨) */
  selectionId: string;
  formulaVersionId: string;
  formulaId: string;
  formulaName: string;
  versionNumber: number;
  multiplier: number;
  sortOrder: number;
};

const DEFAULT_MATRIX_COL_WIDTH = 150;
const MIN_MATRIX_COL_WIDTH = 90;
const DEFAULT_MATRIX_ROW_HEIGHT = 44;
const MIN_MATRIX_ROW_HEIGHT = 32;
const DEFAULT_MATRIX_INGREDIENT_COL_WIDTH = 170;
const MIN_MATRIX_INGREDIENT_COL_WIDTH = 110;
/** 열 너비 합계보다 표(패널)가 넓을 때 남는 공간을 흡수해서 각 행의 구분선이 화면 끝까지
 * 자연스럽게 이어지도록 하는 실제 데이터 없는 "채움" 열 — VersionComparisonSheet와 동일한 패턴. */
const MATRIX_FILLER_COL_ID = "__filler__";

/** WORK VIEW의 WEIGHING MATRIX — Component/Formula 페이지의 버전 비교 시트와 동일하게, 실제
 * 엑셀처럼 행(재료)/열(포뮬라 버전)을 드래그로 재배치하거나 크기를 조절할 수 있다. 순서/크기는
 * 이 화면을 보는 동안만 유지되는 세션 전용 상태로, 실제 계량 진행 상태(그램수/체크/메모)와는
 * 무관하다 — 새로고침하면 원래 순서(선택한 순서)로 돌아간다. 첫 열/헤더 행의 sticky 고정은
 * 그대로 유지한다. */
function WeighingView({
  sessionId,
  groups,
  columns,
  onProgressChanged,
  onEditColumn,
}: {
  sessionId: string;
  groups: ReturnType<typeof buildWeighingGroups>;
  columns: WeighingColumn[];
  onProgressChanged: () => void;
  onEditColumn: (column: WeighingColumn) => void;
}) {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [ingredientColWidth, setIngredientColWidth] = useState(DEFAULT_MATRIX_INGREDIENT_COL_WIDTH);

  // 선택된 포뮬라 버전(열)/재료(행)이 바뀌면 순서 목록을 맞춰준다 — 기존 순서는 최대한
  // 유지하고, 새로 생긴 항목만 뒤에 붙이고 사라진 항목은 뺀다.
  useEffect(() => {
    setColumnOrder((prev) => {
      const ids = columns.map((c) => c.selectionId);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [columns]);

  useEffect(() => {
    setRowOrder((prev) => {
      const ids = groups.map((g) => g.ingredientId);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [groups]);

  const displayColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.selectionId, c]));
    return columnOrder.map((id) => byId.get(id)).filter((c): c is WeighingColumn => Boolean(c));
  }, [columns, columnOrder]);

  const displayGroups = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.ingredientId, g]));
    return rowOrder
      .map((id) => byId.get(id))
      .filter((g): g is (typeof groups)[number] => Boolean(g));
  }, [groups, rowOrder]);

  // 열(포뮬라 버전)별 총 중량(g) — 행 순서/표시 여부와 무관하게 전체 재료 기준으로 합산한다.
  // g/kg/ml/l로 환산 가능한 재료만 더하고("ea" 등 무게로 못 바꾸는 단위는 제외), 표시는
  // 항상 g 단위로 통일한다.
  const totalsByColumn = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const group of groups) {
      for (const cell of group.cells) {
        const grams = toGrams(cell.workingAmount, cell.unit);
        if (grams == null) continue;
        totals[cell.selectionId] = (totals[cell.selectionId] ?? 0) + grams;
      }
    }
    return totals;
  }, [groups]);

  const colSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const rowSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRowOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const startColumnResize = (colId: string, startX: number) => {
    const startWidth = colWidths[colId] ?? DEFAULT_MATRIX_COL_WIDTH;
    const onMove = (e: PointerEvent) => {
      const next = Math.max(MIN_MATRIX_COL_WIDTH, startWidth + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [colId]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startIngredientColResize = (startX: number) => {
    const startWidth = ingredientColWidth;
    const onMove = (e: PointerEvent) => {
      setIngredientColWidth(
        Math.max(MIN_MATRIX_INGREDIENT_COL_WIDTH, startWidth + (e.clientX - startX)),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startRowResize = (rowId: string, startY: number) => {
    const startHeight = rowHeights[rowId] ?? DEFAULT_MATRIX_ROW_HEIGHT;
    const onMove = (e: PointerEvent) => {
      const next = Math.max(MIN_MATRIX_ROW_HEIGHT, startHeight + (e.clientY - startY));
      setRowHeights((prev) => ({ ...prev, [rowId]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (groups.length === 0 || columns.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        NO INGREDIENTS TO WEIGH YET
      </p>
    );
  }

  const dataWidth =
    ingredientColWidth +
    displayColumns.reduce(
      (sum, c) => sum + (colWidths[c.selectionId] ?? DEFAULT_MATRIX_COL_WIDTH),
      0,
    );

  return (
    <div className="max-h-[70vh] overflow-auto border border-border">
      <table
        className="w-full border-collapse text-sm"
        style={{ tableLayout: "auto", minWidth: dataWidth }}
      >
        <colgroup>
          <col style={{ width: ingredientColWidth }} />
          {displayColumns.map((col) => (
            <col
              key={col.selectionId}
              style={{ width: colWidths[col.selectionId] ?? DEFAULT_MATRIX_COL_WIDTH }}
            />
          ))}
          <col />
        </colgroup>
        <DndContext
          sensors={colSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleColumnDragEnd}
        >
          <thead>
            <tr>
              <th className="label-caps sticky left-0 top-0 z-30 relative border-b border-r border-border bg-secondary px-3 py-2 text-right text-xs text-muted-foreground">
                INGREDIENT
                <div
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-foreground/20"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startIngredientColResize(e.clientX);
                  }}
                />
              </th>
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                {displayColumns.map((col) => (
                  <MatrixColumnHeader
                    key={col.selectionId}
                    id={col.selectionId}
                    formulaName={col.formulaName}
                    multiplier={col.multiplier}
                    onResizeStart={(clientX) => startColumnResize(col.selectionId, clientX)}
                    onEdit={() => onEditColumn(col)}
                  />
                ))}
              </SortableContext>
              <th
                key={MATRIX_FILLER_COL_ID}
                className="sticky top-0 z-20 border-b border-l border-border bg-secondary"
              />
            </tr>
          </thead>
        </DndContext>
        <DndContext
          sensors={rowSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleRowDragEnd}
        >
          <SortableContext items={rowOrder} strategy={verticalListSortingStrategy}>
            <tbody>
              {displayGroups.map((group) => (
                <MatrixBodyRow
                  key={group.ingredientId}
                  group={group}
                  columns={displayColumns}
                  height={rowHeights[group.ingredientId] ?? DEFAULT_MATRIX_ROW_HEIGHT}
                  sessionId={sessionId}
                  onResizeStart={(clientY) => startRowResize(group.ingredientId, clientY)}
                  onProgressChanged={onProgressChanged}
                />
              ))}
            </tbody>
          </SortableContext>
        </DndContext>
        <tfoot>
          <tr>
            <th className="label-caps sticky left-0 bottom-0 z-10 border-t border-r border-border bg-secondary px-3 py-2 text-right text-xs text-muted-foreground">
              TOTAL
            </th>
            {displayColumns.map((col) => (
              <td
                key={col.selectionId}
                className="border-t border-l border-border bg-secondary px-2 py-2 text-left text-sm font-semibold tabular-nums"
              >
                {fmtNumber(totalsByColumn[col.selectionId] ?? 0, 0)}g
              </td>
            ))}
            <td className="border-t border-l border-border bg-secondary" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MatrixColumnHeader({
  id,
  formulaName,
  multiplier,
  onResizeStart,
  onEdit,
}: {
  id: string;
  formulaName: string;
  multiplier: number;
  onResizeStart: (clientX: number) => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "sticky top-0 z-20 relative border-b border-l border-border bg-secondary px-3 py-2 text-left align-bottom",
        isDragging && "z-40 bg-secondary",
      )}
    >
      <div className="flex items-start gap-1">
        {/* 열(포뮬라 버전) 드래그 손잡이 */}
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-xs leading-tight">{formulaName}</p>
          <p className="label-caps whitespace-nowrap text-[11px] text-muted-foreground">
            ×{fmtNumber(multiplier, 0)}
          </p>
        </div>
        {/* 2026-10-14 사용자 요청: "work session에서 재료 추가하고 추가된 재료로 새로운 버전
            포뮬라 추가 하는버튼" — 포뮬라 페이지로 이동하지 않고 이 열의 레시피를 바로
            수정/새 버전 저장할 수 있게 하는 진입점. */}
        <button
          type="button"
          className="label-caps shrink-0 px-1 py-0.5 text-[10px] text-muted-foreground hover:border hover:border-border hover:text-foreground"
          onClick={onEdit}
        >
          EDIT
        </button>
      </div>
      {/* 열 너비 조절 손잡이 — 오른쪽 경계를 드래그 */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-foreground/20"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(e.clientX);
        }}
      />
    </th>
  );
}

function MatrixBodyRow({
  group,
  columns,
  height,
  sessionId,
  onResizeStart,
  onProgressChanged,
}: {
  group: ReturnType<typeof buildWeighingGroups>[number];
  columns: WeighingColumn[];
  height: number;
  sessionId: string;
  onResizeStart: (clientY: number) => void;
  onProgressChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.ingredientId,
  });

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, height }}
      className={cn(
        "relative border-b border-border align-middle",
        isDragging && "z-10 bg-background shadow-md",
      )}
    >
      <td
        className="sticky left-0 z-10 relative border-r border-border bg-background px-3 py-1.5 align-middle"
        style={{ height }}
      >
        {/* 재료명은 오른쪽(버전 열 쪽)으로 붙이고, 드래그 손잡이는 왼쪽에 고정 */}
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </button>
          <span className="whitespace-nowrap text-right text-sm">{group.ingredientName}</span>
        </div>
        {/* 행 높이 조절 손잡이 — 아래쪽 경계를 드래그 */}
        <div
          role="separator"
          aria-orientation="horizontal"
          className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize touch-none hover:bg-foreground/20"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(e.clientY);
          }}
        />
      </td>
      {columns.map((col) => {
        const cell = group.cells.find((c) => c.selectionId === col.selectionId);
        return (
          <td
            key={col.selectionId}
            className="border-l border-border px-2 py-1 align-middle"
            style={{ height }}
          >
            {cell ? (
              <WeighingMatrixCell sessionId={sessionId} cell={cell} onChanged={onProgressChanged} />
            ) : (
              <span className="block text-center text-muted-foreground">—</span>
            )}
          </td>
        );
      })}
      {/* 채움 열 — 표 너비 합계보다 패널이 넓을 때 남는 공간에도 이 행의 구분선이 자연스럽게
          이어지도록 빈 셀을 하나 더 둔다. */}
      <td className="border-l border-border" style={{ height }} />
    </tr>
  );
}

/** WEIGHING MATRIX 재료 셀은 체크/언체크 2단계만 지원한다(2026-09-24, 4단계 순환이 너무 복잡하다는 피드백).
 * SHORTAGE/SKIPPED는 과거 데이터에 남아있을 수 있어 표시는 그대로 하되, 이 버튼으로는 만들지 않는다. */
function toggleProgressStatus(current: WorkSessionProgressStatus): WorkSessionProgressStatus {
  return current === "DONE" ? "NOT_STARTED" : "DONE";
}

// DONE은 배경 음영 + 굵은 가로선으로 NOT_STARTED와 눈에 띄게 구분되도록(2026-09-24, 시력이
// 안 좋아 체크 여부가 잘 안 보인다는 피드백 — 회색 텍스트만으로는 구분이 약했다).
const STATUS_CELL_TONE: Record<WorkSessionProgressStatus, string> = {
  NOT_STARTED: "",
  DONE: "bg-muted text-muted-foreground line-through decoration-2",
  SHORTAGE: "bg-destructive/10",
  SKIPPED: "text-muted-foreground line-through decoration-1",
};

function WeighingMatrixCell({
  sessionId,
  cell,
  onChanged,
}: {
  sessionId: string;
  cell: ReturnType<typeof buildWeighingGroups>[number]["cells"][number];
  onChanged: () => void;
}) {
  const [note, setNote] = useState(cell.note ?? "");
  const [editingNote, setEditingNote] = useState(false);

  const setProgress = useMutation({
    mutationFn: async (patch: { status?: WorkSessionProgressStatus; note?: string | null }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("work_session_progress").upsert(
        {
          user_id,
          work_session_id: sessionId,
          work_session_formula_version_id: cell.selectionId,
          formula_version_ingredient_id: cell.ingredientLineId,
          status: patch.status ?? cell.progressStatus,
          note: patch.note !== undefined ? patch.note : cell.note,
        },
        { onConflict: "work_session_formula_version_id,formula_version_ingredient_id" },
      );
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  // 보조 계량(예: 계란 개수)도 이 셀의 배수만큼 곱해서 함께 보여준다 — Formula 페이지/버전
  // 비교 시트와 동일한 형식("· 3개"), %/그램 계산에는 관여하지 않는 표시 전용 값이다.
  const scaledSecondary =
    cell.secondaryAmount != null ? cell.secondaryAmount * cell.multiplier : null;

  return (
    <div
      className={`relative flex min-w-[110px] items-center justify-between gap-2 rounded-sm px-1 py-1 ${STATUS_CELL_TONE[cell.progressStatus]}`}
    >
      <button
        type="button"
        className="whitespace-nowrap text-left font-semibold tabular-nums"
        onClick={() => {
          if (cell.progressStatus === "SHORTAGE") setEditingNote((v) => !v);
        }}
        title={cell.note ?? undefined}
      >
        {fmtNumber(cell.workingAmount, 0)}
        {cell.unit}
        {scaledSecondary != null && cell.secondaryUnit && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            · {fmtNumber(scaledSecondary, 0)}
            {cell.secondaryUnit}
          </span>
        )}
      </button>
      <button
        type="button"
        className="label-caps flex h-5 w-5 shrink-0 items-center justify-center border border-border text-xs leading-none hover:border-foreground disabled:opacity-40"
        disabled={setProgress.isPending}
        onClick={() => {
          setProgress.mutate({ status: toggleProgressStatus(cell.progressStatus) });
        }}
        title={
          setProgress.isError
            ? `저장 실패: ${(setProgress.error as Error).message}`
            : PROGRESS_STATUS_LABEL[cell.progressStatus]
        }
      >
        {setProgress.isError ? "⚠" : PROGRESS_STATUS_ICON[cell.progressStatus]}
      </button>
      {setProgress.isError && (
        <p className="absolute z-30 mt-8 w-40 bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground">
          저장 실패 — 다시 클릭해보세요
        </p>
      )}
      {cell.progressStatus === "SHORTAGE" && editingNote && (
        <input
          autoFocus
          className={`${inputClass} absolute z-30 mt-8 !w-56 text-xs`}
          placeholder="예: Butter 부족 — 다음 입고 후 진행"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            setEditingNote(false);
            if (note !== (cell.note ?? "")) setProgress.mutate({ note: note.trim() || null });
          }}
        />
      )}
    </div>
  );
}

function FormulaView({
  rows,
  ingredientsByVersion,
}: {
  rows: WorkSessionFormulaVersionRow[];
  ingredientsByVersion: Record<
    string,
    {
      id: string;
      amount: number;
      unit: string;
      ingredient_id: string;
      ingredients: { name: string; name_en: string | null };
    }[]
  >;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const lines = ingredientsByVersion[row.formula_version_id] ?? [];
        const multiplier = Number(row.multiplier);
        return (
          <div key={row.id} className="border border-border">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <span className="label-caps text-sm">
                {row.formula_versions.formulas.name} ·{" "}
                {versionLabel(row.formula_versions.version_number)}
                {multiplier !== 1 ? ` · ×${fmtNumber(multiplier, 0)}` : ""}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">
                    {line.ingredients.name_en
                      ? `${line.ingredients.name} (${line.ingredients.name_en})`
                      : line.ingredients.name}
                  </span>
                  <span className="text-base tabular-nums">
                    {fmtNumber(workingAmount(Number(line.amount), multiplier), 0)}
                    {line.unit}
                    {multiplier !== 1 && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        (orig {fmtNumber(Number(line.amount), 0)}
                        {line.unit})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type EditDraftRow = {
  /** 안정적인 UI 키 — 기존 재료는 formula_version_ingredients.id, 새로 추가한 재료는 "new-…" */
  key: string;
  /** 기존 재료 라인이면 그 id, 새로 추가한 재료면 null(복사 안 하고 새로 insert) */
  sourceId: string | null;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  amount: string;
  /** null이면 새로 추가한 재료 — amount_source를 "manual"로 고정하고, 자동 요약에서 "+"로 표시 */
  originalAmount: number | null;
  originalUnit: string | null;
  note: string | null;
  secondaryAmount: number | null;
  secondaryUnit: string | null;
  removed: boolean;
};

/** 2026-10-14 사용자 요청: "worksession에서 각 포뮬라별로 edit 기능 추가해서 포뮬라 버전 새로
 * 생성하는 기능 만들어줘 ... 내가 포뮬라로 이동하지 않고도 work session에서 재료 추가하고
 * 추가된 재료로 새로운 버전 포뮬라 추가 하는버튼이 있는거지" — WEIGHING MATRIX의 열(선택) 하나를
 * 골라, 그 열이 쓰는 FORMULA VERSION의 재료량을 조정하거나 재료를 추가해서 새 DRAFT 버전으로
 * 저장한다. $formulaId.tsx의 createVersion/addIngredient와 같은 패턴(새 formula_versions 행 +
 * formula_version_ingredients 복사, amount_source는 안 바뀐 줄은 "copied" 바뀌거나 새로 추가한
 * 줄은 "manual")을 그대로 재사용한다. 저장되면 이 WORK SESSION 선택(work_session_formula_versions
 * 행)의 formula_version_id를 새 버전으로 바로 바꿔서, 화면 이동 없이 바로 새 레시피를 쓰게 한다.
 * 재료 라인 id가 전부 새로 생기므로, 이 열에 쌓여있던 계량 진행상태(work_session_progress)는
 * 더 이상 의미가 없어 같이 지운다(새 버전 기준으로 다시 체크하면 됨) — multiplier/sort_order는
 * 그대로 유지. 새 버전은 다른 버전 생성과 동일하게 status "DRAFT"로 남고, CURRENT로 올리는 건
 * 여전히 포뮬라 페이지에서 별도로 하는 결정으로 남겨둔다. */
/** 변경 요약을 사용자가 손으로 적지 않고, 초안(draftRows) vs 원본을 비교해서 자동으로
 * 문구를 만든다(2026-10-14 사용자 요청: "서머리도 내가 적는게 아니고 자동으로 적어줘
 * 바뀐부분"). 양이 바뀐 재료는 "원래양 → 새양", 새로 추가한 재료는 "+ 이름 양", 지운 재료는
 * "- 이름" 형태로 모아 쉼표로 이어붙인다. */
function buildAutoSummary(rows: EditDraftRow[]): string {
  const parts: string[] = [];
  for (const row of rows) {
    if (row.removed) continue;
    if (row.originalAmount === null) {
      parts.push(`+ ${row.ingredientName} ${row.amount}${row.unit}`);
    } else if (Number(row.amount) !== row.originalAmount || row.unit !== row.originalUnit) {
      parts.push(
        `${row.ingredientName} ${fmtNumber(row.originalAmount, 0)}${row.originalUnit} → ${row.amount}${row.unit}`,
      );
    }
  }
  for (const row of rows) {
    if (row.removed && row.sourceId) parts.push(`- ${row.ingredientName}`);
  }
  return parts.length > 0 ? parts.join(", ") : "변경 없음";
}

function EditFormulaVersionModal({
  column,
  onClose,
  onSaved,
}: {
  column: WeighingColumn;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const baseIngredients = useQuery(versionIngredientsQuery(column.formulaVersionId));
  const [draftRows, setDraftRows] = useState<EditDraftRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [pickingIngredient, setPickingIngredient] = useState(false);
  // 2026-10-14 사용자 요청: "new 버전으로 저장할지 아니면 덮어쓸지도 선택할수 있게" — NEW는
  // 지금 버전을 복사한 새 DRAFT 버전을 만들고 이 WORK SESSION만 거기로 옮긴다(기존 버전/다른
  // SESSION은 안 건드림). OVERWRITE는 지금 버전 자체를 고쳐서, 이 버전을 쓰는 모든 곳에 바로
  // 반영되고 계량 체크 상태도 바뀌지 않은 재료는 그대로 유지된다.
  // 2026-10-18 사용자 요청: "기존 formula말고 새로운 formula 생성이랑 이름도 바로 정할수
  // 있게해줘" — NEW_FORMULA는 기존 포뮬라와 완전히 분리된 새 포뮬라(+버전 1개)를 만들고,
  // 이 WORK SESSION의 이 열만 거기로 옮긴다. 이름을 바로 이 자리에서 정한다.
  const [saveMode, setSaveMode] = useState<"new" | "overwrite" | "new_formula">("new");
  const [newFormulaName, setNewFormulaName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 모달이 열릴 때 딱 한 번만 현재 버전의 재료 목록으로 초안을 채운다 — refetch가 와도 사용자가
  // 고치고 있던 값을 덮어쓰지 않는다.
  useEffect(() => {
    if (seeded || !baseIngredients.data) return;
    setDraftRows(
      baseIngredients.data.map((row) => ({
        key: row.id,
        sourceId: row.id,
        ingredientId: row.ingredient_id,
        ingredientName: row.ingredients.name_en
          ? `${row.ingredients.name} (${row.ingredients.name_en})`
          : row.ingredients.name,
        unit: row.unit,
        amount: String(row.amount),
        originalAmount: Number(row.amount),
        originalUnit: row.unit,
        note: row.note,
        secondaryAmount: row.secondary_amount,
        secondaryUnit: row.secondary_unit,
        removed: false,
      })),
    );
    setSeeded(true);
  }, [seeded, baseIngredients.data]);

  const patchRow = (key: string, patch: Partial<EditDraftRow>) => {
    setDraftRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setDraftRows((prev) => {
      const row = prev.find((r) => r.key === key);
      if (!row) return prev;
      // 아직 저장된 적 없는(이번에 새로 추가한) 재료는 목록에서 바로 빼고, 원래 있던 재료는
      // "지움" 표시만 해둔다 — 자동 요약에 "- 이름"으로 나타나고, 저장할 때 실제로 제외/삭제된다.
      if (row.sourceId === null) return prev.filter((r) => r.key !== key);
      return prev.map((r) => (r.key === key ? { ...r, removed: true } : r));
    });
  };

  const addIngredientRow = async (ingredientId: string, defaultUnit: string) => {
    setPickingIngredient(false);
    const tempKey = `new-${ingredientId}-${Date.now()}`;
    setDraftRows((prev) => [
      ...prev,
      {
        key: tempKey,
        sourceId: null,
        ingredientId,
        ingredientName: "…",
        unit: defaultUnit,
        amount: "0",
        originalAmount: null,
        originalUnit: null,
        note: null,
        secondaryAmount: null,
        secondaryUnit: null,
        removed: false,
      },
    ]);
    const { data } = await supabase
      .from("ingredients")
      .select("name, name_en")
      .eq("id", ingredientId)
      .single();
    if (data) {
      patchRow(tempKey, {
        ingredientName: data.name_en ? `${data.name} (${data.name_en})` : data.name,
      });
    }
  };

  const visibleRows = draftRows.filter((r) => !r.removed);
  const autoSummary = useMemo(() => buildAutoSummary(draftRows), [draftRows]);
  const hasChanges = autoSummary !== "변경 없음";

  const saveChanges = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();

      if (saveMode === "new") {
        // NEW — 지금 버전을 복사한 새 DRAFT 버전을 만들고, 이 WORK SESSION 선택만 그쪽으로
        // 옮긴다. 다른 WORK SESSION이나 포뮬라 페이지의 "현재 버전"은 그대로 안전하게 남는다.
        const { data: baseVersion, error: baseError } = await supabase
          .from("formula_versions")
          .select(
            "yield_quantity, bath_water_g, basis_overrides, default_mould_id, default_base_weight_id, default_capacity_id",
          )
          .eq("id", column.formulaVersionId)
          .single();
        if (baseError) throw baseError;

        const { data: existingVersions, error: versionsError } = await supabase
          .from("formula_versions")
          .select("version_number")
          .eq("formula_id", column.formulaId);
        if (versionsError) throw versionsError;
        const nextNumber =
          (existingVersions ?? []).reduce((max, v) => Math.max(max, v.version_number), 0) + 1;

        const { data: newVersion, error: insertError } = await supabase
          .from("formula_versions")
          .insert({
            user_id,
            formula_id: column.formulaId,
            version_number: nextNumber,
            status: "DRAFT",
            default_mould_id: baseVersion.default_mould_id,
            default_base_weight_id: baseVersion.default_base_weight_id,
            // 2026-10-19 "테이블 통합" 1단계: 통합 default_capacity_id도 함께 복사(dual-write).
            default_capacity_id: baseVersion.default_capacity_id,
            yield_quantity: baseVersion.yield_quantity,
            change_summary: autoSummary,
            change_reason: reason.trim() || null,
            bath_water_g: baseVersion.bath_water_g,
            basis_overrides: baseVersion.basis_overrides ?? {},
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        const rowsToInsert = visibleRows.map((row, index) => ({
          user_id,
          formula_version_id: newVersion.id,
          ingredient_id: row.ingredientId,
          amount: Number(row.amount) || 0,
          unit: row.unit,
          sort_order: index,
          note: row.note,
          secondary_amount: row.secondaryAmount,
          secondary_unit: row.secondaryUnit,
          amount_source:
            row.originalAmount === null ||
            Number(row.amount) !== row.originalAmount ||
            row.unit !== row.originalUnit
              ? "manual"
              : "copied",
        }));
        if (rowsToInsert.length > 0) {
          const { error: ingredientsError } = await supabase
            .from("formula_version_ingredients")
            .insert(rowsToInsert);
          if (ingredientsError) throw ingredientsError;
        }

        // 이 WORK SESSION 선택(열)이 새 버전을 바로 쓰도록 전환 — multiplier/sort_order는 그대로 둔다.
        const { error: selectionError } = await supabase
          .from("work_session_formula_versions")
          .update({ formula_version_id: newVersion.id })
          .eq("id", column.selectionId);
        if (selectionError) throw selectionError;

        // 재료 라인 id가 전부 바뀌므로 이 열의 기존 계량 진행상태는 더 이상 의미가 없다 — 지운다.
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("work_session_formula_version_id", column.selectionId);
        if (progressError) throw progressError;

        return newVersion.id;
      }

      if (saveMode === "new_formula") {
        // NEW_FORMULA — 기존 포뮬라는 전혀 건드리지 않고, 완전히 새로운 포뮬라 + 버전 1개를
        // 만든다. derived_from_formula_id로 "어디서 갈라져 나왔는지"만 남긴다.
        // 2026-10-21 사용자 요청: "포뮬라만 새로 만들뿐아니라, 컴포넌트도 새로 만들어서
        // 연결해야해" — COMPONENT를 원래 포뮬라와 공유하면 한 COMPONENT 아래 포뮬라가 2개가
        // 되어 "이 컴포넌트의 현재 포뮬라"가 모호해진다(CurrentFormulaPanel 등은 컴포넌트당
        // 포뮬라 1개를 전제로 가장 최근 것만 고른다). 그래서 원래 컴포넌트의 설정(계량 기준/
        // TECHNIQUE CATEGORY/기본 워크플로)을 그대로 복사한 새 COMPONENT를 만들고, 새
        // 포뮬라를 거기에 연결한다 — 원래 컴포넌트는 기존 포뮬라만 그대로 쓴다.
        const name = newFormulaName.trim();
        if (!name) throw new Error("새 포뮬라 이름을 입력해주세요");

        const { data: baseFormula, error: baseFormulaError } = await supabase
          .from("formulas")
          .select("component_id, technique_category_id, method_id")
          .eq("id", column.formulaId)
          .single();
        if (baseFormulaError) throw baseFormulaError;

        let newComponentId: string | null = null;
        if (baseFormula.component_id) {
          const { data: baseComponent, error: baseComponentError } = await supabase
            .from("components")
            .select(
              "scaling_mode, technique_category_id, default_workflow_template_id, auto_apply_default_workflow",
            )
            .eq("id", baseFormula.component_id)
            .single();
          if (baseComponentError) throw baseComponentError;

          const { data: newComponent, error: componentError } = await supabase
            .from("components")
            .insert({
              user_id,
              name,
              scaling_mode: baseComponent.scaling_mode,
              technique_category_id: baseComponent.technique_category_id,
              default_workflow_template_id: baseComponent.default_workflow_template_id,
              auto_apply_default_workflow: baseComponent.auto_apply_default_workflow,
            })
            .select("id")
            .single();
          if (componentError) throw componentError;
          newComponentId = newComponent.id;
        }

        const { data: baseVersion, error: baseError } = await supabase
          .from("formula_versions")
          .select(
            "yield_quantity, bath_water_g, basis_overrides, default_mould_id, default_base_weight_id, default_capacity_id",
          )
          .eq("id", column.formulaVersionId)
          .single();
        if (baseError) throw baseError;

        const { data: newFormula, error: formulaError } = await supabase
          .from("formulas")
          .insert({
            user_id,
            name,
            component_id: newComponentId,
            technique_category_id: baseFormula.technique_category_id,
            method_id: baseFormula.method_id,
            derived_from_formula_id: column.formulaId,
          })
          .select("id")
          .single();
        if (formulaError) throw formulaError;

        const { data: newVersion, error: insertError } = await supabase
          .from("formula_versions")
          .insert({
            user_id,
            formula_id: newFormula.id,
            version_number: 1,
            status: "CURRENT",
            default_mould_id: baseVersion.default_mould_id,
            default_base_weight_id: baseVersion.default_base_weight_id,
            // 2026-10-19 "테이블 통합" 1단계: 통합 default_capacity_id도 함께 복사(dual-write).
            default_capacity_id: baseVersion.default_capacity_id,
            yield_quantity: baseVersion.yield_quantity,
            change_summary: autoSummary,
            change_reason: reason.trim() || null,
            bath_water_g: baseVersion.bath_water_g,
            basis_overrides: baseVersion.basis_overrides ?? {},
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        const rowsToInsert = visibleRows.map((row, index) => ({
          user_id,
          formula_version_id: newVersion.id,
          ingredient_id: row.ingredientId,
          amount: Number(row.amount) || 0,
          unit: row.unit,
          sort_order: index,
          note: row.note,
          secondary_amount: row.secondaryAmount,
          secondary_unit: row.secondaryUnit,
          amount_source:
            row.originalAmount === null ||
            Number(row.amount) !== row.originalAmount ||
            row.unit !== row.originalUnit
              ? "manual"
              : "copied",
        }));
        if (rowsToInsert.length > 0) {
          const { error: ingredientsError } = await supabase
            .from("formula_version_ingredients")
            .insert(rowsToInsert);
          if (ingredientsError) throw ingredientsError;
        }

        // 이 WORK SESSION 선택(열)이 새 포뮬라의 새 버전을 바로 쓰도록 전환.
        const { error: selectionError } = await supabase
          .from("work_session_formula_versions")
          .update({ formula_version_id: newVersion.id })
          .eq("id", column.selectionId);
        if (selectionError) throw selectionError;

        // 재료 라인 id가 전부 바뀌므로 이 열의 기존 계량 진행상태는 더 이상 의미가 없다 — 지운다.
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("work_session_formula_version_id", column.selectionId);
        if (progressError) throw progressError;

        return newVersion.id;
      }

      // OVERWRITE — 지금 버전 자체를 고친다. 이 버전을 쓰는 다른 WORK SESSION/포뮬라 화면에도
      // 바로 반영되고, work_session_formula_versions는 건드리지 않는다. 양/단위가 안 바뀐
      // 재료는 라인 id가 그대로라서 그 재료의 계량 체크 상태도 그대로 유지된다 — 지운 재료만
      // 그 재료의 계량 진행상태를 같이 지운다.
      const removedRows = draftRows.filter((r) => r.removed && r.sourceId);
      for (const row of removedRows) {
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("formula_version_ingredient_id", row.sourceId as string);
        if (progressError) throw progressError;
        const { error: deleteError } = await supabase
          .from("formula_version_ingredients")
          .delete()
          .eq("id", row.sourceId as string);
        if (deleteError) throw deleteError;
      }

      const changedRows = visibleRows.filter(
        (row) =>
          row.sourceId !== null &&
          (Number(row.amount) !== row.originalAmount || row.unit !== row.originalUnit),
      );
      for (const row of changedRows) {
        const { error: updateError } = await supabase
          .from("formula_version_ingredients")
          .update({ amount: Number(row.amount) || 0, unit: row.unit, amount_source: "manual" })
          .eq("id", row.sourceId as string);
        if (updateError) throw updateError;
      }

      const newRows = visibleRows.filter((row) => row.sourceId === null);
      if (newRows.length > 0) {
        const maxSortOrder = (baseIngredients.data ?? []).reduce(
          (max, r) => Math.max(max, r.sort_order),
          -1,
        );
        const { error: insertError } = await supabase.from("formula_version_ingredients").insert(
          newRows.map((row, index) => ({
            user_id,
            formula_version_id: column.formulaVersionId,
            ingredient_id: row.ingredientId,
            amount: Number(row.amount) || 0,
            unit: row.unit,
            sort_order: maxSortOrder + 1 + index,
            note: row.note,
            secondary_amount: row.secondaryAmount,
            secondary_unit: row.secondaryUnit,
            amount_source: "manual",
          })),
        );
        if (insertError) throw insertError;
      }

      // 이 버전의 변경요약/메모도 최신 수정 내용으로 갱신한다.
      const { error: versionError } = await supabase
        .from("formula_versions")
        .update({ change_summary: autoSummary, change_reason: reason.trim() || null })
        .eq("id", column.formulaVersionId);
      if (versionError) throw versionError;

      return column.formulaVersionId;
    },
    onSuccess: async () => {
      setError(null);
      // NEW_FORMULA는 완전히 새 포뮬라 + 새 COMPONENT를 만든 것이므로, FORMULAS 목록/
      // COMPONENTS 목록/해당 COMPONENT의 포뮬라 목록 캐시도 갱신해야 다른 화면에서 바로 보인다.
      if (saveMode === "new_formula") {
        await queryClient.invalidateQueries({ queryKey: ["formulas"] });
        await queryClient.invalidateQueries({ queryKey: ["formulas_by_component"] });
        await queryClient.invalidateQueries({ queryKey: ["components"] });
      }
      await onSaved();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">
            EDIT {column.formulaName} (v{column.versionNumber})
          </span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* 2026-10-14 사용자 요청: "new 버전으로 저장할지 아니면 덮어쓸지도 선택할수 있게"
              2026-10-18 사용자 요청: "기존 formula말고 새로운 formula 생성이랑 이름도 바로
              정할수 있게해줘" — 세 번째 선택지로 완전히 새로운 포뮬라를 만드는 옵션을 추가. */}
          <div className="space-y-1">
            <p className="label-caps text-xs text-muted-foreground">저장 방식</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={saveMode === "new" ? primaryButtonClass : buttonClass}
                onClick={() => setSaveMode("new")}
              >
                새 버전으로 저장
              </button>
              <button
                type="button"
                className={saveMode === "overwrite" ? primaryButtonClass : buttonClass}
                onClick={() => setSaveMode("overwrite")}
              >
                현재 버전에 덮어쓰기
              </button>
              <button
                type="button"
                className={saveMode === "new_formula" ? primaryButtonClass : buttonClass}
                onClick={() => {
                  setSaveMode("new_formula");
                  if (!newFormulaName.trim()) setNewFormulaName(`${column.formulaName} 사본`);
                }}
              >
                새 포뮬라로 저장
              </button>
            </div>
            <p className="font-mono text-xs uppercase text-muted-foreground">
              {saveMode === "new" &&
                `현재 v${column.versionNumber}을 복사해서 새 DRAFT 버전을 만듭니다. 저장하면 이 WORK SESSION의 이 열(×${fmtNumber(column.multiplier, 0)})만 바로 새 버전을 쓰게 되고, 계량 체크는 초기화됩니다.`}
              {saveMode === "overwrite" &&
                `v${column.versionNumber} 자체를 고칩니다. 이 버전을 쓰는 다른 WORK SESSION/포뮬라에도 바로 반영되고, 양이 안 바뀐 재료의 계량 체크는 그대로 남습니다.`}
              {saveMode === "new_formula" &&
                `"${column.formulaName}"과 완전히 분리된 새 포뮬라 + 새 COMPONENT를 만듭니다. 기존 포뮬라/COMPONENT는 그대로 남고, 이 WORK SESSION의 이 열(×${fmtNumber(column.multiplier, 0)})만 새 포뮬라로 전환됩니다.`}
            </p>
            {saveMode === "new_formula" && (
              <Field label="새 포뮬라 이름">
                <input
                  className={inputClass}
                  autoFocus
                  value={newFormulaName}
                  onChange={(e) => setNewFormulaName(e.target.value)}
                  placeholder="예: 당근케익 (저당 버전)"
                />
              </Field>
            )}
          </div>

          {baseIngredients.isLoading && (
            <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
          )}

          <ul className="divide-y divide-border border border-border">
            {visibleRows.map((row) => (
              <li key={row.key} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm">{row.ingredientName}</span>
                <input
                  className={`${inputClass} !w-24 text-right`}
                  type="number"
                  step="any"
                  value={row.amount}
                  onChange={(e) => patchRow(row.key, { amount: e.target.value })}
                />
                <select
                  className={`${selectClass} !w-20`}
                  value={row.unit}
                  onChange={(e) => patchRow(row.key, { unit: e.target.value })}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="label-caps px-1 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(row.key)}
                >
                  ✕
                </button>
              </li>
            ))}
            {visibleRows.length === 0 && !baseIngredients.isLoading && (
              <li className="px-3 py-3 font-mono text-xs uppercase text-muted-foreground">
                NO INGREDIENTS
              </li>
            )}
          </ul>

          {pickingIngredient ? (
            <div className="border border-dashed border-border p-3">
              <IngredientPicker
                onPick={(ingredientId, defaultUnit) => {
                  void addIngredientRow(ingredientId, defaultUnit);
                }}
                onCancel={() => setPickingIngredient(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPickingIngredient(true)}
            >
              + 재료 추가
            </button>
          )}

          {/* 2026-10-14 사용자 요청: "서머리도 내가 적는게 아니고 자동으로 적어줘 바뀐부분" —
              직접 입력하는 CHANGE SUMMARY 칸을 없애고, 초안과 원본을 비교해서 자동으로 만든
              문구를 그대로 보여준다. */}
          <Field label="변경 요약 (자동)">
            <p className={`${inputClass} min-h-[2.25rem] text-sm leading-snug`}>{autoSummary}</p>
          </Field>
          <Field label="메모 (선택)">
            <textarea
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={
                saveChanges.isPending ||
                // NEW_FORMULA는 포뮬라를 새로 만드는 행위 자체가 목적이라, 재료를 아직 안
                // 고쳤어도(hasChanges===false) 이름만 정했으면 저장할 수 있게 한다.
                (saveMode === "new_formula" ? !newFormulaName.trim() : !hasChanges)
              }
              onClick={() => saveChanges.mutate()}
            >
              {saveMode === "new" && "새 버전으로 저장"}
              {saveMode === "overwrite" && "덮어쓰기"}
              {saveMode === "new_formula" && "새 포뮬라로 저장"}
            </button>
            <button type="button" className={buttonClass} onClick={onClose}>
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** PRODUCTION 세션이 COMPLETED로 바뀌면 나타남 — 이 세션에서 만든 Component들을 냉동 재고/판매전환으로 즉시 반영 가능(선택) */
function StockReflectSection({
  sessionId,
  rows,
}: {
  sessionId: string;
  rows: WorkSessionFormulaVersionRow[];
}) {
  const queryClient = useQueryClient();
  const [reflected, setReflected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { qty: string; reason: StockReason; unit: string }>
  >({});

  const components = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      const c = r.formula_versions.formulas.components;
      if (c) map.set(c.id, { id: c.id, name: c.name });
    }
    return [...map.values()];
  }, [rows]);

  const reflect = useMutation({
    mutationFn: async (componentId: string) => {
      const draft = drafts[componentId];
      const qty = Number(draft?.qty ?? "");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("수량을 입력하세요");
      await adjustStock({
        itemType: "COMPONENT",
        componentId,
        quantityDelta: qty,
        reason: draft?.reason ?? "PRODUCTION_FREEZE",
        workSessionId: sessionId,
        unitLabel: draft?.unit || "개",
      });
    },
    onSuccess: async (_r, componentId) => {
      setReflected((prev) => new Set(prev).add(componentId));
      await queryClient.invalidateQueries({ queryKey: ["stock_items"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (components.length === 0) return null;

  return (
    <SectionCard title="재고 반영 (선택)">
      <p className="mb-3 font-mono text-xs uppercase text-muted-foreground">
        이번 세션에서 만든 COMPONENT를 냉동 재고로 보내거나 바로 판매전환할 수 있습니다. 건너뛰고
        나중에 INVENTORY 탭에서 수동으로 입력해도 됩니다.
      </p>
      <ul className="space-y-3">
        {components.map((c) => {
          const draft = drafts[c.id] ?? {
            qty: "",
            reason: "PRODUCTION_FREEZE" as StockReason,
            unit: "개",
          };
          const done = reflected.has(c.id);
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 border-b border-dashed border-border pb-2"
            >
              <span className="min-w-[160px] text-sm">{c.name}</span>
              {done ? (
                <span className="font-mono text-xs text-muted-foreground">반영 완료</span>
              ) : (
                <>
                  <input
                    className={inputClass + " !w-24"}
                    placeholder="수량"
                    value={draft.qty}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [c.id]: { ...draft, qty: e.target.value } }))
                    }
                  />
                  <input
                    className={inputClass + " !w-20"}
                    placeholder="단위"
                    value={draft.unit}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [c.id]: { ...draft, unit: e.target.value } }))
                    }
                  />
                  <select
                    className={selectClass + " w-auto"}
                    value={draft.reason}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [c.id]: { ...draft, reason: e.target.value as StockReason },
                      }))
                    }
                  >
                    <option value="PRODUCTION_FREEZE">
                      {STOCK_REASON_LABEL.PRODUCTION_FREEZE}
                    </option>
                    <option value="PRODUCTION_SALE">{STOCK_REASON_LABEL.PRODUCTION_SALE}</option>
                  </select>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={reflect.isPending}
                    onClick={() => reflect.mutate(c.id)}
                  >
                    반영
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 font-mono text-xs text-destructive">{error}</p>}
    </SectionCard>
  );
}
