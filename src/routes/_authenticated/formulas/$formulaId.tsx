import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  experimentsByVersionQuery,
  formulaQuery,
  formulaVersionsQuery,
  mouldsQuery,
  versionIngredientsQuery,
  componentsQuery,
  techniqueCategoriesQuery,
  type VersionIngredientRow,
} from "@/lib/queries";
import {
  FORMULA_STATUSES,
  UNITS,
  diffIngredients,
  fmtNumber,
  isLockedStatus,
  parseNumber,
  toGrams,
  versionLabel,
  type FormulaStatus,
  type FormulaVersion,
} from "@/lib/formula";
import {
  balanceTotals,
  computeBases,
  parseBasisOverrides,
  rowScaledGrams,
  type BasisOverrides,
} from "@/lib/formula-calc";
import { functionShortName } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { techniquePath } from "@/lib/technique";
import { confirmBaseFormula } from "@/lib/technique-actions";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { MouldSelect } from "@/components/pilot/MouldSelect";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import { IngredientPicker } from "@/components/pilot/IngredientPicker";
import { ExperimentCreateModal } from "@/components/pilot/ExperimentCreateForm";
import { ExperimentListItems } from "@/components/pilot/ExperimentList";
import { BasisPanel } from "@/components/pilot/formula/BasisPanel";
import {
  FunctionalIngredientTable,
  type FunctionalRowPatch,
} from "@/components/pilot/formula/FunctionalIngredientTable";
import { CompositionPanel } from "@/components/pilot/formula/CompositionPanel";
import { BalancePanel, balanceSummaryLine } from "@/components/pilot/formula/BalancePanel";
import {
  Field,
  SectionCard,
  StatusBadge,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/formulas/$formulaId")({
  head: () => ({
    meta: [
      { title: "PILOT — Formula Detail" },
      { name: "description", content: "Formula versions, ingredient table and batch scaling" },
      { property: "og:title", content: "PILOT — Formula Detail" },
      {
        property: "og:description",
        content: "Formula versions, ingredient table and batch scaling",
      },
    ],
  }),
  component: FormulaDetailPage,
});

function FormulaDetailPage() {
  const { formulaId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const formula = useQuery(formulaQuery(formulaId));
  const versions = useQuery(formulaVersionsQuery(formulaId));
  const moulds = useQuery(mouldsQuery());
  const components = useQuery(componentsQuery());
  const techniqueCategories = useQuery(techniqueCategoriesQuery());

  const versionList = useMemo(() => versions.data ?? [], [versions.data]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [batch, setBatch] = useState("1");
  const [basisId, setBasisId] = useState(""); // baker's % 기준 재료
  const [adding, setAdding] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [creatingExperiment, setCreatingExperiment] = useState(false);

  useEffect(() => {
    if (versionList.length === 0) return;
    if (versionId && versionList.some((v) => v.id === versionId)) return;
    const current =
      versionList.find((v) => v.status === "CURRENT") ??
      versionList[versionList.length - 1];
    setVersionId(current?.id ?? null);
  }, [versionList, versionId]);

  const version = versionList.find((v) => v.id === versionId) ?? null;
  const ingredients = useQuery(versionIngredientsQuery(versionId));
  const rows = ingredients.data ?? [];
  const versionExperiments = useQuery(experimentsByVersionQuery(versionId));
  const experimentCount = versionExperiments.data?.length ?? 0;

  useEffect(() => setUnlocked(false), [versionId]);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "FORMULAS", path: "/formulas" },
    { label: (formula.data?.name ?? "…").toUpperCase() },
    ...(version ? [{ label: versionLabel(version.version_number) }] : []),
  ]);

  const locked = version ? isLockedStatus(version.status) && !unlocked : true;
  const batchValue = Math.max(parseNumber(batch) || 0, 0) || 1;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["formulas"] });
    await queryClient.invalidateQueries({ queryKey: ["formulas", formulaId] });
    await queryClient.invalidateQueries({
      queryKey: ["formula_versions", formulaId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["formula_version_ingredients", versionId],
    });
    await queryClient.invalidateQueries({ queryKey: ["mould_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["formulas_by_technique"] });
  };

  const updateFormula = useMutation({
    mutationFn: async (patch: {
      name?: string;
      component_id?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from("formulas")
        .update(patch)
        .eq("id", formulaId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** 기법 분류 변경 + 기준 배합 지정 — 중복 시 확인 후 교체 */
  const updateTechnique = useMutation({
    mutationFn: async ({
      techniqueId,
      isBase,
    }: {
      techniqueId: string | null;
      isBase: boolean;
    }) => {
      const base = await confirmBaseFormula({ formulaId, techniqueId, isBase });
      const { error } = await supabase
        .from("formulas")
        .update({ technique_category_id: techniqueId, is_base_formula: base })
        .eq("id", formulaId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateVersion = useMutation({
    mutationFn: async (patch: Partial<FormulaVersion>) => {
      if (!versionId) return;
      const { error } = await supabase
        .from("formula_versions")
        .update(patch)
        .eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addIngredient = useMutation({
    mutationFn: async ({ id, unit }: { id: string; unit: string }) => {
      if (!versionId) return;
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("formula_version_ingredients")
        .insert({
          user_id,
          formula_version_id: versionId,
          ingredient_id: id,
          amount: 0,
          unit,
          sort_order: rows.length,
          amount_source: "manual",
        });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateRow = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: FunctionalRowPatch;
    }) => {
      const { error } = await supabase
        .from("formula_version_ingredients")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formula_version_ingredients")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createVersion = useMutation({
    mutationFn: async ({
      summary,
      reason,
    }: {
      summary: string;
      reason: string;
    }) => {
      const user_id = await currentUserId();
      const nextNumber =
        versionList.reduce((max, v) => Math.max(max, v.version_number), 0) + 1;
      const { data, error } = await supabase
        .from("formula_versions")
        .insert({
          user_id,
          formula_id: formulaId,
          version_number: nextNumber,
          status: "DRAFT",
          default_mould_id: version?.default_mould_id ?? null,
          yield_quantity: version?.yield_quantity ?? null,
          change_summary: summary || null,
          change_reason: reason || null,
          bath_water_g: version?.bath_water_g ?? null,
          basis_overrides: version?.basis_overrides ?? {},
        })
        .select("id")
        .single();
      if (error) throw error;
      if (rows.length > 0) {
        const { error: copyError } = await supabase
          .from("formula_version_ingredients")
          .insert(
            rows.map((row) => ({
              user_id,
              formula_version_id: data.id,
              ingredient_id: row.ingredient_id,
              amount: row.amount,
              unit: row.unit,
              sort_order: row.sort_order,
              note: row.note,
              // 새 버전으로 복사된 값은 'copied'로 시작, 수정 시 'manual'이 된다
              amount_source: "copied",
            }))
          );
        if (copyError) throw copyError;
      }
      return data.id;
    },
    onSuccess: async (id) => {
      await invalidate();
      setCreatingVersion(false);
      setVersionId(id ?? null);
    },
  });

  const removeFormula = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("formulas")
        .delete()
        .eq("id", formulaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      void navigate({ to: "/formulas" });
    },
  });

  if (!formula.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {formula.isLoading ? "LOADING…" : "FORMULA NOT FOUND"}
      </p>
    );
  }

  /* ── 계산 (전부 표시용 — 저장되는 것은 amount와 amount_source뿐) ── */
  const overrides: BasisOverrides = parseBasisOverrides(version?.basis_overrides);
  const bathWaterG =
    version?.bath_water_g != null ? Number(version.bath_water_g) : null;
  const bases = computeBases(rows, overrides, bathWaterG);

  const bulkRows = rows.filter((r) => !r.ingredients?.is_functional);
  const functionalRows = rows.filter((r) => r.ingredients?.is_functional);

  // 총 중량 — N^k 스케일링 반영
  const totalGrams = rows.reduce((sum, row) => {
    const grams = toGrams(Number(row.amount), row.unit);
    return sum + (grams ?? 0);
  }, 0);
  const totalScaled = rows.reduce(
    (sum, row) => sum + rowScaledGrams(row, batchValue).scaled,
    0
  );

  // 배수 ≥ 2 + process_note 보유 재료 → 공정 주의
  const processCautions =
    batchValue >= 2
      ? rows.filter((r) => r.ingredients?.process_note)
      : [];

  // baker's % 기준 (벌크 테이블 수동 선택)
  const basisRow = rows.find((r) => r.ingredient_id === basisId) ?? null;
  const basisGrams = basisRow
    ? toGrams(Number(basisRow.amount), basisRow.unit) ?? 0
    : 0;
  const denominator = basisRow ? basisGrams : totalGrams;

  const mould = (moulds.data ?? []).find(
    (m) => m.id === version?.default_mould_id
  );
  const yieldQty = version?.yield_quantity ? Number(version.yield_quantity) : 0;

  const techniqueList = techniqueCategories.data ?? [];
  const techniquePathList = techniquePath(
    techniqueList,
    formula.data.technique_category_id
  );
  const technique = techniquePathList[techniquePathList.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <input
            className="w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-lg text-foreground outline-none hover:border-border focus:border-foreground"
            defaultValue={formula.data.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== formula.data?.name)
                updateFormula.mutate({ name });
            }}
          />
          {technique && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/settings/calibration/$techniqueId"
                params={{ techniqueId: technique.id }}
                className="label-caps inline-block border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                {technique.name}
              </Link>
              {formula.data.is_base_formula && (
                <span className="label-caps inline-block border border-border bg-secondary px-2 py-1 text-xs">
                  ⭐ 기준 배합
                </span>
              )}
            </div>
          )}
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(formula.data.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TechniqueSelect
            className={`${selectClass} w-auto`}
            value={formula.data.technique_category_id ?? ""}
            onChange={(id) =>
              updateTechnique.mutate({
                techniqueId: id || null,
                isBase: id ? formula.data!.is_base_formula : false,
              })
            }
          />
          <label className="flex min-h-[44px] items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-5 w-5 border border-input"
              checked={formula.data.is_base_formula}
              disabled={!formula.data.technique_category_id}
              onChange={(e) =>
                updateTechnique.mutate({
                  techniqueId: formula.data!.technique_category_id,
                  isBase: e.target.checked,
                })
              }
            />
            <span className="label-caps">기준 배합</span>
          </label>
          <select
            className={`${selectClass} w-auto`}
            value={formula.data.component_id ?? ""}
            onChange={(e) =>
              updateFormula.mutate({ component_id: e.target.value || null })
            }
          >
            <option value="">NO COMPONENT</option>
            {(components.data ?? []).map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
          {formula.data.component_id && (
            <Link
              to="/components/$componentId"
              params={{ componentId: formula.data.component_id }}
              className={`${buttonClass} px-3 text-xs`}
            >
              OPEN COMPONENT
            </Link>
          )}
        </div>
      </div>

      {/* VERSION BAR */}
      <div className="flex flex-wrap items-center gap-2 border border-border bg-card p-4">
        <select
          className={`${selectClass} w-auto`}
          value={versionId ?? ""}
          onChange={(e) => setVersionId(e.target.value)}
        >
          {versionList.map((v) => (
            <option key={v.id} value={v.id}>
              {`${versionLabel(v.version_number)} · ${v.status}`}
            </option>
          ))}
        </select>
        {version && <StatusBadge status={version.status} />}
        <select
          className={`${selectClass} w-auto`}
          value={version?.status ?? "DRAFT"}
          onChange={(e) =>
            updateVersion.mutate({ status: e.target.value as FormulaStatus })
          }
        >
          {FORMULA_STATUSES.map((status) => (
            <option key={status} value={status}>
              SET {status}
            </option>
          ))}
        </select>
        {version && isLockedStatus(version.status) && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              if (unlocked) {
                setUnlocked(false);
                return;
              }
              const ok = confirm(
                experimentCount > 0
                  ? `실험 ${experimentCount}개가 이 버전을 참조 중 — 배합 변경은 새 버전 생성을 권장합니다.\n오타 수정 등을 위해 잠금을 해제할까요?`
                  : "이 버전은 확정 상태입니다.\n배합 변경은 새 버전 생성을 권장합니다. 오타 수정 등을 위해 잠금을 해제할까요?"
              );
              if (ok) setUnlocked(true);
            }}
          >
            {unlocked ? "LOCK" : "EDIT"}
          </button>
        )}
        <button
          type="button"
          className={primaryButtonClass}
          onClick={() => setCreatingVersion(true)}
        >
          + NEW VERSION
        </button>
      </div>

      {locked && version && isLockedStatus(version.status) && (
        <p className="border border-dashed border-border px-4 py-3 font-mono text-xs uppercase text-muted-foreground">
          READ ONLY — {version.status} VERSION. USE [EDIT] OR CREATE A NEW VERSION.
        </p>
      )}

      {/* 공정 주의 — 배수 ≥ 2 + process_note 보유 재료 */}
      {processCautions.length > 0 && (
        <div className="border border-dashed border-foreground px-4 py-3">
          <p className="label-caps text-xs">PROCESS CAUTION — 배수 ×{fmtNumber(batchValue, 2)}</p>
          <ul className="mt-1 space-y-1">
            {processCautions.map((row) => (
              <li key={row.id} className="font-mono text-xs">
                {row.ingredients?.name}: {row.ingredients?.process_note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* YIELD & BATCH */}
      <SectionCard title="YIELD & BATCH">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="MOULD">
            <MouldSelect
              value={version?.default_mould_id ?? ""}
              disabled={locked}
              onChange={(id) =>
                updateVersion.mutate({ default_mould_id: id || null })
              }
            />
          </Field>
          <Field label="YIELD (QTY)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              className={`${inputClass} min-h-[52px] text-base`}
              disabled={locked}
              defaultValue={version?.yield_quantity ?? ""}
              key={`yield-${versionId}`}
              onBlur={(e) =>
                updateVersion.mutate({
                  yield_quantity: e.target.value
                    ? parseNumber(e.target.value)
                    : null,
                })
              }
            />
          </Field>
          <Field label="BATCH ×N (VIEW ONLY)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              className={`${inputClass} min-h-[52px] bg-secondary text-base`}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
          </Field>
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              TOTAL WEIGHT
            </span>
            <p className="font-mono text-base tabular-nums">
              {fmtNumber(totalGrams)}g
              <span className="ml-2 bg-secondary px-2 py-0.5 text-sm">
                ×{fmtNumber(batchValue, 2)} = {fmtNumber(totalScaled)}g
              </span>
            </p>
            <p className="font-mono text-xs uppercase text-muted-foreground">
              {mould ? mould.name : "NO MOULD"}
              {yieldQty
                ? ` ${fmtNumber(yieldQty * batchValue, 2)}개 · ${fmtNumber(totalScaled)}g`
                : ""}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* BASIS — 기준량 자동 집계 */}
      {version && (
        <BasisPanel
          bases={bases}
          rows={rows}
          overrides={overrides}
          bathWaterG={bathWaterG}
          locked={locked}
          onOverridesChange={(next) =>
            updateVersion.mutate({
              basis_overrides: next as unknown as FormulaVersion["basis_overrides"],
            })
          }
          onBathChange={(grams) => updateVersion.mutate({ bath_water_g: grams })}
        />
      )}

      {/* BULK INGREDIENTS */}
      <SectionCard
        title="BULK INGREDIENTS"
        action={
          <div className="flex items-center gap-2">
            <select
              className="label-caps border border-input bg-background px-2 py-2 text-xs"
              value={basisId}
              onChange={(e) => setBasisId(e.target.value)}
            >
              <option value="">% OF TOTAL</option>
              {rows.map((row) => (
                <option key={row.ingredient_id} value={row.ingredient_id}>
                  BAKER&apos;S % — {row.ingredients?.name}
                </option>
              ))}
            </select>
            {!locked && (
              <button
                type="button"
                className="label-caps px-2 py-2 text-xs hover:bg-secondary"
                onClick={() => setAdding(true)}
              >
                + ADD INGREDIENT
              </button>
            )}
          </div>
        }
      >
        {bulkRows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO BULK INGREDIENTS IN THIS VERSION
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  {[
                    "INGREDIENT",
                    "BASE ×1",
                    `×${fmtNumber(batchValue, 2)} BATCH`,
                    "UNIT",
                    "%",
                    "FUNCTION",
                    "NOTE",
                    "",
                  ].map((header) => (
                    <th
                      key={header}
                      className="label-caps px-2 py-2 text-xs text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row) => (
                  <IngredientTableRow
                    key={row.id}
                    row={row}
                    locked={locked}
                    batch={batchValue}
                    denominator={denominator}
                    onPatch={(patch) => updateRow.mutate({ id: row.id, patch })}
                    onRemove={() => removeRow.mutate(row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* FUNCTIONAL INGREDIENTS */}
      <SectionCard
        title="FUNCTIONAL INGREDIENTS"
        action={
          !locked ? (
            <button
              type="button"
              className="label-caps px-2 py-2 text-xs hover:bg-secondary"
              onClick={() => setAdding(true)}
            >
              + ADD INGREDIENT
            </button>
          ) : undefined
        }
      >
        <FunctionalIngredientTable
          rows={functionalRows}
          bases={bases}
          locked={locked}
          batch={batchValue}
          onPatch={(id, patch) => updateRow.mutate({ id, patch })}
          onRemove={(id) => removeRow.mutate(id)}
        />
      </SectionCard>

      {/* COMPOSITION / BALANCE */}
      <CompositionPanel rows={rows} batch={batchValue} />
      <BalancePanel rows={rows} batch={batchValue} />

      {/* NOTES */}
      <SectionCard title="VERSION NOTES">
        <textarea
          rows={3}
          key={`notes-${versionId}`}
          className={inputClass}
          disabled={locked}
          defaultValue={version?.notes ?? ""}
          onBlur={(e) => updateVersion.mutate({ notes: e.target.value })}
        />
      </SectionCard>

      {/* RELATED EXPERIMENTS */}
      <SectionCard
        title="RELATED EXPERIMENTS"
        action={
          <button
            type="button"
            className="label-caps px-2 py-2 text-xs hover:bg-secondary"
            onClick={() => setCreatingExperiment(true)}
            disabled={!versionId}
          >
            + NEW EXPERIMENT
          </button>
        }
      >
        <ExperimentListItems items={versionExperiments.data ?? []} />
      </SectionCard>

      {/* HISTORY */}
      <VersionHistory
        formulaId={formulaId}
        versions={versionList}
        onOpen={(id) => setVersionId(id)}
      />

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (
            confirm(
              "DELETE THIS FORMULA AND ALL ITS VERSIONS? (버전 단위 삭제는 지원하지 않습니다 — ARCHIVED로 변경하세요)"
            )
          )
            removeFormula.mutate();
        }}
      >
        DELETE FORMULA
      </button>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">ADD INGREDIENT</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setAdding(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <IngredientPicker
                onCancel={() => setAdding(false)}
                onPick={(id, unit) => {
                  addIngredient.mutate({ id, unit });
                  setAdding(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {creatingVersion && (
        <NewVersionModal
          fromLabel={version ? versionLabel(version.version_number) : "—"}
          pending={createVersion.isPending}
          onCancel={() => setCreatingVersion(false)}
          onCreate={(summary, reason) =>
            createVersion.mutate({ summary, reason })
          }
        />
      )}

      {creatingExperiment && versionId && (
        <ExperimentCreateModal
          preset={{
            formulaId,
            formulaVersionId: versionId,
            componentId: formula.data.component_id,
            mouldId: version?.default_mould_id ?? null,
            batch: batchValue,
          }}
          onCancel={() => setCreatingExperiment(false)}
          onCreated={(id) => {
            setCreatingExperiment(false);
            void navigate({
              to: "/experiments/$experimentId",
              params: { experimentId: id },
            });
          }}
        />
      )}
    </div>
  );
}

function IngredientTableRow({
  row,
  locked,
  batch,
  denominator,
  onPatch,
  onRemove,
}: {
  row: VersionIngredientRow;
  locked: boolean;
  batch: number;
  denominator: number;
  onPatch: (patch: FunctionalRowPatch) => void;
  onRemove: () => void;
}) {
  const amount = Number(row.amount);
  const grams = toGrams(amount, row.unit);
  const percent =
    denominator > 0 && grams !== null ? (grams / denominator) * 100 : null;
  const functions = (row.ingredients?.ingredient_function_links ?? [])
    .map((link) => link.ingredient_functions)
    .filter((fn) => Boolean(fn))
    .map((fn) => functionShortName(fn!))
    .join(" / ");
  const scaled = rowScaledGrams(row, batch);

  return (
    <tr className="border-b border-border align-middle">
      <td className="px-2 py-2 text-sm">
        <Link
          to="/ingredients/$ingredientId"
          params={{ ingredientId: row.ingredient_id }}
          className="hover:underline"
        >
          {row.ingredients?.name ?? "—"}
        </Link>
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          className="min-h-[48px] w-24 border border-input bg-background px-2 py-2 font-mono text-base tabular-nums outline-none focus:border-foreground disabled:opacity-60"
          disabled={locked}
          defaultValue={amount}
          key={`amt-${row.id}-${amount}`}
          onBlur={(e) => {
            const next = parseNumber(e.target.value);
            // 직접 수정하면 manual이 된다 (copied → manual 전환)
            if (next !== amount) onPatch({ amount: next, amount_source: "manual" });
          }}
        />
      </td>
      <td className="bg-secondary px-2 py-2 font-mono text-sm tabular-nums">
        {fmtNumber(scaled.scaled, 2)}
        {scaled.nonLinear && (
          <span className="block text-[10px] text-muted-foreground">
            비례 시 {fmtNumber(scaled.linear, 2)}
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        <select
          className="min-h-[48px] w-20 border border-input bg-background px-2 py-2 font-mono text-sm disabled:opacity-60"
          disabled={locked}
          value={row.unit}
          onChange={(e) => onPatch({ unit: e.target.value })}
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2 font-mono text-sm tabular-nums">
        {percent === null ? "—" : `${fmtNumber(percent, 1)}%`}
      </td>
      <td className="px-2 py-2 font-mono text-xs uppercase text-muted-foreground">
        {functions || "—"}
      </td>
      <td className="px-2 py-2">
        <input
          className="min-h-[48px] w-40 border border-input bg-background px-2 py-2 text-base outline-none focus:border-foreground disabled:opacity-60"
          disabled={locked}
          defaultValue={row.note ?? ""}
          key={`note-${row.id}`}
          onBlur={(e) => {
            const note = e.target.value.trim() || null;
            if (note !== (row.note ?? null)) onPatch({ note });
          }}
        />
      </td>
      <td className="px-2 py-2">
        {!locked && (
          <button
            type="button"
            className="label-caps min-h-[48px] px-2 text-xs hover:bg-secondary"
            onClick={onRemove}
          >
            REMOVE
          </button>
        )}
      </td>
    </tr>
  );
}

function VersionHistory({
  formulaId,
  versions,
  onOpen,
}: {
  formulaId: string;
  versions: FormulaVersion[];
  onOpen: (id: string) => void;
}) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");

  const leftRows = useQuery(versionIngredientsQuery(left || null));
  const rightRows = useQuery(versionIngredientsQuery(right || null));

  const simplify = (rows: VersionIngredientRow[] | undefined) =>
    (rows ?? []).map((row) => ({
      name: row.ingredients?.name ?? "—",
      amount: Number(row.amount),
      unit: row.unit,
    }));

  const diff =
    left && right ? diffIngredients(simplify(leftRows.data), simplify(rightRows.data)) : [];

  // 버전 간 균형 이동
  const leftBalance = left ? balanceTotals(leftRows.data ?? [], 1) : null;
  const rightBalance = right ? balanceTotals(rightRows.data ?? [], 1) : null;
  const balanceDelta =
    leftBalance && rightBalance
      ? [
          leftBalance.toughenTender && rightBalance.toughenTender
            ? {
                label: "연화",
                delta:
                  rightBalance.toughenTender.right - leftBalance.toughenTender.right,
              }
            : null,
          leftBalance.moistenDry && rightBalance.moistenDry
            ? {
                label: "습윤",
                delta: rightBalance.moistenDry.left - leftBalance.moistenDry.left,
              }
            : null,
        ].filter((d): d is { label: string; delta: number } => Boolean(d))
      : [];

  return (
    <SectionCard title="VERSION HISTORY">
      <ul className="divide-y divide-border border border-border">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-center gap-2 px-3 py-3"
          >
            <button
              type="button"
              className="label-caps min-w-[3rem] text-left hover:underline"
              onClick={() => onOpen(version.id)}
            >
              {versionLabel(version.version_number)}
            </button>
            <StatusBadge status={version.status} />
            <span className="flex-1 text-sm">
              {version.change_summary || "—"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatDateTime(version.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="COMPARE FROM">
          <select
            className={selectClass}
            value={left}
            onChange={(e) => setLeft(e.target.value)}
          >
            <option value="">—</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version.version_number)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="COMPARE TO">
          <select
            className={selectClass}
            value={right}
            onChange={(e) => setRight(e.target.value)}
          >
            <option value="">—</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version.version_number)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {left && right && (
        <div className="mt-4 border border-border" key={`${formulaId}-diff`}>
          {diff.length === 0 ? (
            <p className="px-3 py-3 font-mono text-xs uppercase text-muted-foreground">
              NO DIFFERENCE
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {diff.map((row) => (
                <li
                  key={row.name}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 font-mono text-sm"
                >
                  <span className="label-caps min-w-[8rem]">{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.from ?? "NONE"}
                  </span>
                  <span>→</span>
                  <span>{row.to ?? "REMOVED"}</span>
                </li>
              ))}
            </ul>
          )}
          {leftBalance && rightBalance && (
            <div className="border-t border-border px-3 py-3">
              <p className="label-caps text-[11px] text-muted-foreground">BALANCE SHIFT</p>
              <p className="mt-1 font-mono text-xs tabular-nums">
                {balanceSummaryLine(leftBalance)} → {balanceSummaryLine(rightBalance)}
              </p>
              {balanceDelta.length > 0 && (
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  {balanceDelta
                    .map(
                      (d) =>
                        `${d.label} ${d.delta >= 0 ? "+" : ""}${fmtNumber(d.delta, 1)}%`
                    )
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function NewVersionModal({
  fromLabel,
  pending,
  onCancel,
  onCreate,
}: {
  fromLabel: string;
  pending: boolean;
  onCancel: () => void;
  onCreate: (summary: string, reason: string) => void;
}) {
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW VERSION FROM {fromLabel}</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(summary.trim(), reason.trim());
          }}
        >
          <p className="font-mono text-xs uppercase text-muted-foreground">
            COPIES CURRENT INGREDIENT TABLE INTO A NEW DRAFT
          </p>
          <Field label="CHANGE SUMMARY">
            <input
              className={inputClass}
              autoFocus
              required
              placeholder="SUGAR 120g → 110g"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="CHANGE REASON (OPTIONAL)">
            <textarea
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              CREATE DRAFT
            </button>
            <button type="button" className={buttonClass} onClick={onCancel}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
