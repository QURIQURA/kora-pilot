import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  versionIngredientsBulkQuery,
  workSessionFormulaVersionsQuery,
  workSessionMultiplierHistoryQuery,
  workSessionProgressQuery,
  workSessionQuery,
  workSessionTaskIngredientsQuery,
  workSessionTaskPredecessorsQuery,
  workSessionTasksQuery,
  type VersionIngredientRow,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { fmtNumber, toGrams, versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import {
  buildMultiplierSnapshot,
  buildWeighingGroups,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  workingAmount,
  type WorkSessionProgressStatus,
} from "@/lib/work-session";
import { ExperimentCreateModal } from "@/components/pilot/ExperimentCreateForm";
import { WorkflowView } from "@/components/pilot/WorkflowTimeline";
import { adjustStock, STOCK_REASON_LABEL, type StockReason } from "@/lib/stock";
import { applyWorkflowTemplate } from "@/lib/workflow-template";
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

export const Route = createFileRoute("/_authenticated/production/$sessionId")({
  head: () => ({
    meta: [
      { title: "PILOT — Work Session" },
      { name: "description", content: "Production / weighing work session" },
    ],
  }),
  component: WorkSessionPage,
});

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

function WorkSessionPage() {
  const { sessionId } = Route.useParams();
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

  const [viewMode, setViewMode] = useState<"WEIGHING" | "FORMULA" | "WORKFLOW">("WEIGHING");
  const [adding, setAdding] = useState(false);
  const [promotingVersionId, setPromotingVersionId] = useState<string | null>(null);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "PRODUCTION", path: "/production" },
    { label: (session.data?.name ?? "…").toUpperCase() },
  ]);

  const invalidateSession = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    await queryClient.invalidateQueries({ queryKey: ["work_sessions", sessionId] });
  };
  const invalidateSelections = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["work_session_formula_versions", sessionId],
    });
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
    },
    onSuccess: invalidateSession,
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

  const removeFormulaVersion = useMutation({
    mutationFn: async (row: WorkSessionFormulaVersionRow) => {
      // 이 formula version에 속한 ingredient line들의 checklist 기록도 함께 정리한다
      // (work_session_progress는 formula_version_ingredients를 참조할 뿐,
      //  work_session_formula_versions를 직접 참조하지 않으므로 앱 레벨에서 정리한다).
      const { data: lines, error: linesError } = await supabase
        .from("formula_version_ingredients")
        .select("id")
        .eq("formula_version_id", row.formula_version_id);
      if (linesError) throw linesError;
      const lineIds = (lines ?? []).map((l) => l.id);
      if (lineIds.length > 0) {
        const { error: progressError } = await supabase
          .from("work_session_progress")
          .delete()
          .eq("work_session_id", sessionId)
          .in("formula_version_ingredient_id", lineIds);
        if (progressError) throw progressError;
      }
      const { error } = await supabase
        .from("work_session_formula_versions")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateSelections();
      await invalidateProgress();
    },
  });

  const rows = useMemo(() => selections.data ?? [], [selections.data]);
  const ingredientsByVersion = useMemo(() => ingredients.data ?? {}, [ingredients.data]);
  const progressByLineId = useMemo(() => {
    const map: Record<string, { status: string; note: string | null }> = {};
    for (const p of progress.data ?? []) {
      map[p.formula_version_ingredient_id] = { status: p.status, note: p.note };
    }
    return map;
  }, [progress.data]);

  const orderedSelections = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({
          formulaVersionId: r.formula_version_id,
          formulaName: r.formula_versions.formulas.name,
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
        progressByLineId,
      }),
    [orderedSelections, ingredientsByVersion, progressByLineId],
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
  const promotingRow = rows.find((r) => r.formula_version_id === promotingVersionId) ?? null;

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

      {data.status === "COMPLETED" && (
        <StockReflectSection sessionId={sessionId} rows={rows} />
      )}

      <SectionCard title="NOTES">
        <NotesEditor value={data.notes ?? ""} onSave={(notes) => updateSession.mutate({ notes })} />
      </SectionCard>

      <SectionCard
        title="SELECTED FORMULA VERSIONS"
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
              existingIds={rows.map((r) => r.formula_version_id)}
              nextSort={rows.length}
              onDone={async () => {
                setAdding(false);
                await invalidateSelections();
                await invalidateTasks();
              }}
            />
          )}
          {rows.length === 0 ? (
            <p className="font-mono text-xs uppercase text-muted-foreground">
              NO FORMULA VERSIONS SELECTED YET
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {rows.map((row) => (
                <FormulaVersionRow
                  key={row.id}
                  row={row}
                  sessionId={sessionId}
                  lines={ingredientsByVersion[row.formula_version_id] ?? []}
                  onRemove={() => removeFormulaVersion.mutate(row)}
                  onPromote={() => setPromotingVersionId(row.formula_version_id)}
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
            <button
              type="button"
              className={viewMode === "WORKFLOW" ? primaryButtonClass : buttonClass}
              onClick={() => setViewMode("WORKFLOW")}
            >
              WORKFLOW
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
          />
        ) : viewMode === "FORMULA" ? (
          <FormulaView rows={rows} ingredientsByVersion={ingredientsByVersion} />
        ) : (
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
          />
        )}
      </SectionCard>

      {promotingRow && (
        <ExperimentCreateModal
          preset={{
            formulaId: promotingRow.formula_versions.formulas.id,
            formulaVersionId: promotingRow.formula_version_id,
            componentId: promotingRow.formula_versions.formulas.component_id ?? null,
            mouldId: promotingRow.formula_versions.default_mould_id ?? null,
            batch: Number(promotingRow.multiplier),
            workSessionId: sessionId,
          }}
          onCancel={() => setPromotingVersionId(null)}
          onCreated={() => setPromotingVersionId(null)}
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
  existingIds,
  nextSort,
  onDone,
}: {
  sessionId: string;
  existingIds: string[];
  nextSort: number;
  onDone: () => void;
}) {
  const formulas = useQuery(formulasQuery());
  const formulaList = formulas.data ?? [];
  const [formulaId, setFormulaId] = useState("");
  const [versionId, setVersionId] = useState("");
  // 2026-09-24: 몰드/기본중량 기준 자동 배수 역산 기능은 제거했다 — 저울이 소수점을 못 재는데
  // 계산 결과가 소수점으로 나와 혼란만 컸다("8인치 케익 4개 만들 때 배수 자동화하려던 건데 왜
  // 소수점까지 계산하는지 모르겠다"는 피드백). 이제 "만들 개수"를 그대로 배수로 쓴다.
  const [multiplier, setMultiplier] = useState("1");

  const formula = formulaList.find((f) => f.id === formulaId) ?? null;
  const versionOptions = [...(formula?.formula_versions ?? [])].sort(
    (a, b) => b.version_number - a.version_number,
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!versionId) throw new Error("Select a formula version");
      if (existingIds.includes(versionId))
        throw new Error("이미 이 Work Session에 추가된 버전입니다");
      const user_id = await currentUserId();
      const { error } = await supabase.from("work_session_formula_versions").insert({
        user_id,
        work_session_id: sessionId,
        formula_version_id: versionId,
        multiplier: Number(multiplier) || 1,
        mould_id: null,
        mould_qty: null,
        base_weight_id: null,
        base_weight_qty: null,
        sort_order: nextSort,
      });
      if (error) throw error;
      // Component에 기본 WORKFLOW TEMPLATE이 등록돼 있고 "자동 적용"이 켜져 있으면, 이 Formula
      // Version(=열/품목)에 바로 TASK를 깔아준다(2026-09-24) — 매번 수동으로 템플릿 불러오기를
      // 반복하지 않도록.
      const comp = formula?.components;
      if (comp?.auto_apply_default_workflow && comp.default_workflow_template_id) {
        const { error: templateError } = await applyWorkflowTemplate({
          templateId: comp.default_workflow_template_id,
          sessionId,
          userId: user_id,
          formulaVersionId: versionId,
        });
        if (templateError) {
          // 선택 자체는 이미 성공했으니 템플릿 적용 실패는 조용히 콘솔에만 남기고 흐름을 막지 않는다.
          console.error("기본 워크플로 자동 적용 실패:", templateError);
        }
      }
    },
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-3 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                {f.name}
                {f.components?.name ? ` — ${f.components.name}` : ""}
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
        <Field label="개수(배수) ×N">
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            className={inputClass}
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </Field>
      </div>
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
  onPromote,
}: {
  row: WorkSessionFormulaVersionRow;
  sessionId: string;
  lines: VersionIngredientRow[];
  onRemove: () => void;
  onPromote: () => void;
}) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const history = useQuery({
    ...workSessionMultiplierHistoryQuery(sessionId, row.formula_version_id),
    enabled: showHistory,
  });
  // 2026-09-24: 몰드/기본중량 기준 자동 배수 역산 기능 제거 — "만들 개수"를 그대로 배수로 쓴다.
  const [multiplierStr, setMultiplierStr] = useState(String(Number(row.multiplier)));
  useEffect(() => {
    setMultiplierStr(String(Number(row.multiplier)));
  }, [row.id, row.multiplier]);

  const applyMultiplier = useMutation({
    mutationFn: async (nextMultiplier: number) => {
      const previous = Number(row.multiplier);
      if (nextMultiplier === previous) return;
      const user_id = await currentUserId();
      const snapshot = buildMultiplierSnapshot(lines, nextMultiplier);
      const { error: historyError } = await supabase
        .from("work_session_multiplier_history")
        .insert({
          user_id,
          work_session_id: sessionId,
          formula_version_id: row.formula_version_id,
          previous_multiplier: previous,
          applied_multiplier: nextMultiplier,
          resulting_working_quantity_snapshot: snapshot,
        });
      if (historyError) throw historyError;
      const { error: updateError } = await supabase
        .from("work_session_formula_versions")
        .update({ multiplier: nextMultiplier })
        .eq("id", row.id);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["work_session_formula_versions", sessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["work_session_multiplier_history", sessionId, row.formula_version_id],
      });
    },
  });

  const formula = row.formula_versions.formulas;

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm">
            {formula.name}
            {formula.components?.name ? ` — ${formula.components.name}` : ""}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {versionLabel(row.formula_versions.version_number)} · {row.formula_versions.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="label-caps text-xs text-muted-foreground">개수(배수) ×</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              className={`${inputClass} w-24 text-center`}
              value={multiplierStr}
              onChange={(e) => setMultiplierStr(e.target.value)}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) applyMultiplier.mutate(next);
              }}
            />
          </label>
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
            onClick={onPromote}
          >
            PROMOTE TO EXPERIMENT
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
      {applyMultiplier.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(applyMultiplier.error as Error).message}
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
  formulaVersionId: string;
  formulaName: string;
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
}: {
  sessionId: string;
  groups: ReturnType<typeof buildWeighingGroups>;
  columns: WeighingColumn[];
  onProgressChanged: () => void;
}) {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [ingredientColWidth, setIngredientColWidth] = useState(
    DEFAULT_MATRIX_INGREDIENT_COL_WIDTH,
  );

  // 선택된 포뮬라 버전(열)/재료(행)이 바뀌면 순서 목록을 맞춰준다 — 기존 순서는 최대한
  // 유지하고, 새로 생긴 항목만 뒤에 붙이고 사라진 항목은 뺀다.
  useEffect(() => {
    setColumnOrder((prev) => {
      const ids = columns.map((c) => c.formulaVersionId);
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
    const byId = new Map(columns.map((c) => [c.formulaVersionId, c]));
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
        totals[cell.formulaVersionId] = (totals[cell.formulaVersionId] ?? 0) + grams;
      }
    }
    return totals;
  }, [groups]);

  const colSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const rowSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
    displayColumns.reduce((sum, c) => sum + (colWidths[c.formulaVersionId] ?? DEFAULT_MATRIX_COL_WIDTH), 0);

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
              key={col.formulaVersionId}
              style={{ width: colWidths[col.formulaVersionId] ?? DEFAULT_MATRIX_COL_WIDTH }}
            />
          ))}
          <col />
        </colgroup>
        <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
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
                    key={col.formulaVersionId}
                    id={col.formulaVersionId}
                    formulaName={col.formulaName}
                    multiplier={col.multiplier}
                    onResizeStart={(clientX) => startColumnResize(col.formulaVersionId, clientX)}
                  />
                ))}
              </SortableContext>
              <th key={MATRIX_FILLER_COL_ID} className="sticky top-0 z-20 border-b border-l border-border bg-secondary" />
            </tr>
          </thead>
        </DndContext>
        <DndContext sensors={rowSensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd}>
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
                key={col.formulaVersionId}
                className="border-t border-l border-border bg-secondary px-2 py-2 text-left text-sm font-semibold tabular-nums"
              >
                {fmtNumber(totalsByColumn[col.formulaVersionId] ?? 0, 0)}g
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
}: {
  id: string;
  formulaName: string;
  multiplier: number;
  onResizeStart: (clientX: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
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
        <div>
          <p className="whitespace-nowrap text-xs leading-tight">{formulaName}</p>
          <p className="label-caps whitespace-nowrap text-[11px] text-muted-foreground">
            ×{fmtNumber(multiplier, 0)}
          </p>
        </div>
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
      className={cn("relative border-b border-border align-middle", isDragging && "z-10 bg-background shadow-md")}
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
        const cell = group.cells.find((c) => c.formulaVersionId === col.formulaVersionId);
        return (
          <td
            key={col.formulaVersionId}
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
          formula_version_ingredient_id: cell.ingredientLineId,
          status: patch.status ?? cell.progressStatus,
          note: patch.note !== undefined ? patch.note : cell.note,
        },
        { onConflict: "work_session_id,formula_version_ingredient_id" },
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
        className="label-caps flex h-5 w-5 shrink-0 items-center justify-center border border-border text-xs leading-none hover:border-foreground"
        onClick={() => {
          setProgress.mutate({ status: toggleProgressStatus(cell.progressStatus) });
        }}
        title={PROGRESS_STATUS_LABEL[cell.progressStatus]}
      >
        {PROGRESS_STATUS_ICON[cell.progressStatus]}
      </button>
      {cell.progressStatus === "SHORTAGE" && editingNote && (
        <input
          autoFocus
          className={`${inputClass} absolute z-30 mt-8 w-56 text-xs`}
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
          const draft = drafts[c.id] ?? { qty: "", reason: "PRODUCTION_FREEZE" as StockReason, unit: "개" };
          const done = reflected.has(c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-dashed border-border pb-2">
              <span className="min-w-[160px] text-sm">{c.name}</span>
              {done ? (
                <span className="font-mono text-xs text-muted-foreground">반영 완료</span>
              ) : (
                <>
                  <input
                    className={inputClass + " w-24"}
                    placeholder="수량"
                    value={draft.qty}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [c.id]: { ...draft, qty: e.target.value } }))
                    }
                  />
                  <input
                    className={inputClass + " w-20"}
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
                    <option value="PRODUCTION_FREEZE">{STOCK_REASON_LABEL.PRODUCTION_FREEZE}</option>
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
