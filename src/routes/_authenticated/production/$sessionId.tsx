import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  formulasQuery,
  versionIngredientsBulkQuery,
  workSessionFormulaVersionsQuery,
  workSessionMultiplierHistoryQuery,
  workSessionProgressQuery,
  workSessionQuery,
  type VersionIngredientRow,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { fmtNumber, versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import {
  buildMultiplierSnapshot,
  buildWeighingGroups,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  WORK_SESSION_PROGRESS_STATUSES,
  workingAmount,
  type WorkSessionProgressStatus,
} from "@/lib/work-session";
import { ExperimentCreateModal } from "@/components/pilot/ExperimentCreateForm";
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

  const [viewMode, setViewMode] = useState<"WEIGHING" | "FORMULA">("WEIGHING");
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
    <div className="space-y-6">
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

      {rows.length > 0 && (
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
            />
          ) : (
            <FormulaView rows={rows} ingredientsByVersion={ingredientsByVersion} />
          )}
        </SectionCard>
      )}

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
        sort_order: nextSort,
      });
      if (error) throw error;
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
        <Field label="MULTIPLIER ×N">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
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

  const setMultiplier = useMutation({
    mutationFn: async (nextMultiplier: number) => {
      const previous = Number(row.multiplier);
      if (nextMultiplier === previous) return;
      const user_id = await currentUserId();
      const snapshot = buildMultiplierSnapshot(lines, nextMultiplier);
      const { error: updateError } = await supabase
        .from("work_session_formula_versions")
        .update({ multiplier: nextMultiplier })
        .eq("id", row.id);
      if (updateError) throw updateError;
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
            <span className="label-caps text-xs text-muted-foreground">×</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              className={`${inputClass} w-24 text-center`}
              defaultValue={Number(row.multiplier)}
              key={`multiplier-${row.id}-${row.multiplier}`}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) setMultiplier.mutate(next);
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
      {setMultiplier.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(setMultiplier.error as Error).message}
        </p>
      )}
      {showHistory && (
        <ul className="space-y-1 border border-dashed border-border p-2">
          {(history.data ?? []).length === 0 ? (
            <li className="font-mono text-xs text-muted-foreground">NO MULTIPLIER CHANGES YET</li>
          ) : (
            (history.data ?? []).map((h) => (
              <li key={h.id} className="font-mono text-xs text-muted-foreground">
                {formatDateTime(h.applied_at)} · ×{fmtNumber(Number(h.previous_multiplier))} → ×
                {fmtNumber(Number(h.applied_multiplier))}
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
  if (groups.length === 0 || columns.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        NO INGREDIENTS TO WEIGH YET
      </p>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 min-w-[160px] border-b border-r border-border bg-secondary px-3 py-2 text-left">
              <span className="label-caps text-xs text-muted-foreground">INGREDIENT</span>
            </th>
            {columns.map((col) => (
              <th
                key={col.formulaVersionId}
                className="sticky top-0 z-10 min-w-[140px] border-b border-l border-border bg-secondary px-3 py-2 text-left align-bottom"
              >
                <p className="text-xs leading-tight">{col.formulaName}</p>
                <p className="label-caps text-[11px] text-muted-foreground">
                  ×{fmtNumber(col.multiplier)}
                </p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.ingredientId} className="border-b border-border">
              <td className="sticky left-0 z-10 border-r border-border bg-background px-3 py-1.5 align-middle">
                <span className="text-sm">{group.ingredientName}</span>
              </td>
              {columns.map((col) => {
                const cell = group.cells.find((c) => c.formulaVersionId === col.formulaVersionId);
                return (
                  <td
                    key={col.formulaVersionId}
                    className="border-l border-border px-2 py-1 align-middle"
                  >
                    {cell ? (
                      <WeighingMatrixCell
                        sessionId={sessionId}
                        cell={cell}
                        onChanged={onProgressChanged}
                      />
                    ) : (
                      <span className="block text-center text-muted-foreground">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function nextProgressStatus(current: WorkSessionProgressStatus): WorkSessionProgressStatus {
  const idx = WORK_SESSION_PROGRESS_STATUSES.indexOf(current);
  const next = WORK_SESSION_PROGRESS_STATUSES[(idx + 1) % WORK_SESSION_PROGRESS_STATUSES.length];
  return next ?? "NOT_STARTED";
}

const STATUS_CELL_TONE: Record<WorkSessionProgressStatus, string> = {
  NOT_STARTED: "",
  DONE: "text-muted-foreground",
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
        {fmtNumber(cell.workingAmount, 2)}
        {cell.unit}
      </button>
      <button
        type="button"
        className="label-caps flex h-5 w-5 shrink-0 items-center justify-center border border-border text-xs leading-none hover:border-foreground"
        onClick={() => {
          const next = nextProgressStatus(cell.progressStatus);
          setProgress.mutate({ status: next });
          if (next === "SHORTAGE") setEditingNote(true);
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
                {multiplier !== 1 ? ` · ×${fmtNumber(multiplier)}` : ""}
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
                    {fmtNumber(workingAmount(Number(line.amount), multiplier), 2)}
                    {line.unit}
                    {multiplier !== 1 && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        (orig {fmtNumber(Number(line.amount), 2)}
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
