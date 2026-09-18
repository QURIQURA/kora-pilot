import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  currentUserId,
  experimentObservationsQuery,
  experimentQuery,
  ingredientsQuery,
  versionIngredientsQuery,
} from "@/lib/queries";
import { EXPERIMENT_STATUSES, experimentLabel, type ExperimentStatus } from "@/lib/experiment";
import { parseNumber, versionLabel, UNITS } from "@/lib/formula";
import { formatDateLabel, formatDateTime, formatTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { MouldSelect } from "@/components/pilot/MouldSelect";
import { IngredientPicker } from "@/components/pilot/IngredientPicker";
import { ProcessTimelineSection } from "@/components/pilot/ProcessTimelineSection";
import { SensoryEvaluationSection } from "@/components/pilot/SensoryEvaluationSection";
import { experimentsForBaselineQuery, experimentVariantsQuery } from "@/lib/queries";
import { lossPct } from "@/lib/experiment";
import { ingredientDisplayName } from "@/lib/pilot";
import {
  DEVELOPMENT_OUTCOMES,
  developmentOutcomeLabel,
  saveDevelopment,
  type DevelopmentIngredientDraft,
  type DevelopmentOutcome,
} from "@/lib/development";
import {
  Field,
  SectionCard,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/experiments/$experimentId")({
  head: () => ({
    meta: [
      { title: "PILOT — Experiment Detail" },
      {
        name: "description",
        content: "Experiment hypothesis, observations and conclusion",
      },
      { property: "og:title", content: "PILOT — Experiment Detail" },
      {
        property: "og:description",
        content: "Experiment hypothesis, observations and conclusion",
      },
    ],
  }),
  component: ExperimentDetailPage,
});

function ExperimentDetailPage() {
  const { experimentId } = Route.useParams();
  const queryClient = useQueryClient();

  const experiment = useQuery(experimentQuery(experimentId));
  const observations = useQuery(experimentObservationsQuery(experimentId));
  const baselineOptions = useQuery(experimentsForBaselineQuery(experimentId));
  const variants = useQuery(experimentVariantsQuery(experimentId));
  const exp = experiment.data;

  const [obsLabel, setObsLabel] = useState("");
  const [obsValue, setObsValue] = useState("");

  /* ── FORMULA SNAPSHOT & SAVE DEVELOPMENT ─────────────────────
   * "Save Development" = 이 화면의 가장 중요한 mutation. 재료 변경, 판정(outcome),
   * product-specific 조정 여부를 한 번에 확정한다. hypothesis/result 등 텍스트 필드는
   * 기존처럼 각자 blur 시 바로 저장되지만, 배합 스냅샷/판정은 이 버튼을 눌러야 반영된다. */
  const currentRows = useQuery(versionIngredientsQuery(exp?.formula_version_id ?? null));
  const ingredientMaster = useQuery(ingredientsQuery());
  const [draftRows, setDraftRows] = useState<DevelopmentIngredientDraft[] | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DevelopmentOutcome>("KEEP");
  const [promoteComponentWide, setPromoteComponentWide] = useState(true);
  const [changeSummary, setChangeSummary] = useState("");
  const [quantityGForProduct, setQuantityGForProduct] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);

  useEffect(() => {
    if (exp?.formula_version_id && currentRows.data && initializedFor !== exp.formula_version_id) {
      setDraftRows(
        currentRows.data.map((row) => ({
          ingredient_id: row.ingredient_id,
          amount: Number(row.amount),
          unit: row.unit,
          note: row.note,
          sort_order: row.sort_order,
        })),
      );
      setInitializedFor(exp.formula_version_id);
    }
  }, [exp?.formula_version_id, currentRows.data, initializedFor]);

  const ingredientName = (id: string) => {
    const fromCurrent = (currentRows.data ?? []).find((r) => r.ingredient_id === id)?.ingredients;
    if (fromCurrent) return ingredientDisplayName(fromCurrent);
    const found = (ingredientMaster.data ?? []).find((i) => i.id === id);
    return found ? ingredientDisplayName(found) : "—";
  };

  const updateDraftRow = (idx: number, patch: Partial<DevelopmentIngredientDraft>) => {
    setDraftRows((rows) => (rows ? rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : rows));
  };
  const removeDraftRow = (idx: number) => {
    setDraftRows((rows) => (rows ? rows.filter((_, i) => i !== idx) : rows));
  };
  const addDraftRow = (ingredientId: string, unit: string) => {
    setDraftRows((rows) => {
      const base = rows ?? [];
      if (base.some((r) => r.ingredient_id === ingredientId)) return base;
      return [...base, { ingredient_id: ingredientId, amount: 0, unit, note: null, sort_order: base.length }];
    });
    setAddingIngredient(false);
  };

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "EXPERIMENTS", path: "/experiments" },
    { label: experimentLabel(exp?.experiment_number) },
  ]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["experiments"] });
    await queryClient.invalidateQueries({
      queryKey: ["observations", experimentId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["experiments_by_version"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["experiments_by_product"],
    });
    await queryClient.invalidateQueries({ queryKey: ["active_experiments"] });
    await queryClient.invalidateQueries({ queryKey: ["recent_observations"] });
  };

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"experiments">) => {
      const { error } = await supabase.from("experiments").update(patch).eq("id", experimentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addObservation = useMutation({
    mutationFn: async ({ label, value }: { label: string; value: string }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("observations")
        .insert({ user_id, experiment_id: experimentId, label, value });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateObservation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string | null }) => {
      const { error } = await supabase.from("observations").update({ note }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeObservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("observations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const saveDevelopmentMutation = useMutation({
    mutationFn: async () => {
      if (!exp) throw new Error("no experiment");
      if (!exp.formula_version_id || !exp.formula_versions) {
        throw new Error("연결된 FORMULA VERSION이 없습니다");
      }
      if (!draftRows) throw new Error("재료표 로딩 중");
      return saveDevelopment({
        experimentId: exp.id,
        formulaId: exp.formula_versions.formula_id,
        baseFormulaVersionId: exp.formula_version_id,
        draftRows,
        currentRows: currentRows.data ?? [],
        changeSummary: changeSummary.trim() || null,
        hypothesis: exp.hypothesis,
        variables: exp.variables,
        controlVariables: exp.control_variables,
        result: exp.result,
        conclusion: exp.conclusion,
        nextExperiment: exp.next_experiment,
        outcome,
        productId: exp.product_id,
        promoteComponentWide,
        componentId: exp.component_id,
        batchMultiplier: Number(exp.batch_multiplier),
        rawWeightG: exp.raw_weight_g,
        processedWeightG: exp.processed_weight_g,
        finishedWeightG: exp.finished_weight_g,
        quantityGForProduct: quantityGForProduct.trim() ? parseNumber(quantityGForProduct) : null,
      });
    },
    onSuccess: async (result) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["formula_version_ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["formulas_by_component"] });
      await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
      await queryClient.invalidateQueries({ queryKey: ["product_components"] });
      if (result.createdNewSnapshot) setInitializedFor(null);
    },
  });

  if (!exp) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {experiment.isLoading ? "LOADING…" : "EXPERIMENT NOT FOUND"}
      </p>
    );
  }

  const submitObservation = () => {
    const label = obsLabel.trim();
    const value = obsValue.trim();
    if (!label && !value) return;
    addObservation.mutate({ label, value });
    setObsLabel("");
    setObsValue("");
  };

  const rows = observations.data ?? [];
  const linkClass =
    "flex min-h-[44px] items-center border border-input bg-background px-3 text-sm hover:bg-secondary";

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl text-foreground">
            {experimentLabel(exp.experiment_number)}
          </h1>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {formatDateLabel(exp.date)} · CREATED {formatDateTime(exp.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={exp.status} />
          <select
            className={`${selectClass} w-auto`}
            value={exp.status}
            onChange={(e) => update.mutate({ status: e.target.value as ExperimentStatus })}
          >
            {EXPERIMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                SET {status}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="EXPERIMENT DATE"
            className={`${inputClass} w-auto`}
            defaultValue={exp.date}
            key={`date-${exp.id}`}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== exp.date)
                update.mutate({ date: e.target.value });
            }}
          />
        </div>
      </div>

      {/* LINKED CONTEXT — 양방향 탐색 */}
      <SectionCard title="LINKED CONTEXT">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="PRODUCT">
            {exp.products ? (
              <Link
                to="/products/$productId"
                params={{ productId: exp.products.id }}
                className={linkClass}
              >
                {exp.products.name}
              </Link>
            ) : (
              <p className="flex min-h-[44px] items-center border border-dashed border-border px-3 font-mono text-sm text-muted-foreground">
                —
              </p>
            )}
          </Field>
          <Field label="COMPONENT">
            {exp.components ? (
              <Link
                to="/components/$componentId"
                params={{ componentId: exp.components.id }}
                className={linkClass}
              >
                {exp.components.name}
              </Link>
            ) : (
              <p className="flex min-h-[44px] items-center border border-dashed border-border px-3 font-mono text-sm text-muted-foreground">
                —
              </p>
            )}
          </Field>
          <Field label="FORMULA VERSION">
            {exp.formula_versions ? (
              <Link
                to="/formulas/$formulaId"
                params={{ formulaId: exp.formula_versions.formula_id }}
                className={linkClass}
              >
                {exp.formula_versions.formulas?.name ?? "FORMULA"} ·{" "}
                {versionLabel(exp.formula_versions.version_number)}
              </Link>
            ) : (
              <p className="flex min-h-[44px] items-center border border-dashed border-border px-3 font-mono text-sm text-muted-foreground">
                —
              </p>
            )}
          </Field>
          <Field label="MOULD (USED)">
            <MouldSelect
              value={exp.mould_id ?? ""}
              onChange={(id) => update.mutate({ mould_id: id || null })}
            />
          </Field>
          <Field label="BATCH ×N (ACTUAL)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              className={`${inputClass} min-h-[52px] text-base`}
              defaultValue={Number(exp.batch_multiplier)}
              key={`batch-${exp.id}`}
              onBlur={(e) => {
                const next = parseNumber(e.target.value);
                if (next !== Number(exp.batch_multiplier))
                  update.mutate({ batch_multiplier: next });
              }}
            />
          </Field>
        </div>
      </SectionCard>

      {/* FORMULA SNAPSHOT & SAVE DEVELOPMENT — 이 화면의 가장 중요한 mutation */}
      <SectionCard
        title="FORMULA SNAPSHOT"
        action={
          exp.formula_version_id && (
            <button
              type="button"
              className="label-caps px-2 py-2 text-xs hover:bg-secondary"
              onClick={() => setAddingIngredient(true)}
            >
              + ADD INGREDIENT
            </button>
          )
        }
      >
        {!exp.formula_version_id || !exp.formula_versions ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            연결된 FORMULA VERSION이 없습니다.
          </p>
        ) : draftRows === null ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
        ) : (
          <div className="space-y-4">
            <p className="font-mono text-[11px] uppercase text-muted-foreground">
              {exp.formula_versions.formulas?.name ?? "FORMULA"} ·{" "}
              {versionLabel(exp.formula_versions.version_number)} 기준 — 여기서 바꾼 내용은 아래{" "}
              <span className="font-semibold">SAVE DEVELOPMENT</span>를 눌러야 기록됩니다.
            </p>
            {draftRows.length === 0 ? (
              <p className="font-mono text-xs uppercase text-muted-foreground">재료 없음</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label-caps px-2 py-2 text-xs text-muted-foreground">INGREDIENT</th>
                    <th className="label-caps px-2 py-2 text-xs text-muted-foreground">AMOUNT</th>
                    <th className="label-caps px-2 py-2 text-xs text-muted-foreground">UNIT</th>
                    <th className="label-caps px-2 py-2 text-xs text-muted-foreground">NOTE</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row, idx) => (
                    <tr key={row.ingredient_id} className="border-b border-border align-top">
                      <td className="px-2 py-2 text-sm">{ingredientName(row.ingredient_id)}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          className={`${inputClass} w-28`}
                          defaultValue={row.amount}
                          key={`amt-${row.ingredient_id}-${initializedFor}`}
                          onBlur={(e) => updateDraftRow(idx, { amount: parseNumber(e.target.value) })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className={`${selectClass} w-20`}
                          value={row.unit}
                          onChange={(e) => updateDraftRow(idx, { unit: e.target.value })}
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className={`${inputClass} min-w-[8rem]`}
                          defaultValue={row.note ?? ""}
                          key={`note-${row.ingredient_id}-${initializedFor}`}
                          onBlur={(e) => updateDraftRow(idx, { note: e.target.value || null })}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="label-caps px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => removeDraftRow(idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Field label="CHANGE SUMMARY (선택) — 이번에 뭘 바꿨는지 한 줄">
              <input
                className={inputClass}
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="설탕 120g → 110g"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="OUTCOME — R&D 판정">
                <select
                  className={selectClass}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as DevelopmentOutcome)}
                >
                  {DEVELOPMENT_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {developmentOutcomeLabel(o)}
                    </option>
                  ))}
                </select>
              </Field>
              {exp.product_id && (
                <Field label="반영 범위">
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={promoteComponentWide}
                      onChange={(e) => setPromoteComponentWide(e.target.checked)}
                    />
                    COMPONENT 전체(CURRENT FORMULA)에 반영
                  </label>
                  {!promoteComponentWide && (
                    <input
                      type="number"
                      inputMode="decimal"
                      className={`${inputClass} mt-1`}
                      placeholder="이 PRODUCT 전용 사용량 (g)"
                      value={quantityGForProduct}
                      onChange={(e) => setQuantityGForProduct(e.target.value)}
                    />
                  )}
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {promoteComponentWide
                      ? "이 COMPONENT를 쓰는 모든 PRODUCT에 반영됩니다."
                      : "이 PRODUCT에만 적용되는 조정으로 기록됩니다 — 새 FORMULA를 만들지 않습니다."}
                  </p>
                </Field>
              )}
            </div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saveDevelopmentMutation.isPending}
              onClick={() => saveDevelopmentMutation.mutate()}
            >
              SAVE DEVELOPMENT
            </button>
            {saveDevelopmentMutation.isError && (
              <p className="font-mono text-xs uppercase text-destructive">
                저장 실패 — 다시 시도해주세요
              </p>
            )}
            {saveDevelopmentMutation.isSuccess && !saveDevelopmentMutation.isPending && (
              <p className="font-mono text-xs uppercase text-muted-foreground">
                ✓ SAVED — {saveDevelopmentMutation.data?.createdNewSnapshot ? "새 스냅샷 기록됨" : "변경사항 없음(기록만 갱신)"}
                {saveDevelopmentMutation.data?.promotedToCurrent ? " · CURRENT로 승격" : ""}
              </p>
            )}
          </div>
        )}
        {addingIngredient && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
            <div className="w-full max-w-md border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="label-caps">ADD INGREDIENT</span>
                <button
                  type="button"
                  className="label-caps px-2 py-2"
                  onClick={() => setAddingIngredient(false)}
                >
                  CLOSE
                </button>
              </div>
              <div className="p-4">
                <IngredientPicker
                  onCancel={() => setAddingIngredient(false)}
                  onPick={(id, unit) => addDraftRow(id, unit)}
                />
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* BASELINE / VARIANT — 이번 실험의 비교 기준 (Formula의 is_base_formula와는 별개 개념) */}
      <SectionCard title="EXPERIMENT BASELINE / VARIANT">
        <p className="mb-3 font-mono text-[11px] text-muted-foreground">
          BASE FORMULA(기법의 기준 배합)와는 다른 개념입니다 — 여기서는 이번 실험이 어떤{" "}
          <span className="font-semibold">실험</span>과 비교되는지를 관리합니다.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="BASELINE EXPERIMENT (OPTIONAL) — 이번 실험의 비교 기준">
            <select
              className={selectClass}
              value={exp.baseline_experiment_id ?? ""}
              onChange={(e) => update.mutate({ baseline_experiment_id: e.target.value || null })}
            >
              <option value="">— NONE —</option>
              {(baselineOptions.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {experimentLabel(b.experiment_number)} · {formatDateLabel(b.date)}
                </option>
              ))}
            </select>
            {exp.baseline_experiment_id &&
              (() => {
                const baseline = (baselineOptions.data ?? []).find(
                  (b) => b.id === exp.baseline_experiment_id,
                );
                return (
                  <p className="mt-1">
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: exp.baseline_experiment_id! }}
                      className={linkClass}
                    >
                      → {baseline ? `${experimentLabel(baseline.experiment_number)} · ${formatDateLabel(baseline.date)}` : "VIEW BASELINE EXPERIMENT"}
                    </Link>
                  </p>
                );
              })()}
          </Field>
          <Field label="USED AS BASELINE BY (VARIANTS)">
            {(variants.data ?? []).length === 0 ? (
              <p className="flex min-h-[44px] items-center border border-dashed border-border px-3 font-mono text-sm text-muted-foreground">
                이 실험을 baseline으로 사용하는 실험 없음
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border">
                {(variants.data ?? []).map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-3 py-2">
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: v.id }}
                      className={linkClass}
                    >
                      {experimentLabel(v.experiment_number)} · {formatDateLabel(v.date)}
                    </Link>
                    <span className="label-caps text-xs text-muted-foreground">{v.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </SectionCard>

      {/* YIELD / LOSS — 실측값. Formula Version의 yield_quantity(이론값)와는 별개 */}
      <SectionCard title="YIELD / LOSS">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="RAW WEIGHT (g)">
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              defaultValue={exp.raw_weight_g ?? ""}
              key={`raw-${exp.id}-${exp.raw_weight_g ?? ""}`}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const raw_weight_g = raw === "" ? null : parseNumber(raw);
                if (raw_weight_g !== (exp.raw_weight_g ?? null)) update.mutate({ raw_weight_g });
              }}
            />
          </Field>
          <Field label="PROCESSED WEIGHT (g)">
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              defaultValue={exp.processed_weight_g ?? ""}
              key={`processed-${exp.id}-${exp.processed_weight_g ?? ""}`}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const processed_weight_g = raw === "" ? null : parseNumber(raw);
                if (processed_weight_g !== (exp.processed_weight_g ?? null))
                  update.mutate({ processed_weight_g });
              }}
            />
          </Field>
          <Field label="FINISHED WEIGHT (g)">
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              defaultValue={exp.finished_weight_g ?? ""}
              key={`finished-${exp.id}-${exp.finished_weight_g ?? ""}`}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const finished_weight_g = raw === "" ? null : parseNumber(raw);
                if (finished_weight_g !== (exp.finished_weight_g ?? null))
                  update.mutate({ finished_weight_g });
              }}
            />
          </Field>
        </div>
        <p className="mt-3 font-mono text-xs uppercase text-muted-foreground">
          LOSS %{" "}
          {(() => {
            const pct = lossPct(exp.raw_weight_g, exp.finished_weight_g);
            return pct == null ? "— (RAW/FINISHED 입력 시 계산)" : `${pct.toFixed(1)}%`;
          })()}
          {" — 저장되지 않고 화면에서만 계산됩니다"}
        </p>
      </SectionCard>

      {/* HYPOTHESIS / VARIABLES / CONTROL */}
      <SectionCard title="HYPOTHESIS & VARIABLES">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Field label="HYPOTHESIS">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.hypothesis ?? ""}
              key={`hyp-${exp.updated_at}`}
              placeholder="가설 — 무엇을 확인하려는가"
              onBlur={(e) => {
                if (e.target.value !== (exp.hypothesis ?? ""))
                  update.mutate({ hypothesis: e.target.value || null });
              }}
            />
          </Field>
          <Field label="VARIABLES (CHANGED)">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.variables ?? ""}
              key={`var-${exp.updated_at}`}
              placeholder="이번에 바꾼 것"
              onBlur={(e) => {
                if (e.target.value !== (exp.variables ?? ""))
                  update.mutate({ variables: e.target.value || null });
              }}
            />
          </Field>
          <Field label="CONTROL VARIABLES (KEPT)">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.control_variables ?? ""}
              key={`ctl-${exp.updated_at}`}
              placeholder="그대로 유지한 것"
              onBlur={(e) => {
                if (e.target.value !== (exp.control_variables ?? ""))
                  update.mutate({ control_variables: e.target.value || null });
              }}
            />
          </Field>
        </div>
      </SectionCard>

      {/* OBSERVATIONS — 사용자 기록 영역 */}
      <SectionCard title="OBSERVATIONS">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} w-36`}
            placeholder="LABEL (HEIGHT…)"
            value={obsLabel}
            onChange={(e) => setObsLabel(e.target.value)}
          />
          <input
            className={`${inputClass} min-w-[12rem] flex-1`}
            placeholder="VALUE (12cm peak → 10cm final)"
            value={obsValue}
            onChange={(e) => setObsValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitObservation();
              }
            }}
          />
          <button
            type="button"
            className={primaryButtonClass}
            disabled={addObservation.isPending}
            onClick={submitObservation}
          >
            + ADD
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] uppercase text-muted-foreground">
          USER RECORD — AI는 이 영역을 수정/삭제하지 않습니다
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 font-mono text-xs uppercase text-muted-foreground">
            NO OBSERVATIONS YET
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border border-border">
            {rows.map((obs) => (
              <li key={obs.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-14 font-mono text-xs text-muted-foreground">
                  {formatTime(obs.created_at)}
                </span>
                <span className="label-caps bg-foreground px-2 py-0.5 text-[11px] text-background">
                  {(obs.label || "NOTE").toUpperCase()}
                </span>
                <span className="min-w-[10rem] flex-1 text-sm">{obs.value}</span>
                <input
                  className="min-h-[44px] w-44 border border-transparent bg-transparent px-2 text-xs text-muted-foreground outline-none hover:border-border focus:border-foreground"
                  defaultValue={obs.note ?? ""}
                  placeholder="NOTE…"
                  key={`onote-${obs.id}`}
                  onBlur={(e) => {
                    const note = e.target.value.trim() || null;
                    if (note !== (obs.note ?? null)) updateObservation.mutate({ id: obs.id, note });
                  }}
                />
                <button
                  type="button"
                  className="label-caps min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => removeObservation.mutate(obs.id)}
                >
                  REMOVE
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* SENSORY EVALUATION — Observation(자유 기록)과 별개, structured measurement */}
      <SensoryEvaluationSection experimentId={exp.id} />

      {/* RESULT / CONCLUSION / NEXT */}
      <SectionCard title="RESULT & CONCLUSION">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Field label="RESULT">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.result ?? ""}
              key={`res-${exp.updated_at}`}
              placeholder="결과 — 무엇이 일어났는가"
              onBlur={(e) => {
                if (e.target.value !== (exp.result ?? ""))
                  update.mutate({ result: e.target.value || null });
              }}
            />
          </Field>
          <Field label="CONCLUSION">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.conclusion ?? ""}
              key={`con-${exp.updated_at}`}
              placeholder="결론 — 무엇을 배웠는가"
              onBlur={(e) => {
                if (e.target.value !== (exp.conclusion ?? ""))
                  update.mutate({ conclusion: e.target.value || null });
              }}
            />
          </Field>
          <Field label="NEXT EXPERIMENT">
            <textarea
              rows={4}
              className={inputClass}
              defaultValue={exp.next_experiment ?? ""}
              key={`nxt-${exp.updated_at}`}
              placeholder="다음 실험 메모"
              onBlur={(e) => {
                if (e.target.value !== (exp.next_experiment ?? ""))
                  update.mutate({ next_experiment: e.target.value || null });
              }}
            />
          </Field>
        </div>
      </SectionCard>

      {/* AI INTERPRETATION — 사용자 데이터와 분리된 예약 영역 */}
      <SectionCard title="AI INTERPRETATION" muted>
        <div className="border border-dashed border-border px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            AI — CONNECTED IN A LATER PHASE
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
            사용자 관찰과 별도 필드. AI는 사용자 기록을 덮어쓰지 않습니다.
          </p>
        </div>
      </SectionCard>

      {/* PROCESS TIMELINE — Phase 4B */}
      <ProcessTimelineSection experimentId={exp.id} experimentDate={exp.date} status={exp.status} />

      {/* NOTES */}
      <SectionCard title="NOTES">
        <textarea
          rows={3}
          className={inputClass}
          defaultValue={exp.notes ?? ""}
          key={`notes-${exp.updated_at}`}
          onBlur={(e) => {
            if (e.target.value !== (exp.notes ?? ""))
              update.mutate({ notes: e.target.value || null });
          }}
        />
      </SectionCard>

      <p className="font-mono text-[11px] uppercase text-muted-foreground">
        실험은 삭제하지 않습니다 — 상태를 CANCELLED로 변경하세요. 실험 번호는 재사용되지 않습니다.
      </p>
    </div>
  );
}
