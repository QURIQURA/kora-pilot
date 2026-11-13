import { ensureStandardProfile } from "@/lib/standard-profile";
import { parseComponentPlan } from "@/lib/order-component-plan";
import { openEditorOnMount } from "@/lib/open-editor-on-mount";
import { invalidateProductionSync } from "@/lib/production-sync";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  currentUserId,
  formulasQuery,
  formulaExperimentsQuery,
  mouldsQuery,
  productsQuery,
  cakeSizesQuery,
  techniqueCategoriesQuery,
  versionIngredientsBulkQuery,
  versionIngredientsQuery,
  workSessionChildSelectionsQuery,
  workSessionFormulaVersionsQuery,
  workSessionMultiplierHistoryQuery,
  workSessionProgressQuery,
  workSessionQuery,
  workSessionTaskIngredientsQuery,
  workSessionTaskPredecessorsQuery,
  workSessionTasksQuery,
  type CoreSlot,
  type DashboardComponentRow,
  type VersionIngredientRow,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import {
  applySavedQuantities,
  groupProductionSelections,
  rescaleProductionSelections,
} from "@/lib/production-quantity";
import { resolveSlotGroup } from "@/lib/technique";
import { mouldAbbr, mouldQty } from "@/lib/component-size";
import { AdjustInput, ScaleAllPanel } from "@/components/pilot/RecipeScaleControls";
import { round2, type ScaleMode } from "@/lib/recipe-scale";
import { ExperimentCard } from "@/components/pilot/FormulaExperimentsTab";
import { fmtNumber, toGrams, versionLabel, UNITS, type Mould } from "@/lib/formula";
import { formatProductSizeLabel } from "@/lib/product-size";
import { IngredientPicker } from "@/components/pilot/IngredientPicker";
import { formatDateTime } from "@/lib/datetime";
import {
  buildMultiplierSnapshot,
  buildWeighingGroups,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  workingAmount,
  sumBaseGrams,
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
  rowIds,
}: {
  sessionId: string;
  embedded?: boolean;
  /** embedded일 때 이 선택(컴포넌트 행)들만 WORK VIEW / ADJUST QUANTITY에 보여준다 — 대시보드의 선택한 날짜 기준. */
  rowIds?: string[];
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
    // 생산량 변경을 대시보드 작업 대기공간에도 반영
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

  const visibleRows = useMemo(
    () => (embedded && rowIds ? rows.filter((r) => rowIds.includes(r.id)) : rows),
    [embedded, rowIds, rows],
  );
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
      [...visibleRows]
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
    [visibleRows],
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

  // 2026-10-22: 오더에 연결된 세션의 상세 페이지는 PRODUCTION 대시보드 입력을 비추는 읽기 전용 미러 —
  // 컴포넌트/계량/WORKFLOW는 대시보드에서만 입력하고, NOTES·일정·EFFICIENCY·재고반영은 여기서도 편집.
  const mirror = !embedded && Boolean(data.order_id);
  const lock = (node: React.ReactNode) =>
    mirror ? (
      <fieldset disabled className="m-0 min-w-0 border-0 p-0">
        {node}
      </fieldset>
    ) : (
      node
    );

  return (
    <div className={embedded ? "flex flex-col gap-3" : "space-y-3"}>
      {mirror && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-secondary px-3 py-2 font-mono text-[11px]">
          <span>
            오더에 연결된 세션이에요 — 생산 수량·계량·WORKFLOW는 PRODUCTION 대시보드에서 입력하고
            여기선 보기만 해요.
          </span>
          <Link to="/production" className="label-caps underline">
            OPEN PRODUCTION →
          </Link>
        </div>
      )}
      {/* 대시보드(embedded)에서는 세션 이름/상태/생성일 헤더를 숨긴다(2026-10-22 사용자 요청). */}
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4 order-0">
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
      )}

      {!embedded && (
        <WorkScheduleSection
          scheduledDate={data.scheduled_date}
          scheduledStartTime={data.scheduled_start_time}
          scheduledEndTime={data.scheduled_end_time}
          onSave={(patch) => updateSession.mutate(patch)}
        />
      )}

      {!embedded && (
        <ProductionEfficiencyLinkSection
          productId={data.product_id}
          productSizeId={data.product_size_id}
          cakeSizeId={data.cake_size_id}
          targetUnitCount={data.target_unit_count}
          onSave={(patch) => updateSession.mutate(patch)}
        />
      )}

      {!embedded && (
        <SectionCard title="COMPONENTS · 생산 수량">
          {lock(
            <ul className="divide-y divide-border border border-border">
              {rows.map((row) => (
                <FormulaVersionRow
                  key={row.id}
                  row={row}
                  sessionId={sessionId}
                  lines={ingredientsByVersion[row.formula_version_id] ?? []}
                />
              ))}
            </ul>,
          )}
        </SectionCard>
      )}

      <div className={embedded ? "hidden" : "order-1"}>
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
            <FormulaView rows={visibleRows} ingredientsByVersion={ingredientsByVersion} />
          )}
        </SectionCard>
      </div>

      {/* 2026-09-30: WORKFLOW은 WORK VIEW 탭에서 분리해서 아래 별도 박스로 뺐다. 2026-10-22: 대시보드
          (embedded)에서는 타임라인이 TASK 목록 역할을 하므로 숨기고, 상세는 BlockTaskDetails가 맡는다. */}
      {!embedded && (
        <SectionCard title="WORKFLOW">
          {lock(
            <WorkflowView
              sessionId={sessionId}
              tasks={tasks.data ?? []}
              formulaOptions={orderedSelections.map((s) => ({
                formulaVersionId: s.formulaVersionId,
                formulaName: s.formulaName,
                multiplier: s.multiplier,
              }))}
              ingredientsByVersion={ingredientsByVersion}
              taskIngredients={taskIngredients.data ?? {}}
              taskPredecessors={taskPredecessors.data ?? {}}
              onTasksChanged={invalidateTasks}
              onTaskStarted={ensureSessionStartedAt}
              showEfficiencyFields={Boolean(data.product_id)}
            />,
          )}
        </SectionCard>
      )}

      <div className="order-4">
        <SectionCard title={`세션 전체 메모 · ${data.name}`}>
          <NotesEditor
            value={data.notes ?? ""}
            onSave={(notes) => updateSession.mutate({ notes })}
          />
        </SectionCard>
      </div>

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
  cakeSizeId,
  targetUnitCount,
  onSave,
}: {
  productId: string | null;
  productSizeId: string | null;
  cakeSizeId: string | null;
  targetUnitCount: number | null;
  onSave: (patch: TablesUpdate<"work_sessions">) => void;
}) {
  const products = useQuery(productsQuery());
  const standards = useQuery(cakeSizesQuery());
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [batchDraft, setBatchDraft] = useState(
    targetUnitCount != null ? String(targetUnitCount) : "",
  );
  useEffect(() => {
    setBatchDraft(targetUnitCount != null ? String(targetUnitCount) : "");
  }, [targetUnitCount]);

  return (
    <SectionCard title="제품 / 공용 완성 규격 (EFFICIENCY)">
      {sizeError && (
        <p role="alert" className="text-xs text-destructive">
          {sizeError}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="PRODUCT">
          <select
            className={selectClass + " !w-56"}
            value={productId ?? ""}
            onChange={(e) => {
              setSizeError(null);
              onSave({
                product_id: e.target.value || null,
                product_size_id: null,
                cake_size_id: null,
              });
            }}
          >
            <option value="">— 연결 안 함(순수 계량 세션) —</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {productId && (standards.data ?? []).length > 0 && (
          <Field label="공용 완성 규격">
            <select
              className={selectClass + " !w-56"}
              value={cakeSizeId ?? ""}
              onChange={async (e) => {
                const id = e.target.value;
                try {
                  const profile = await ensureStandardProfile(productId, id, productSizeId);
                  setSizeError(null);
                  onSave({ product_size_id: profile, cake_size_id: id || null });
                } catch (error) {
                  setSizeError((error as Error).message);
                }
              }}
            >
              <option value="">미지정</option>
              {(standards.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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

export function AddFormulaVersionForm({
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
  onDone: (createdId?: string) => void;
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
  const [formulaId, setFormulaId] = useState("");
  const [versionId, setVersionId] = useState("");
  // 추가는 ×1로 하고, 배수·몰드·재료 기준 설정은 추가 직후 열리는 수정 창에서 한다.
  const planMultiplier = "1";
  const planTarget = "";
  const formula = formulaList.find((f) => f.id === formulaId) ?? null;
  const versionOptions = [...(formula?.formula_versions ?? [])].sort(
    (a, b) => b.version_number - a.version_number,
  );
  const selectedVersion = versionOptions.find((v) => v.id === versionId) ?? null;
  const scalingMode = formula?.components?.scaling_mode ?? null;
  // 2026-11-06: 배수를 정할 때 기준이 되도록 이 버전의 ×1 총 중량과(SHEET면) 기본 몰드·기준중량을 보여준다.
  const baseIngredients = useQuery(versionIngredientsQuery(versionId || null));
  const allMoulds = useQuery(mouldsQuery());
  const baseTotal = (baseIngredients.data ?? []).reduce(
    (sum, row) => sum + (toGrams(Number(row.amount), row.unit) ?? 0),
    0,
  );
  const hasNonWeight = (baseIngredients.data ?? []).some(
    (row) => toGrams(Number(row.amount), row.unit) == null,
  );
  const baseMould =
    (slot === "SHEET" || scalingMode === "MOULD") && selectedVersion?.default_mould_id
      ? ((allMoulds.data ?? []).find((m) => m.id === selectedVersion.default_mould_id) ?? null)
      : null;
  const multiplierNum = Number(planMultiplier);

  const add = useMutation({
    mutationFn: async () => {
      if (!versionId) throw new Error("Select a formula version");
      const plan = parseComponentPlan(planMultiplier, planTarget);
      // 2026-10-07 사용자 요청: 같은 FORMULA VERSION도 이 WORK SESSION에 중복으로 추가할 수
      // 있다(예: 같은 레시피를 다른 몰드/배치로 각각) — 더 이상 막지 않는다.
      const user_id = await currentUserId();
      const { data: created, error } = await supabase
        .from("work_session_formula_versions")
        .insert({
          user_id,
          work_session_id: sessionId,
          formula_version_id: versionId,
          // New selections start at one recipe batch. Only ADJUST QUANTITY changes the multiplier.
          multiplier: plan.multiplier,
          target_quantity_g: plan.target_quantity_g,
          version_pinned: true,
          mould_id: scalingMode === "MOULD" ? (selectedVersion?.default_mould_id ?? null) : null,
          mould_qty: null,
          capacity_id: scalingMode === "MOULD" ? (selectedVersion?.default_mould_id ?? null) : null,
          capacity_qty: null,
          sort_order: nextSort,
          kind,
          slot,
        })
        .select("id")
        .single();
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
      return created.id;
    },
    onSuccess: async (createdId) => {
      // 추가 직후 그 컴포넌트의 "입력 방식" 설정이 바로 열리게 한다(몰드/기본중량/배수/재료 기준).
      openEditorOnMount.add(createdId);
      onDone(createdId);
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      {versionId && (
        <div className="space-y-0.5 border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
          {baseIngredients.isLoading ? (
            <p className="text-muted-foreground">기본 레시피 불러오는 중…</p>
          ) : (
            <>
              <p>
                기본 레시피 ×1 = <b className="text-sm">{fmtNumber(baseTotal, 0)}g</b>
                {hasNonWeight && (
                  <span className="text-muted-foreground"> (g로 환산 안 되는 재료 제외)</span>
                )}
                {Number.isFinite(multiplierNum) && multiplierNum > 0 && multiplierNum !== 1 && (
                  <span className="text-muted-foreground">
                    {" "}
                    → ×{fmtNumber(multiplierNum, 2)} = {fmtNumber(baseTotal * multiplierNum, 0)}g
                  </span>
                )}
              </p>
              {baseMould ? (
                <p>
                  기본 몰드 {mouldAbbr(baseMould)}
                  {baseMould.reference_weight_g != null
                    ? ` · 몰드 1개 기준중량 ${fmtNumber(Number(baseMould.reference_weight_g), 0)}g (이 레시피 ×1 = 몰드 1개분)`
                    : " · 기준중량 미설정"}
                </p>
              ) : (
                slot === "SHEET" && (
                  <p className="text-muted-foreground">이 버전에 기본 몰드가 지정돼 있지 않아요</p>
                )
              )}
            </>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ADD를 누르면 ×1로 추가되고, 입력 방식(몰드·기본중량·배수·재료 기준) 설정이 바로 열려요. 이
        주문의 계획으로 저장되며 다른 화면에도 같은 계획이 표시됩니다.
      </p>
      {add.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(add.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={add.isPending}>
          ADD
        </button>
        <button type="button" className={buttonClass} onClick={() => onDone()}>
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
}: {
  row: WorkSessionFormulaVersionRow;
  sessionId: string;
  lines: VersionIngredientRow[];
}) {
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({
    ...workSessionMultiplierHistoryQuery(sessionId, row.id),
    enabled: showHistory,
  });
  return (
    <li className="space-y-2 px-3 py-2">
      <ProductionQuantityRow
        members={[{ ...row, sessionId }]}
        lines={lines}
        canMerge={false}
        onToggleMerge={() => {}}
        labels={{}}
      />
      <button type="button" className={buttonClass} onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? "HIDE HISTORY" : "HISTORY"}
      </button>
      {showHistory && (
        <ul className="space-y-1 border border-dashed border-border p-2">
          {(history.data ?? []).length === 0 ? (
            <li className="text-xs text-muted-foreground">NO MULTIPLIER CHANGES YET</li>
          ) : (
            (history.data ?? []).map((h) => (
              <li key={h.id} className="font-mono text-xs text-muted-foreground">
                {formatDateTime(h.applied_at)} · ×{fmtNumber(Number(h.previous_multiplier), 3)} → ×
                {fmtNumber(Number(h.applied_multiplier), 3)}
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
  /** 여러 세션을 한 표에 합칠 때(대시보드 DayWorkView) 이 열이 속한 세션 */
  sessionId?: string;
  members?: { selectionId: string; sessionId: string; label?: string }[];
  /** Pastry Base(SHEET) — 적용 몰드와 개수(합쳐진 열이면 같은 몰드끼리 합산) */
  slot?: string | null;
  mouldId?: string | null;
  mouldQty?: number | null;
  /** 레시피 기본 몰드 — 몰드 개수가 비어 있을 때 배수에서 거꾸로 계산하는 데 사용 */
  baseMouldId?: string | null;
  /** 블렌드(합성) 포뮬라의 원본별 하위 열 — 같은 groupKey(부모 선택 id)끼리 맨 위 제목 열로 묶는다 */
  groupKey?: string;
  groupLabel?: string;
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
  onEditColumn?: (column: WeighingColumn) => void;
}) {
  const mouldsForTotal = useQuery(mouldsQuery());
  const mouldById = new Map((mouldsForTotal.data ?? []).map((m) => [m.id, m]));
  const rndExperiments = useQuery(formulaExperimentsQuery());
  const rndVersionIds = new Set(
    (rndExperiments.data ?? []).filter((x) => x.status === "OPEN").map((x) => x.version_id),
  );
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
              <th className="label-caps sticky left-0 top-0 z-30 relative bg-secondary px-3 py-2 text-right text-xs text-muted-foreground shadow-[inset_0_-1px_0_0_var(--color-border),inset_-1px_0_0_0_var(--color-border)]">
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
                    formulaId={col.formulaId}
                    versionId={col.formulaVersionId}
                    multiplier={col.multiplier}
                    rnd={rndVersionIds.has(col.formulaVersionId)}
                    groupLabel={col.groupKey ? (col.groupLabel ?? "") : undefined}
                    groupFirst={
                      Boolean(col.groupKey) &&
                      displayColumns[displayColumns.indexOf(col) - 1]?.groupKey !== col.groupKey
                    }
                    onResizeStart={(clientX) => startColumnResize(col.selectionId, clientX)}
                    onEdit={
                      !onEditColumn || col.groupKey || (col.members && col.members.length > 1)
                        ? undefined
                        : () => onEditColumn(col)
                    }
                  />
                ))}
              </SortableContext>
              <th
                key={MATRIX_FILLER_COL_ID}
                className="sticky top-0 z-20 bg-secondary shadow-[inset_0_-1px_0_0_var(--color-border),inset_1px_0_0_0_var(--color-border)]"
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
          {displayColumns.some((c) => c.slot === "SHEET" && c.mouldId) && (
            <tr>
              <th className="label-caps sticky left-0 z-10 border-t border-r border-border bg-secondary px-3 py-1 text-right text-[11px] text-muted-foreground">
                MOULD
              </th>
              {displayColumns.map((col) => {
                const m = col.slot === "SHEET" && col.mouldId ? mouldById.get(col.mouldId) : null;
                const baseM = col.baseMouldId ? mouldById.get(col.baseMouldId) : null;
                const qty =
                  col.mouldQty ?? (m && baseM ? mouldQty(col.multiplier, baseM, m) : null);
                // R&D 실험은 레시피 양을 직접 바꾸므로 몰드 기준중량이 아니라 아래 TOTAL을 몰드 개수로 나눈 실제 중량을 쓴다.
                const isRnd = rndVersionIds.has(col.formulaVersionId);
                const rndTotal = totalsByColumn[col.selectionId] ?? 0;
                const refG =
                  isRnd && qty != null && qty > 0 && rndTotal > 0
                    ? rndTotal / qty
                    : m?.reference_weight_g != null
                      ? Number(m.reference_weight_g)
                      : null;
                return (
                  <td
                    key={col.selectionId}
                    className="border-t border-l border-border bg-secondary px-2 py-1 text-left font-mono text-[11px] tabular-nums text-muted-foreground"
                  >
                    {m ? (
                      <>
                        {mouldAbbr(m)}
                        {refG != null && ` (${fmtNumber(refG, 0)}g)`}
                        {qty != null && ` ×${fmtNumber(qty, 2)}`}
                        {refG != null && qty != null && (
                          <span className="block text-[10px]">
                            ≈ {fmtNumber(refG * qty, 0)}g{isRnd ? " (R&D 실제)" : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
              <td className="border-t border-l border-border bg-secondary" />
            </tr>
          )}
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

/** 표시용 배수(k)를 곱해 보여주고, 입력하면 기본(×1) 양으로 되돌려 저장하는 숫자 입력 — 입력 중에는 글자 그대로 둔다. */
function ScaledAmountInput({
  value,
  k,
  onChange,
  className,
}: {
  value: string;
  k: number;
  onChange: (baseValue: string) => void;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const num = Number(value);
  const shown =
    value === "" || !Number.isFinite(num) || k === 1
      ? value
      : String(Math.round(num * k * 100) / 100);
  return (
    <input
      className={className}
      type="number"
      step="any"
      value={text ?? shown}
      onFocus={() => setText(shown)}
      onBlur={() => setText(null)}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value;
        onChange(
          v === "" || k === 1 || !Number.isFinite(Number(v))
            ? v
            : String(Math.round((Number(v) / k) * 1e6) / 1e6),
        );
      }}
    />
  );
}

function MatrixColumnHeader({
  id,
  formulaName,
  formulaId,
  versionId,
  multiplier,
  rnd,
  groupLabel,
  groupFirst = false,
  onResizeStart,
  onEdit,
}: {
  id: string;
  /** 블렌드(합성) 포뮬라의 원본 열이면 묶음 제목 — 첫 열에만 글자를 그리고 모든 원본 열 위에 같은 색 띠를 둔다 */
  groupLabel?: string | undefined;
  groupFirst?: boolean;
  formulaName: string;
  formulaId: string;
  versionId: string;
  multiplier: number;
  /** R&D 실험 중인 버전 — 연두색으로 구분 */
  rnd: boolean;
  onResizeStart: (clientX: number) => void;
  onEdit: (() => void) | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "sticky top-0 z-20 relative bg-secondary px-3 py-2 text-left align-bottom",
        groupLabel !== undefined
          ? "shadow-[inset_0_3px_0_0_var(--color-foreground),inset_0_-1px_0_0_var(--color-border),inset_1px_0_0_0_var(--color-border)] pt-8"
          : "shadow-[inset_0_-1px_0_0_var(--color-border),inset_1px_0_0_0_var(--color-border)]",
        groupFirst && "z-[25]",
        rnd && "!bg-[#DCF0C8]",
        isDragging && "z-40 bg-secondary",
      )}
    >
      {groupFirst && (
        <span className="label-caps pointer-events-none absolute left-3 top-1.5 whitespace-nowrap text-[11px] font-semibold text-foreground">
          🔗 {groupLabel} · BLEND
        </span>
      )}
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
          <p className="whitespace-nowrap text-xs leading-tight">
            {rnd && <span className="label-caps mr-1 text-[10px] text-[#3F7A1F]">🧪 R&amp;D</span>}
            <Link
              to="/formulas/$formulaId"
              params={{ formulaId }}
              search={{ version: versionId }}
              className="underline-offset-2 hover:underline"
              title="포뮬라 페이지 열기"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {formulaName}
            </Link>
          </p>
          <p className="label-caps whitespace-nowrap text-[11px] text-muted-foreground">
            ×{fmtNumber(multiplier, 3)}
          </p>
        </div>
        {/* 2026-10-14 사용자 요청: "work session에서 재료 추가하고 추가된 재료로 새로운 버전
            포뮬라 추가 하는버튼" — 포뮬라 페이지로 이동하지 않고 이 열의 레시피를 바로
            수정/새 버전 저장할 수 있게 하는 진입점. */}
        {!rnd && (
          <button
            type="button"
            className="label-caps shrink-0 px-1 py-0.5 text-[10px] text-muted-foreground hover:border hover:border-border hover:text-foreground"
            onClick={onEdit}
            disabled={!onEdit}
            title={!onEdit ? "UNMERGE 후 개별 레시피를 수정하세요" : undefined}
          >
            EDIT
          </button>
        )}
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
              <WeighingMatrixCell
                sessionId={col.sessionId ?? sessionId}
                cell={cell}
                onChanged={onProgressChanged}
              />
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
        (
          cell.members ?? [
            {
              selectionId: cell.selectionId,
              sessionId,
              status: cell.progressStatus,
              note: cell.note,
            },
          ]
        ).map((member) => ({
          user_id,
          work_session_id: member.sessionId,
          work_session_formula_version_id: member.selectionId,
          formula_version_ingredient_id: cell.ingredientLineId,
          status: patch.status ?? member.status,
          note: patch.note !== undefined ? patch.note : member.note,
        })),
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
      className={`relative flex flex-wrap min-w-[110px] items-center justify-between gap-2 rounded-sm px-1 py-1 ${STATUS_CELL_TONE[cell.progressStatus]}`}
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
      {cell.lineNote && (
        <p
          className="basis-full text-[11px] leading-tight text-muted-foreground"
          title={cell.lineNote}
        >
          💬 {cell.lineNote}
        </p>
      )}
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
      note?: string | null;
      ingredients: { name: string; name_en: string | null };
    }[]
  >;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const lines = ingredientsByVersion[row.formula_version_id] ?? [];
        const multiplier = Number(row.multiplier);
        return (
          <div key={row.id} className="border border-border">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <span className="label-caps text-sm">
                {row.formula_versions.formulas.name} ·{" "}
                {versionLabel(row.formula_versions.version_number)}
                {multiplier !== 1 ? ` · ×${fmtNumber(multiplier, 3)}` : ""}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm">
                    {line.ingredients.name_en
                      ? `${line.ingredients.name} (${line.ingredients.name_en})`
                      : line.ingredients.name}
                    {line.note?.trim() && (
                      <span className="block text-xs text-muted-foreground">
                        💬 {line.note.trim()}
                      </span>
                    )}
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
  /** 저장된 값 — 개수 표기만 바뀌어도 저장 대상이 되게 비교용 */
  originalSecondaryAmount?: number | null;
  originalSecondaryUnit?: string | null;
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
  inline = false,
}: {
  column: WeighingColumn;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** WORK VIEW 아래에 항상 떠 있는 R&D 편집기 — 팝업이 아니라 페이지 안에 그대로 그리고, 저장은 실험 버전 덮어쓰기로 고정 */
  inline?: boolean;
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
  // R&D 실험 중인 DRAFT 버전이면 기본이 "덮어쓰기" — 실험 버전 자체를 바로 고치는 게 자연스럽다.
  const experiments = useQuery(formulaExperimentsQuery());
  const runningExperiment = (experiments.data ?? []).find(
    (x) => x.status === "OPEN" && x.version_id === column.formulaVersionId,
  );
  const [saveModeChoice, setSaveMode] = useState<"new" | "overwrite" | "new_formula" | null>(null);
  const saveMode = inline
    ? "overwrite"
    : (saveModeChoice ?? (runningExperiment ? "overwrite" : "new"));
  const [newFormulaName, setNewFormulaName] = useState("");
  const [reason, setReason] = useState("");
  const [targetSelectionId, setTargetSelectionId] = useState(column.selectionId);
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
        originalSecondaryAmount: row.secondary_amount,
        originalSecondaryUnit: row.secondary_unit,
        removed: false,
      })),
    );
    // 기준 재료 기본값 — 계란 계열(전란/흰자/노른자)이면 그걸로. 개수가 적혀 있는 걸 우선.
    const eggs = baseIngredients.data.filter((r) =>
      /계란|전란|흰자|노른자|egg/i.test(`${r.ingredients.name} ${r.ingredients.name_en ?? ""}`),
    );
    const pick = eggs.find((r) => r.secondary_amount != null) ?? eggs[0];
    setAnchorKey((prev) =>
      prev && baseIngredients.data.some((r) => r.id === prev) ? prev : pick ? pick.id : null,
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
  // 재료 대치 — 고른 여러 재료(예: 쌀가루+옥수수전분)를 하나(예: 콜스 글루텐프리 가루)로 합쳐 같은 총량으로 바꾼다.
  const [openTools, setOpenTools] = useState<Set<"anchor" | "scale" | "replace" | "shortage">>(
    () => new Set(),
  );
  const [replaceSel, setReplaceSel] = useState<Set<string>>(() => new Set());
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceIngredients = async (ingredientId: string) => {
    const sel = visibleRows.filter((r) => replaceSel.has(r.key));
    if (sel.length === 0) return;
    const grams = sel.map((r) => toGrams(Number(r.amount) || 0, r.unit));
    if (grams.some((g) => g == null)) {
      setReplaceError("g으로 환산할 수 없는 단위의 재료가 있어요.");
      return;
    }
    const total = round2(grams.reduce<number>((sum, g) => sum + (g ?? 0), 0));
    pushUndo();
    const { data } = await supabase
      .from("ingredients")
      .select("name, name_en")
      .eq("id", ingredientId)
      .single();
    const name = data ? (data.name_en ? `${data.name} (${data.name_en})` : data.name) : "…";
    setDraftRows((prev) => {
      const existing = prev.find(
        (r) => !r.removed && r.ingredientId === ingredientId && !replaceSel.has(r.key),
      );
      const kept = prev
        .filter((r) => !(replaceSel.has(r.key) && r.sourceId === null))
        .map((r) => (replaceSel.has(r.key) ? { ...r, removed: true } : r));
      if (existing) {
        const base = toGrams(Number(existing.amount) || 0, existing.unit) ?? 0;
        return kept.map((r) =>
          r.key === existing.key
            ? { ...r, amount: String(round2(base + total)), unit: "g", secondaryAmount: null }
            : r,
        );
      }
      return [
        ...kept,
        {
          key: `new-${ingredientId}-${Date.now()}`,
          sourceId: null,
          ingredientId,
          ingredientName: name,
          unit: "g",
          amount: String(total),
          originalAmount: null,
          originalUnit: null,
          note: null,
          secondaryAmount: null,
          secondaryUnit: null,
          removed: false,
        },
      ];
    });
    setReplaceSel(new Set());
    setOpenTools((prev) => {
      const next = new Set(prev);
      next.delete("replace");
      return next;
    });
    setReplaceError(null);
  };
  // 부족 재료 대치 — 없는 재료 하나를 다른 재료 여러 개(양을 나눠서)로 바꾼다. 예: 요거트 → 코코넛요거트 85 + 유청 나머지.
  const [shortKey, setShortKey] = useState<string | null>(null);
  // 표시 기준 — 기본(true=생산량 ×배수, false=기본 레시피 ×1). 저장되는 값은 항상 기본(×1) 양이다.
  const [viewProd, setViewProd] = useState(true);
  const viewK = viewProd ? column.multiplier : 1;
  const shortBasis = viewProd ? "prod" : "base";
  const [shortSubs, setShortSubs] = useState<
    { id: string; ingredientId: string; name: string; amount: string; rest: boolean }[]
  >([]);
  const [shortPicking, setShortPicking] = useState(false);
  // 입력 단위 — g(양) 또는 %(원래 재료 양에 대한 비율). 예: 요거트 → 탈지분유 22% + 물 나머지.
  const [shortUnit, setShortUnit] = useState<"g" | "pct">("g");
  const [shortError, setShortError] = useState<string | null>(null);
  const shortRow = shortKey ? visibleRows.find((r) => r.key === shortKey) : undefined;
  const shortTotalBase = shortRow ? (toGrams(Number(shortRow.amount) || 0, shortRow.unit) ?? 0) : 0;
  // 입력 기준(기본 ×1 / 생산량 ×배수) → 기본 레시피 g로 환산
  const shortFactor = shortBasis === "prod" ? 1 / Math.max(column.multiplier, 1e-9) : 1;
  const shortSubBase = (x: { amount: string }) =>
    shortUnit === "pct"
      ? (shortTotalBase * (Number(x.amount) || 0)) / 100
      : (Number(x.amount) || 0) * shortFactor;
  const shortFixedBase = shortSubs
    .filter((x) => !x.rest)
    .reduce((sum, x) => sum + shortSubBase(x), 0);
  const shortRestBase = round2(shortTotalBase - shortFixedBase);
  const resetShortage = () => {
    setShortKey(null);
    setShortSubs([]);
    setShortPicking(false);
    setShortError(null);
    setShortUnit("g");
  };
  // 재료 대치 도구를 적용하기 직전 상태를 쌓아 두고 "되돌리기"로 한 단계씩 복구한다.
  const [undoStack, setUndoStack] = useState<(typeof draftRows)[]>([]);
  const pushUndo = () => setUndoStack((st) => [...st.slice(-9), draftRows]);
  const applyShortage = () => {
    if (!shortRow || shortSubs.length === 0) return;
    const restCount = shortSubs.filter((x) => x.rest).length;
    if (restCount > 1) {
      setShortError("'나머지'는 한 재료에만 지정할 수 있어요.");
      return;
    }
    if (shortRestBase < 0) {
      setShortError("대치 재료 합계가 원래 양보다 많아요.");
      return;
    }
    pushUndo();
    const grams = shortSubs.map((x) => (x.rest ? shortRestBase : round2(shortSubBase(x))));
    setDraftRows((prev) => {
      let next = prev.map((r) => (r.key === shortRow.key ? { ...r, removed: true } : r));
      // 새로 추가한 행(sourceId 없음)은 그냥 지운다.
      next = next.filter((r) => !(r.key === shortRow.key && r.sourceId === null));
      shortSubs.forEach((x, i) => {
        const g = grams[i] ?? 0;
        if (g <= 0) return;
        const existing = next.find((r) => !r.removed && r.ingredientId === x.ingredientId);
        if (existing) {
          const base = toGrams(Number(existing.amount) || 0, existing.unit) ?? 0;
          next = next.map((r) =>
            r.key === existing.key
              ? { ...r, amount: String(round2(base + g)), unit: "g", secondaryAmount: null }
              : r,
          );
        } else {
          next = [
            ...next,
            {
              key: `new-${x.ingredientId}-${Date.now()}-${i}`,
              sourceId: null,
              ingredientId: x.ingredientId,
              ingredientName: x.name,
              unit: "g",
              amount: String(g),
              originalAmount: null,
              originalUnit: null,
              note: `${shortRow.ingredientName} 대치`,
              secondaryAmount: null,
              secondaryUnit: null,
              removed: false,
            },
          ];
        }
      });
      return next;
    });
    resetShortage();
    setOpenTools((prev) => new Set([...prev].filter((t) => t !== "shortage")));
  };
  const [moreKeys, setMoreKeys] = useState<Set<string>>(() => new Set());
  // 기준 재료(예: 계란) 개수를 ±1 하면 🔗 연동된 재료가 같은 비율로 같이 바뀐다. 🔒 고정한 재료는 그대로.
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(() => new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  // 레시피는 기본 몰드(6″) 기준으로 저장되지만 지금 만드는 건 8″ — 기준 재료 개수는 이 열의 몰드 1개 기준으로
  // 보여 주고(+1 = 8″ 케이크 1개당 계란 1알), 레시피에는 몰드 비율만큼(6″는 0.5알) 소수점으로 반영한다.
  const mouldsForAnchor = useQuery(mouldsQuery());
  const [anchorMouldChoice, setAnchorMouldChoice] = useState<string | null>(null);
  const anchorMouldOptions = (mouldsForAnchor.data ?? []).filter(
    (m) => m.reference_weight_g != null && Number(m.reference_weight_g) > 0,
  );
  const anchorMouldId = anchorMouldChoice ?? column.mouldId ?? column.baseMouldId ?? "";
  const anchorMouldK = (() => {
    const list = mouldsForAnchor.data ?? [];
    const t = anchorMouldId ? list.find((m) => m.id === anchorMouldId) : null;
    const b = column.baseMouldId ? list.find((m) => m.id === column.baseMouldId) : null;
    const tw = t?.reference_weight_g != null ? Number(t.reference_weight_g) : 0;
    const bw = b?.reference_weight_g != null ? Number(b.reference_weight_g) : 0;
    return tw > 0 && bw > 0 ? { k: tw / bw, t, b } : null;
  })();
  const anchorK = anchorMouldK?.k ?? 1;
  const anchorRow = draftRows.find((r) => r.key === anchorKey && !r.removed) ?? null;
  const anchorCount =
    anchorRow?.secondaryAmount != null && anchorRow.secondaryAmount > 0
      ? anchorRow.secondaryAmount
      : null;
  const stepAnchor = (delta: number) => {
    if (!anchorRow || anchorCount == null) return;
    const next = anchorCount + delta / anchorK;
    if (next <= 0) return;
    const factor = next / anchorCount;
    setDraftRows((prev) =>
      prev.map((r) => {
        const amount = Number(r.amount);
        const isAnchor = r.key === anchorRow.key;
        if (r.removed || r.unit === "%" || !(amount > 0)) return r;
        if (!isAnchor && lockedKeys.has(r.key)) return r;
        return {
          ...r,
          amount: String(round2(amount * factor)),
          secondaryAmount: isAnchor
            ? next
            : r.secondaryAmount != null
              ? round2(r.secondaryAmount * factor)
              : null,
        };
      }),
    );
  };
  const [scaleMode, setScaleMode] = useState<ScaleMode>("FACTOR");
  const [scaleValue, setScaleValue] = useState("");
  const currentTotal = visibleRows.reduce(
    (sum, r) => sum + (toGrams(Number(r.amount) || 0, r.unit) ?? 0),
    0,
  );
  /** 모든 재료(단위 %는 제외)에 같은 배수를 곱한다 — 보조 계량(개수)도 같은 비율로 */
  const applyScaleAll = (factor: number) => {
    setDraftRows((prev) =>
      prev.map((r) => {
        const amount = Number(r.amount);
        if (r.removed || r.unit === "%" || !(amount > 0) || lockedKeys.has(r.key)) return r;
        return {
          ...r,
          amount: String(round2(amount * factor)),
          secondaryAmount:
            r.secondaryAmount != null ? round2(Number(r.secondaryAmount) * factor) : null,
        };
      }),
    );
  };
  const autoSummary = useMemo(() => buildAutoSummary(draftRows), [draftRows]);
  const hasChanges = autoSummary !== "변경 없음";

  // 상시 편집기(R&D) 자동 저장 — 저장 시작 시점의 초안을 기억해 두고, 저장 중에 또 고쳤는지 비교한다.
  const draftRef = useRef(draftRows);
  draftRef.current = draftRows;
  const snapRef = useRef<EditDraftRow[] | null>(null);
  const failedDraftRef = useRef<EditDraftRow[] | null>(null);

  const saveChanges = useMutation({
    mutationFn: async () => {
      if (inline) snapRef.current = draftRows;
      const user_id = await currentUserId();

      if (saveMode === "new") {
        // NEW — 지금 버전을 복사한 새 DRAFT 버전을 만들고, 이 WORK SESSION 선택만 그쪽으로
        // 옮긴다. 다른 WORK SESSION이나 포뮬라 페이지의 "현재 버전"은 그대로 안전하게 남는다.
        const { data: baseVersion, error: baseError } = await supabase
          .from("formula_versions")
          .select(
            "yield_quantity, bath_water_g, basis_overrides, default_mould_id, default_base_weight_id, default_capacity_id, component_sources, notes",
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
            component_sources: baseVersion.component_sources,
            notes: baseVersion.notes,
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
          .update({ formula_version_id: newVersion.id, version_pinned: true })
          .eq("id", targetSelectionId)
          .eq("user_id", user_id);
        if (selectionError) throw selectionError;

        // 재료 라인 id가 전부 바뀌므로 이 열의 기존 계량 진행상태는 더 이상 의미가 없다 — 지운다.
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("work_session_formula_version_id", targetSelectionId)
          .eq("user_id", user_id);
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
            "yield_quantity, bath_water_g, basis_overrides, default_mould_id, default_base_weight_id, default_capacity_id, component_sources, notes",
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
            component_sources: baseVersion.component_sources,
            notes: baseVersion.notes,
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
          .update({ formula_version_id: newVersion.id, version_pinned: true })
          .eq("id", targetSelectionId)
          .eq("user_id", user_id);
        if (selectionError) throw selectionError;

        // 재료 라인 id가 전부 바뀌므로 이 열의 기존 계량 진행상태는 더 이상 의미가 없다 — 지운다.
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("work_session_formula_version_id", targetSelectionId)
          .eq("user_id", user_id);
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
          (Number(row.amount) !== row.originalAmount ||
            row.unit !== row.originalUnit ||
            (row.secondaryAmount ?? null) !== (row.originalSecondaryAmount ?? null) ||
            (row.secondaryUnit ?? null) !== (row.originalSecondaryUnit ?? null)),
      );
      for (const row of changedRows) {
        const { error: updateError } = await supabase
          .from("formula_version_ingredients")
          .update({
            amount: Number(row.amount) || 0,
            unit: row.unit,
            secondary_amount: row.secondaryAmount,
            secondary_unit: row.secondaryUnit,
            amount_source: "manual",
          })
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
      void invalidateProductionSync(queryClient);
      if (inline) {
        // 상시 편집기 — 저장한 값을 새 기준으로 다시 불러온다.
        await queryClient.invalidateQueries({ queryKey: ["formula_version_ingredients"] });
        await queryClient.invalidateQueries({ queryKey: ["version_ingredients"] });
        const snap = snapRef.current;
        const cur = draftRef.current;
        failedDraftRef.current = null;
        if (
          !snap ||
          JSON.stringify(snap) === JSON.stringify(cur) ||
          snap.some((r) => !r.removed && r.sourceId === null)
        ) {
          setSeeded(false);
        } else {
          // 저장 중에 더 고친 값은 그대로 두고, 저장된 값만 새 기준으로 삼는다.
          setDraftRows((prev) =>
            prev
              .filter((r) => !(r.removed && r.sourceId))
              .map((r) => {
                const saved = snap.find((x) => x.key === r.key);
                return saved && r.sourceId
                  ? {
                      ...r,
                      originalAmount: Number(saved.amount),
                      originalUnit: saved.unit,
                      originalSecondaryAmount: saved.secondaryAmount,
                      originalSecondaryUnit: saved.secondaryUnit,
                    }
                  : r;
              }),
          );
        }
      }
      await onSaved();
    },
    onError: (e: unknown) => {
      failedDraftRef.current = draftRef.current;
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    },
  });

  // 바꾸면 0.8초 뒤 자동 저장(저장 버튼 없음). 실패하면 같은 내용으로는 다시 시도하지 않고, 더 고치면 재시도.
  useEffect(() => {
    if (!inline || !seeded || !hasChanges || saveChanges.isPending) return;
    if (failedDraftRef.current === draftRows) return;
    const t = setTimeout(() => saveChanges.mutate(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, seeded, hasChanges, saveChanges.isPending, draftRows]);

  return (
    <div
      className={
        inline
          ? ""
          : "fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-3"
      }
    >
      <div
        className={cn(
          "w-full border bg-background",
          !inline && "max-h-[90vh] max-w-lg overflow-auto",
          runningExperiment ? "border-[#7DB35A] bg-[#EEF8E4]" : "border-border",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between border-b px-3 py-2",
            runningExperiment ? "border-[#7DB35A] bg-[#DCF0C8]" : "border-border",
          )}
        >
          <span className="label-caps">
            {runningExperiment && "🧪 R&D · "}
            {inline ? "" : "EDIT "}
            {column.formulaName} (v{column.versionNumber})
          </span>
          {!inline && (
            <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
              CLOSE
            </button>
          )}
        </div>

        <div className="space-y-3 p-3">
          {runningExperiment && (
            <div className="space-y-1">
              <p className="font-mono text-[11px]">
                R&amp;D 실험 중 — 재료를 고쳐 "현재 버전에 덮어쓰기"로 저장하면 실험 버전이 바로
                수정돼요. 구운 높이·메모를 적고 적용/보관/폐기도 여기서 정해요.
              </p>
              <ul>
                <ExperimentCard experiment={runningExperiment} hideEditLink />
              </ul>
            </div>
          )}
          {/* 2026-10-14 사용자 요청: "new 버전으로 저장할지 아니면 덮어쓸지도 선택할수 있게"
              2026-10-18 사용자 요청: "기존 formula말고 새로운 formula 생성이랑 이름도 바로
              정할수 있게해줘" — 세 번째 선택지로 완전히 새로운 포뮬라를 만드는 옵션을 추가. */}
          {!inline && (
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
          )}

          {!inline && (column.members?.length ?? 0) > 1 && (
            <div className="space-y-2 border border-border p-2">
              <p className="text-xs">
                MERGE는 계량 보기입니다. 새 버전·새 포뮬라는 아래에서 선택한 주문 항목 하나에
                연결됩니다. 덮어쓰기는 같은 버전을 쓰는 모든 작업에 영향을 줍니다.
              </p>
              {saveMode !== "overwrite" && (
                <label className="block text-xs">
                  변경할 주문 항목
                  <select
                    className={selectClass}
                    value={targetSelectionId}
                    onChange={(e) => setTargetSelectionId(e.target.value)}
                  >
                    {column.members?.map((m) => (
                      <option key={m.selectionId} value={m.selectionId}>
                        {m.label ?? m.sessionId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {baseIngredients.isLoading && (
            <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border border-border bg-secondary px-3 py-1 font-mono text-[11px]">
            <span>
              표 기준:{" "}
              <b>
                {viewProd
                  ? `실제 생산량 (기본 ×${fmtNumber(column.multiplier, 3)})`
                  : "기본 레시피 (×1)"}
              </b>{" "}
              · 합계{" "}
              {fmtNumber(
                visibleRows.reduce(
                  (sum, r) => sum + (toGrams(Number(r.amount) || 0, r.unit) ?? 0),
                  0,
                ) * viewK,
                0,
              )}
              g
            </span>
            <button
              type="button"
              className={`${viewProd ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
              onClick={() => setViewProd(true)}
            >
              생산량으로 보기
            </button>
            <button
              type="button"
              className={`${!viewProd ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
              onClick={() => setViewProd(false)}
            >
              기본(×1)으로 보기
            </button>
          </div>
          {/* 재료 조정 도구 — 같은 계열(재료 양을 한꺼번에 바꾸는 기능)이라 한 묶음으로, 필요한 것만 펼쳐서 쓴다(둘 이상 동시에 펼치기 가능). */}
          <div className="border border-border bg-background/40">
            <div className="flex flex-wrap items-center gap-1 px-2 py-1">
              <span className="label-caps mr-1 text-[11px] text-muted-foreground">재료 조정</span>
              {undoStack.length > 0 && (
                <button
                  type="button"
                  className={`${buttonClass} !h-7 !min-h-0 px-2 text-xs`}
                  title="방금 한 재료 대치를 되돌립니다"
                  onClick={() => {
                    const prev = undoStack[undoStack.length - 1];
                    if (!prev) return;
                    setDraftRows(prev);
                    setUndoStack((st) => st.slice(0, -1));
                  }}
                >
                  ↩ 되돌리기 ({undoStack.length})
                </button>
              )}
              {(
                [
                  ["anchor", "⚓ 개수로 증량"],
                  ["scale", "× 전체 배수"],
                  ["replace", "🔁 합쳐서 대치"],
                  ["shortage", "🧩 부족 재료 대치"],
                ] as const
              ).map(([id, label]) => {
                const open = openTools.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-expanded={open}
                    className={`${open ? primaryButtonClass : buttonClass} !h-7 !min-h-0 px-2 text-xs`}
                    onClick={() => {
                      setOpenTools((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                      if (id === "replace" && !open) {
                        setReplaceSel(new Set());
                        setReplaceError(null);
                      }
                      if (id === "shortage" && !open) resetShortage();
                    }}
                  >
                    {open ? "▾" : "▸"} {label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2 px-2 pb-2">
              {openTools.has("anchor") && (
                <div className="space-y-1 border border-dashed border-border bg-background/60 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label-caps text-[11px] text-muted-foreground">
                      ⚓ 기준 재료
                    </span>
                    <select
                      className={`${selectClass} !h-7 !min-h-0 !w-auto !px-1 text-xs`}
                      value={anchorKey ?? ""}
                      onChange={(e) => setAnchorKey(e.target.value || null)}
                    >
                      <option value="">선택 안 함</option>
                      {visibleRows.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.ingredientName}
                        </option>
                      ))}
                    </select>
                    {anchorRow && column.baseMouldId && anchorMouldOptions.length > 0 && (
                      <select
                        className={`${inputClass} !h-7 !min-h-0 !w-auto text-xs`}
                        title="+1/−1 기준 몰드"
                        value={anchorMouldId}
                        onChange={(e) => setAnchorMouldChoice(e.target.value)}
                      >
                        {anchorMouldOptions.map((m) => (
                          <option key={m.id} value={m.id}>
                            기준 몰드 {mouldAbbr(m)} ({fmtNumber(Number(m.reference_weight_g), 0)}g)
                          </option>
                        ))}
                      </select>
                    )}
                    {anchorRow && anchorCount != null && (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          className={`${buttonClass} !h-7 !min-h-0 px-2 text-sm`}
                          onClick={() => stepAnchor(-1)}
                        >
                          −1
                        </button>
                        <span className="min-w-12 text-center font-mono text-sm tabular-nums">
                          {fmtNumber(anchorCount * anchorK, 2)}
                          {anchorRow.secondaryUnit ?? ""}
                        </span>
                        {anchorMouldK && anchorK !== 1 && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {anchorMouldK.t ? mouldAbbr(anchorMouldK.t) : ""} 1개 기준 · 레시피(
                            {anchorMouldK.b ? mouldAbbr(anchorMouldK.b) : ""}){" "}
                            {fmtNumber(anchorCount, 2)}
                            {anchorRow.secondaryUnit ?? ""}
                          </span>
                        )}
                        <button
                          type="button"
                          className={`${primaryButtonClass} !h-7 !min-h-0 px-2 text-sm`}
                          onClick={() => stepAnchor(1)}
                        >
                          +1
                        </button>
                      </span>
                    )}
                    {anchorRow && anchorCount == null && (
                      <input
                        type="number"
                        step="any"
                        className={`${inputClass} !h-7 !min-h-0 !w-28 text-xs`}
                        placeholder={anchorK !== 1 ? "몰드 1개당 현재 개수" : "현재 개수 입력"}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n > 0)
                            patchRow(anchorRow.key, {
                              secondaryAmount: n / anchorK,
                              secondaryUnit: anchorRow.secondaryUnit ?? "개",
                            });
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label-caps text-[11px] text-muted-foreground">연동/고정</span>
                    <button
                      type="button"
                      className={`${buttonClass} !h-7 !min-h-0 px-2 text-[11px]`}
                      onClick={() =>
                        setLockedKeys(
                          new Set(visibleRows.filter((r) => r.key !== anchorKey).map((r) => r.key)),
                        )
                      }
                    >
                      🔒 전체 고정
                    </button>
                    <button
                      type="button"
                      className={`${buttonClass} !h-7 !min-h-0 px-2 text-[11px]`}
                      onClick={() => setLockedKeys(new Set())}
                    >
                      🔗 전체 해제(연동)
                    </button>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {lockedKeys.size > 0 ? `${lockedKeys.size}개 고정 중` : "모두 연동 중"}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] leading-snug text-muted-foreground">
                    ⚓ 앵커(기준 재료) — +1/−1의 기준이 되는 재료 · 🔗 연동 — 기준 개수 비율대로
                    같이 바뀜 · 🔒 고정 — 기준을 바꿔도 이 양은 그대로
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {anchorRow
                      ? anchorCount != null
                        ? "+1/−1을 누르면 🔗 연동된 재료가 같은 비율로 같이 바뀌어요. 🔒 고정한 재료와 직접 입력한 양은 그대로예요."
                        : "이 재료가 현재 몇 개인지 먼저 입력하세요(예: 흰자 3). 그다음부터 +1/−1로 조절돼요."
                      : "기준 재료를 고르면 개수 +1/−1로 다른 재료를 비율대로 같이 늘릴 수 있어요."}
                  </p>
                </div>
              )}
              {openTools.has("scale") && (
                <ScaleAllPanel
                  mode={scaleMode}
                  value={scaleValue}
                  currentTotal={currentTotal}
                  onMode={setScaleMode}
                  onValue={setScaleValue}
                  onApply={(factor) => {
                    applyScaleAll(factor);
                    setScaleValue("");
                  }}
                />
              )}
              {openTools.has("replace") && (
                <div className="space-y-2 border border-dashed border-border p-3">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    1) 합칠 재료를 고르세요 — 고른 재료의 양을 모두 더한 만큼 하나의 재료로
                    바뀌어요.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {visibleRows.map((r) => {
                      const on = replaceSel.has(r.key);
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className={`${on ? primaryButtonClass : buttonClass} !h-7 !min-h-0 px-2 text-xs`}
                          onClick={() =>
                            setReplaceSel((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.key)) next.delete(r.key);
                              else next.add(r.key);
                              return next;
                            })
                          }
                        >
                          {r.ingredientName}{" "}
                          {fmtNumber((Number(r.amount) || 0) * (r.unit === "%" ? 1 : viewK), 1)}
                          {r.unit}
                        </button>
                      );
                    })}
                  </div>
                  {replaceSel.size > 0 && (
                    <>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        2) 대신 쓸 재료를 고르세요 (합계{" "}
                        {fmtNumber(
                          visibleRows
                            .filter((r) => replaceSel.has(r.key))
                            .reduce(
                              (sum, r) => sum + (toGrams(Number(r.amount) || 0, r.unit) ?? 0),
                              0,
                            ) * viewK,
                          1,
                        )}
                        g)
                      </p>
                      <IngredientPicker
                        onPick={(ingredientId) => {
                          void replaceIngredients(ingredientId);
                        }}
                        onCancel={() =>
                          setOpenTools((prev) => new Set([...prev].filter((t) => t !== "replace")))
                        }
                      />
                    </>
                  )}
                  {replaceError && <p className="text-xs text-destructive">{replaceError}</p>}
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() =>
                      setOpenTools((prev) => new Set([...prev].filter((t) => t !== "replace")))
                    }
                  >
                    취소
                  </button>
                </div>
              )}
              {openTools.has("shortage") && (
                <div className="space-y-2 border border-dashed border-border p-3">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    1) 없는 재료를 고르세요 — 그 재료가 빠지고, 아래에서 정한 재료들로 나눠서
                    채워져요.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {visibleRows.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={`${shortKey === r.key ? primaryButtonClass : buttonClass} !h-7 !min-h-0 px-2 text-xs`}
                        onClick={() => {
                          setShortKey(r.key);
                          setShortSubs([]);
                          setShortError(null);
                        }}
                      >
                        {r.ingredientName}{" "}
                        {fmtNumber((Number(r.amount) || 0) * (r.unit === "%" ? 1 : viewK), 1)}
                        {r.unit}
                      </button>
                    ))}
                  </div>
                  {shortRow && (
                    <>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span>
                          2) 대신 쓸 재료와 양 — 원래 {fmtNumber(shortTotalBase * viewK, 1)}g
                        </span>
                        <button
                          type="button"
                          className={`${shortBasis === "base" ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
                          onClick={() => setViewProd(false)}
                        >
                          기본(×1) 기준 입력
                        </button>
                        <button
                          type="button"
                          className={`${shortBasis === "prod" ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
                          onClick={() => setViewProd(true)}
                        >
                          생산량(×{fmtNumber(column.multiplier, 3)}) 기준 입력
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span>입력 단위</span>
                        {(["g", "pct"] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            className={`${shortUnit === u ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
                            onClick={() => setShortUnit(u)}
                          >
                            {u === "g" ? "양(g)" : "비율(%)"}
                          </button>
                        ))}
                        {shortUnit === "pct" && (
                          <span className="text-muted-foreground">
                            원래 재료 양 대비 % · 나머지는 &quot;나머지로&quot;로 채우세요
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {shortSubs.map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="min-w-[8rem] flex-1">{x.name}</span>
                            {x.rest ? (
                              <span className="font-mono">
                                나머지 ={" "}
                                {shortUnit === "pct"
                                  ? fmtNumber(
                                      shortTotalBase > 0
                                        ? (shortRestBase / shortTotalBase) * 100
                                        : 0,
                                      1,
                                    )
                                  : fmtNumber(
                                      shortBasis === "prod"
                                        ? shortRestBase * column.multiplier
                                        : shortRestBase,
                                      1,
                                    )}
                                {shortUnit === "pct"
                                  ? `% (${fmtNumber(shortRestBase * viewK, 1)}g)`
                                  : "g"}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="any"
                                className={`${inputClass} !w-24 text-right`}
                                value={x.amount}
                                onChange={(e) =>
                                  setShortSubs((prev) =>
                                    prev.map((y) =>
                                      y.id === x.id ? { ...y, amount: e.target.value } : y,
                                    ),
                                  )
                                }
                              />
                            )}
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {x.rest ? "" : shortUnit === "pct" ? "%" : "g"}
                              {!x.rest &&
                                shortUnit === "pct" &&
                                ` = ${fmtNumber(shortSubBase(x) * viewK, 1)}g`}
                            </span>
                            <button
                              type="button"
                              className={`${x.rest ? primaryButtonClass : buttonClass} !h-6 !min-h-0 px-2 text-[11px]`}
                              onClick={() =>
                                setShortSubs((prev) =>
                                  prev.map((y) => ({
                                    ...y,
                                    rest: y.id === x.id ? !y.rest : false,
                                  })),
                                )
                              }
                            >
                              나머지로
                            </button>
                            <button
                              type="button"
                              className="px-1 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setShortSubs((prev) => prev.filter((y) => y.id !== x.id))
                              }
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                      {shortPicking ? (
                        <IngredientPicker
                          onPick={(ingredientId) => {
                            void (async () => {
                              const { data } = await supabase
                                .from("ingredients")
                                .select("name, name_en")
                                .eq("id", ingredientId)
                                .single();
                              const name = data
                                ? data.name_en
                                  ? `${data.name} (${data.name_en})`
                                  : data.name
                                : "…";
                              setShortSubs((prev) => [
                                ...prev,
                                {
                                  id: `${ingredientId}-${Date.now()}`,
                                  ingredientId,
                                  name,
                                  amount: "",
                                  rest: false,
                                },
                              ]);
                              setShortPicking(false);
                            })();
                          }}
                          onCancel={() => setShortPicking(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => setShortPicking(true)}
                        >
                          + 대치 재료 추가
                        </button>
                      )}
                      {shortSubs.length > 0 && (
                        <p
                          className={cn(
                            "font-mono text-[11px]",
                            shortRestBase < 0 && !shortSubs.some((x) => x.rest)
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          합계 {fmtNumber((shortFixedBase + Math.max(shortRestBase, 0)) * viewK, 1)}
                          g / 원래 {fmtNumber(shortTotalBase * viewK, 1)}g
                          {!shortSubs.some((x) => x.rest) &&
                            ` · 차이 ${fmtNumber(shortRestBase * viewK, 1)}g (나머지로 지정하면 자동으로 채워요)`}
                        </p>
                      )}
                    </>
                  )}
                  {shortError && <p className="text-xs text-destructive">{shortError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={primaryButtonClass}
                      disabled={!shortRow || shortSubs.length === 0}
                      onClick={applyShortage}
                    >
                      대치 적용
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => {
                        resetShortage();
                        setOpenTools((prev) => new Set([...prev].filter((t) => t !== "shortage")));
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <ul className="divide-y divide-border border border-border">
            {visibleRows.map((row) => (
              <li key={row.key} className="px-3 py-1">
                <div className="flex items-center gap-2">
                  {row.key === anchorKey ? (
                    <span className="w-7 text-center text-sm" title="기준 재료">
                      ⚓
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="h-7 w-7 text-sm hover:bg-secondary"
                      title={
                        lockedKeys.has(row.key)
                          ? "🔒 고정 — 기준 재료를 바꿔도 이 양은 그대로"
                          : "🔗 연동 — 기준 재료 개수에 맞춰 같이 바뀜"
                      }
                      onClick={() =>
                        setLockedKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.key)) next.delete(row.key);
                          else next.add(row.key);
                          return next;
                        })
                      }
                    >
                      {lockedKeys.has(row.key) ? "🔒" : "🔗"}
                    </button>
                  )}
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {row.ingredientName}
                    {row.secondaryAmount != null && row.secondaryUnit && (
                      <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                        · {fmtNumber(row.secondaryAmount * viewK, 2)}
                        {row.secondaryUnit}
                      </span>
                    )}
                  </span>
                  <ScaledAmountInput
                    className={`${inputClass} !h-7 !min-h-0 !w-20 text-right`}
                    value={row.amount}
                    k={row.unit === "%" ? 1 : viewK}
                    onChange={(v) => patchRow(row.key, { amount: v })}
                  />
                  <select
                    className={`${selectClass} !h-7 !min-h-0 !w-16 !px-1 text-xs`}
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
                    className={cn(
                      "h-7 px-1.5 text-xs text-muted-foreground hover:bg-secondary",
                      moreKeys.has(row.key) && "bg-secondary text-foreground",
                    )}
                    title="증량(+20 ×1.2) 입력 펼치기"
                    onClick={() =>
                      setMoreKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.key)) next.delete(row.key);
                        else next.add(row.key);
                        return next;
                      })
                    }
                  >
                    ⋯
                  </button>
                  <button
                    type="button"
                    className="h-7 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                    title="재료 삭제"
                    onClick={() => removeRow(row.key)}
                  >
                    ✕
                  </button>
                </div>
                {moreKeys.has(row.key) && (
                  <div className="flex justify-end pb-1">
                    <AdjustInput
                      current={(Number(row.amount) || 0) * viewK}
                      onApply={(shownNext) => {
                        const next = shownNext / viewK;
                        const cur = Number(row.amount) || 0;
                        patchRow(row.key, {
                          amount: String(next),
                          ...(row.secondaryAmount != null && cur > 0
                            ? {
                                secondaryAmount: round2((Number(row.secondaryAmount) * next) / cur),
                              }
                            : {}),
                        });
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
            {visibleRows.length === 0 && !baseIngredients.isLoading && (
              <li className="px-3 py-2 font-mono text-xs uppercase text-muted-foreground">
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

          {inline ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              {saveChanges.isPending
                ? "저장 중…"
                : error
                  ? "저장 실패 — 다시 고치면 재시도해요"
                  : hasChanges
                    ? "저장 대기 중…"
                    : "✓ 자동 저장됨 (실험 버전에 바로 반영)"}
            </p>
          ) : (
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
                {saveMode === "overwrite" && (inline ? "저장 (실험 버전에 반영)" : "덮어쓰기")}
                {saveMode === "new_formula" && "새 포뮬라로 저장"}
              </button>
              {inline ? (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setSeeded(false);
                    setLockedKeys(new Set());
                  }}
                >
                  되돌리기
                </button>
              ) : (
                <button type="button" className={buttonClass} onClick={onClose}>
                  CANCEL
                </button>
              )}
            </div>
          )}
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

/**
 * 대시보드용 합쳐진 WORK VIEW(2026-10-22) — 그날 타임라인에 배정된 컴포넌트를 오더(세션)와 상관없이
 * 한 계량표에 나란히 보여준다(예전 WORK SESSION 화면처럼). items는 타임라인 시간순.
 */
/**
 * 같은 레시피 버전 MERGE 보기 설정 — 대시보드 타임라인과 DayWorkView가 함께 쓴다(localStorage, 보기 설정).
 * rowIds가 바뀌면 그 조합의 저장값을 다시 읽는다.
 */
export function useProductionMerge(rowIds: string[]) {
  const [mergedVersions, setMergedVersions] = useState<Set<string>>(new Set());
  const mergeStorageKey = `pilot:production-merge:${[...rowIds].sort().join(":")}`;
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(mergeStorageKey) ?? "[]");
      setMergedVersions(
        new Set(
          Array.isArray(stored) ? stored.filter((s): s is string => typeof s === "string") : [],
        ),
      );
    } catch {
      setMergedVersions(new Set());
    }
  }, [mergeStorageKey]);
  const toggleMerge = (versionId: string) =>
    setMergedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      try {
        localStorage.setItem(mergeStorageKey, JSON.stringify([...next]));
      } catch {
        /* optional view preference */
      }
      return next;
    });
  return { mergedVersions, toggleMerge };
}

export function DayWorkView({
  items,
  mergedVersions,
  onToggleMerge,
  labels = {},
  renderRecords,
  renderHeaderExtra,
  focusedRowId,
  focusKey,
  part = "ALL",
}: {
  /** COMPONENTS: 컴포넌트 생산 리스트만 / WORK_VIEW: 계량 표(WORK VIEW)만 / ALL: 둘 다 */
  part?: "ALL" | "COMPONENTS" | "WORK_VIEW";
  renderRecords?: (selectionIds: string[]) => React.ReactNode;
  /** 컴포넌트 행 제목 옆(접어도 보임)에 붙는 것 — 타이머 */
  renderHeaderExtra?: (selectionIds: string[]) => React.ReactNode;
  focusedRowId?: string | null;
  focusKey?: string | null;
  mergedVersions: Set<string>;
  onToggleMerge: (versionId: string) => void;
  items: { sessionId: string; rowId: string }[];
  labels?: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"WEIGHING" | "FORMULA">("WEIGHING");
  const [editingColumn, setEditingColumn] = useState<WeighingColumn | null>(null);
  const sessionIds = useMemo(() => [...new Set(items.map((i) => i.sessionId))], [items]);

  const selectionQs = useQueries({
    queries: sessionIds.map((sid) => workSessionFormulaVersionsQuery(sid)),
  });
  const progressQs = useQueries({
    queries: sessionIds.map((sid) => workSessionProgressQuery(sid)),
  });
  const childQs = useQueries({
    queries: sessionIds.map((sid) => workSessionChildSelectionsQuery(sid)),
  });
  const childrenByParent = useMemo(() => {
    const map = new Map<string, WorkSessionFormulaVersionRow[]>();
    for (const q of childQs)
      for (const c of q.data ?? []) {
        if (!c.parent_selection_id) continue;
        const list = map.get(c.parent_selection_id) ?? [];
        list.push(c);
        map.set(c.parent_selection_id, list);
      }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childQs.map((q) => q.dataUpdatedAt).join(",")]);

  const rowsById = useMemo(() => {
    const map = new Map<string, { row: WorkSessionFormulaVersionRow; sessionId: string }>();
    sessionIds.forEach((sid, i) => {
      for (const r of selectionQs[i]?.data ?? []) map.set(r.id, { row: r, sessionId: sid });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds, selectionQs.map((q) => q.dataUpdatedAt).join(",")]);

  const ordered = useMemo(
    () =>
      items.flatMap((i) => {
        const hit = rowsById.get(i.rowId);
        return hit ? [hit] : [];
      }),
    [items, rowsById],
  );
  const versionIds = useMemo(
    () => [
      ...new Set([
        ...ordered.map((o) => o.row.formula_version_id),
        ...[...childrenByParent.values()].flat().map((c) => c.formula_version_id),
      ]),
    ],
    [ordered, childrenByParent],
  );
  const ingredients = useQuery(versionIngredientsBulkQuery(versionIds));
  const ingredientsByVersion = useMemo(() => ingredients.data ?? {}, [ingredients.data]);

  const progressBySelectionAndLine = useMemo(() => {
    const map: Record<string, { status: string; note: string | null }> = {};
    for (const q of progressQs)
      for (const p of q.data ?? []) {
        map[`${p.work_session_formula_version_id}:${p.formula_version_ingredient_id}`] = {
          status: p.status,
          note: p.note,
        };
      }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressQs.map((q) => q.dataUpdatedAt).join(",")]);

  const quantityGroups = useMemo(
    () =>
      groupProductionSelections(
        ordered.map(({ row, sessionId }) => ({ ...row, sessionId })),
        mergedVersions,
      ),
    [ordered, mergedVersions],
  );
  const columns: WeighingColumn[] = useMemo(
    () =>
      quantityGroups.flatMap((group, idx): WeighingColumn[] => {
        const r = group.members[0]!;
        const kids = group.members.length === 1 ? (childrenByParent.get(r.id) ?? []) : [];
        if (kids.length > 0) {
          const parentName =
            r.formula_versions.formulas.components?.name ?? r.formula_versions.formulas.name;
          return kids.map((k, ki) => ({
            selectionId: k.id,
            formulaVersionId: k.formula_version_id,
            formulaId: k.formula_versions.formulas.id,
            formulaName:
              k.formula_versions.formulas.components?.name ?? k.formula_versions.formulas.name,
            versionNumber: k.formula_versions.version_number,
            multiplier: Number(k.multiplier),
            sortOrder: idx + ki / 100,
            sessionId: r.sessionId,
            slot: r.slot ?? null,
            groupKey: r.id,
            groupLabel: parentName,
            members: [
              {
                selectionId: k.id,
                sessionId: r.sessionId,
                label: labels[r.id] ?? r.sessionId.slice(0, 8),
              },
            ],
          }));
        }
        return [
          {
            selectionId: r.id,
            formulaVersionId: r.formula_version_id,
            formulaId: r.formula_versions.formulas.id,
            formulaName: `${r.formula_versions.formulas.components?.name ?? r.formula_versions.formulas.name}${group.members.length > 1 ? ` · MERGED ${group.members.length}` : ""}`,
            versionNumber: r.formula_versions.version_number,
            multiplier: group.multiplier,
            sortOrder: idx,
            sessionId: r.sessionId,
            slot: r.slot ?? null,
            mouldId: r.mould_id ?? null,
            baseMouldId: r.formula_versions.default_mould_id ?? null,
            mouldQty: group.members.every((m) => m.mould_id === r.mould_id && m.mould_qty != null)
              ? group.members.reduce((sum, m) => sum + Number(m.mould_qty), 0)
              : null,
            members: group.members.map((m) => ({
              selectionId: m.id,
              sessionId: m.sessionId,
              label: labels[m.id] ?? m.sessionId.slice(0, 8),
            })),
          },
        ];
      }),
    [quantityGroups, childrenByParent, labels],
  );
  const groups = useMemo(
    () =>
      buildWeighingGroups({
        selections: columns,
        ingredientsByVersion,
        progressBySelectionAndLine,
      }).map((group) => ({
        ...group,
        cells: group.cells.map((cell) => {
          const col = columns.find((c) => c.selectionId === cell.selectionId)!;
          const members = (col.members ?? []).map((m) => {
            const progress =
              progressBySelectionAndLine[`${m.selectionId}:${cell.ingredientLineId}`];
            return {
              ...m,
              status: (progress?.status ?? "NOT_STARTED") as WorkSessionProgressStatus,
              note: progress?.note ?? null,
            };
          });
          const status = members.every((m) => m.status === "DONE")
            ? "DONE"
            : members.some((m) => m.status === "SHORTAGE")
              ? "SHORTAGE"
              : members.every((m) => m.status === "SKIPPED")
                ? "SKIPPED"
                : "NOT_STARTED";
          return { ...cell, members, progressStatus: status as WorkSessionProgressStatus };
        }),
      })),
    [columns, ingredientsByVersion, progressBySelectionAndLine],
  );

  const rndExperimentsAll = useQuery(formulaExperimentsQuery());
  const rndOpenVersionIds = new Set(
    (rndExperimentsAll.data ?? []).filter((x) => x.status === "OPEN").map((x) => x.version_id),
  );
  const rndColumns = columns.filter(
    (c) => rndOpenVersionIds.has(c.formulaVersionId) && !((c.members?.length ?? 0) > 1),
  );
  const invalidateProgress = async () => {
    for (const sid of sessionIds)
      await queryClient.invalidateQueries({ queryKey: ["work_session_progress", sid] });
  };

  if (ordered.length === 0) return null;
  return (
    <div className={part === "COMPONENTS" ? undefined : "border-t border-border pt-4"}>
      {part !== "WORK_VIEW" && (
        <section className="mb-4 border border-border bg-card" aria-label="컴포넌트 생산 리스트">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="label-caps text-xs">COMPONENTS · PRODUCTION</h2>
            <span className="text-xs text-muted-foreground">
              수량은 바로 조절 · 행을 펼쳐 생산 기록
            </span>
          </div>
          <div className="divide-y divide-border">
            {quantityGroups.map((group) => (
              <ComponentProductionRow
                key={group.key}
                members={group.members}
                labels={labels}
                focused={group.members.some((m) => m.id === focusedRowId)}
                focusKey={focusKey ?? null}
                renderRecords={renderRecords}
                renderHeaderExtra={renderHeaderExtra}
                quantity={
                  <ProductionQuantityRow
                    compact
                    members={group.members}
                    labels={labels}
                    lines={ingredientsByVersion[group.members[0]!.formula_version_id] ?? []}
                    canMerge={
                      ordered.filter(
                        (o) => o.row.formula_version_id === group.members[0]!.formula_version_id,
                      ).length > 1
                    }
                    onToggleMerge={() => onToggleMerge(group.members[0]!.formula_version_id)}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}
      {part !== "COMPONENTS" && (
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
              sessionId={ordered[0]!.sessionId}
              groups={groups}
              columns={columns}
              onProgressChanged={invalidateProgress}
              onEditColumn={setEditingColumn}
            />
          ) : (
            <FormulaView
              rows={quantityGroups.map((g) => ({ ...g.members[0]!, multiplier: g.multiplier }))}
              ingredientsByVersion={ingredientsByVersion}
            />
          )}
        </SectionCard>
      )}
      {part !== "COMPONENTS" &&
        rndColumns.map((col) => (
          <div key={col.selectionId} className="mt-4">
            <EditFormulaVersionModal
              inline
              column={col}
              onClose={() => undefined}
              onSaved={async () => {
                if (col.sessionId)
                  await queryClient.invalidateQueries({
                    queryKey: ["work_session_formula_versions", col.sessionId],
                  });
                await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
                await invalidateProgress();
              }}
            />
          </div>
        ))}
      {part !== "COMPONENTS" && editingColumn && (
        <EditFormulaVersionModal
          column={editingColumn}
          onClose={() => setEditingColumn(null)}
          onSaved={async () => {
            const sid = editingColumn.sessionId;
            setEditingColumn(null);
            if (sid)
              await queryClient.invalidateQueries({
                queryKey: ["work_session_formula_versions", sid],
              });
            await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
            await invalidateProgress();
          }}
        />
      )}
    </div>
  );
}

function ComponentProductionRow({
  members,
  labels,
  quantity,
  focused,
  focusKey,
  renderRecords,
  renderHeaderExtra,
}: {
  members: (WorkSessionFormulaVersionRow & { sessionId: string })[];
  labels: Record<string, string>;
  quantity: React.ReactNode;
  focused: boolean;
  focusKey: string | null;
  renderRecords: ((ids: string[]) => React.ReactNode) | undefined;
  renderHeaderExtra: ((ids: string[]) => React.ReactNode) | undefined;
}) {
  // 기본으로 열어 둔다 — 사용자가 닫지 않는 한 유지.
  const [expanded, setExpanded] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    if (focused) setExpanded(true);
  }, [focused, focusKey]);
  const first = members[0]!;
  return (
    <article>
      <div className="flex w-full flex-wrap items-center gap-2 bg-secondary/40 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-sm">
            {first.formula_versions.formulas.components?.name ??
              first.formula_versions.formulas.name}
          </span>
        </button>
        {/* 타이머: 제목 바로 옆에 — 접어도 시작/카운트다운이 보인다 */}
        {renderHeaderExtra?.(members.map((m) => m.id))}
        <button
          type="button"
          className="ml-auto flex items-center gap-2 text-left"
          tabIndex={-1}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="font-mono text-[11px] text-muted-foreground">
            V{first.formula_versions.version_number} ·{" "}
            {members.length > 1 ? `MERGED ${members.length}` : (first.slot ?? first.kind)}
          </span>
          <span className="text-xs text-muted-foreground">생산 기록</span>
        </button>
      </div>
      <div className="pt-2">{quantity}</div>
      {expanded && (
        <div className="ml-5 space-y-3 border-l border-border px-3 pb-3 sm:ml-8">
          {renderRecords?.(members.map((m) => m.id))}
          <details
            className="border-t border-dashed border-border pt-2"
            onToggle={(e) => setShowHistory(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-xs text-muted-foreground">
              수량 변경 이력
            </summary>
            {showHistory &&
              members.map((m) => (
                <SelectionQuantityHistory
                  key={m.id}
                  member={m}
                  label={labels[m.id] ?? m.sessionId.slice(0, 8)}
                />
              ))}
          </details>
        </div>
      )}
    </article>
  );
}

function SelectionQuantityHistory({
  member,
  label,
}: {
  member: WorkSessionFormulaVersionRow & { sessionId: string };
  label: string;
}) {
  const history = useQuery(workSessionMultiplierHistoryQuery(member.sessionId, member.id));
  return (
    <div className="mt-2 text-xs">
      <p className="font-mono text-muted-foreground">{label}</p>
      {history.isLoading ? (
        <p>불러오는 중…</p>
      ) : history.isError ? (
        <p className="text-destructive">이력을 불러오지 못했습니다.</p>
      ) : !(history.data ?? []).length ? (
        <p>변경 이력 없음</p>
      ) : (
        <ul>
          {history.data!.map((h) => (
            <li key={h.id}>
              {formatDateTime(h.applied_at)} · ×{fmtNumber(Number(h.previous_multiplier), 3)} → ×
              {fmtNumber(Number(h.applied_multiplier), 3)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Recipe multiples are the only production input. Mould weights never rewrite this value. */
function ProductionQuantityRow({
  members,
  lines,
  canMerge,
  onToggleMerge,
  labels,
  compact = false,
}: {
  compact?: boolean;
  labels: Record<string, string>;
  members: (WorkSessionFormulaVersionRow & { sessionId: string })[];
  lines: VersionIngredientRow[];
  canMerge: boolean;
  onToggleMerge: () => void;
}) {
  const first = members[0]!;
  const total = members.reduce((sum, row) => sum + Number(row.multiplier), 0);
  const base = sumBaseGrams(lines);
  return (
    <div className="space-y-1 px-3 pb-3 pt-2 text-xs">
      {!compact && (
        <p>
          {first.formula_versions.formulas.components?.name ?? first.formula_versions.formulas.name}{" "}
          · V{first.formula_versions.version_number}
        </p>
      )}
      <p className="font-mono">
        기본 배합 {fmtNumber(base)}g × {fmtNumber(total, 4)} ={" "}
        <strong>{fmtNumber(base * total)}g</strong>
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        {members
          .map(
            (m) =>
              `${labels[m.id] ?? m.sessionId.slice(0, 8)} · ×${fmtNumber(Number(m.multiplier), 4)}`,
          )
          .join(" + ")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/production" search={{ tab: "ORDERS" }} className="underline">
          읽기 전용 · ORDERS에서 계획 수정 →
        </Link>
        {canMerge && (
          <button type="button" className="underline" onClick={onToggleMerge}>
            {members.length > 1 ? "UNMERGE" : "MERGE SAME FORMULA"} (보기)
          </button>
        )}
      </div>
    </div>
  );
}
