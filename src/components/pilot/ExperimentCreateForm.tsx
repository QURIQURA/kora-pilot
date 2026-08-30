import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentUsageQuery,
  currentUserId,
  experimentsForBaselineQuery,
  formulaVersionsQuery,
  formulasQuery,
  productsQuery,
} from "@/lib/queries";
import { toLocalDateString } from "@/lib/datetime";
import { parseNumber, versionLabel } from "@/lib/formula";
import { MouldSelect } from "./MouldSelect";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "./ui";

export interface ExperimentPreset {
  formulaId?: string;
  formulaVersionId?: string;
  componentId?: string | null;
  productId?: string | null;
  mouldId?: string | null;
  batch?: number;
}

/**
 * + NEW EXPERIMENT 공용 모달.
 * preset으로 context(formula version 등)를 자동 연결하고,
 * 몰드는 버전의 기본 몰드를 따른다. 사용자는 가설/변수/배치만 입력하면 된다.
 */
export function ExperimentCreateModal({
  preset,
  onCancel,
  onCreated,
}: {
  preset?: ExperimentPreset;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const formulas = useQuery(formulasQuery());
  const formulaList = useMemo(() => formulas.data ?? [], [formulas.data]);

  const [formulaId, setFormulaId] = useState(preset?.formulaId ?? "");
  const [versionId, setVersionId] = useState(preset?.formulaVersionId ?? "");
  const versions = useQuery(formulaVersionsQuery(formulaId || null));
  const versionList = useMemo(() => versions.data ?? [], [versions.data]);
  const version = versionList.find((v) => v.id === versionId) ?? null;

  const formula = formulaList.find((f) => f.id === formulaId) ?? null;
  const componentId =
    preset?.componentId !== undefined
      ? preset.componentId
      : (formula?.component_id ?? null);

  const usage = useQuery(componentUsageQuery(componentId));
  const allProducts = useQuery(productsQuery());
  const productOptions = useMemo(() => {
    const linked = (usage.data ?? []).flatMap((row) =>
      row.products ? [{ id: row.products.id, name: row.products.name }] : []
    );
    if (linked.length > 0) return linked;
    return (allProducts.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  }, [usage.data, allProducts.data]);

  const [productId, setProductId] = useState(preset?.productId ?? "");
  useEffect(() => {
    if (productId) return;
    const first = productOptions[0];
    if (first) setProductId(first.id);
  }, [productOptions, productId]);

  const [mouldId, setMouldId] = useState(preset?.mouldId ?? "");
  const [mouldTouched, setMouldTouched] = useState(Boolean(preset?.mouldId));
  useEffect(() => {
    if (!mouldTouched) setMouldId(version?.default_mould_id ?? "");
  }, [version, mouldTouched]);

  // 버전 자동 선택: CURRENT 우선, 없으면 최신
  useEffect(() => {
    if (versionList.length === 0) {
      if (versionId) setVersionId("");
      return;
    }
    if (versionId && versionList.some((v) => v.id === versionId)) return;
    const current =
      versionList.find((v) => v.status === "CURRENT") ??
      versionList[versionList.length - 1];
    if (current) setVersionId(current.id);
  }, [versionList, versionId]);

  const [batch, setBatch] = useState(String(preset?.batch ?? 1));
  const [date, setDate] = useState(toLocalDateString());
  const [hypothesis, setHypothesis] = useState("");
  const [variables, setVariables] = useState("");
  const [baselineId, setBaselineId] = useState("");
  const baselineOptions = useQuery(experimentsForBaselineQuery(null));

  const create = useMutation({
    mutationFn: async () => {
      if (!versionId) throw new Error("Select a formula version");
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("experiments")
        .insert({
          user_id,
          product_id: productId || null,
          component_id: componentId,
          formula_version_id: versionId,
          mould_id: mouldId || null,
          batch_multiplier: parseNumber(batch) || 1,
          date,
          status: "PLANNED",
          hypothesis: hypothesis.trim() || null,
          variables: variables.trim() || null,
          baseline_experiment_id: baselineId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["experiments"] });
      await queryClient.invalidateQueries({
        queryKey: ["experiments_by_version"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["experiments_by_product"],
      });
      await queryClient.invalidateQueries({ queryKey: ["active_experiments"] });
      onCreated(id);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW EXPERIMENT</span>
          <button
            type="button"
            className="label-caps px-2 py-2"
            onClick={onCancel}
          >
            CLOSE
          </button>
        </div>
        {formulaList.length === 0 && !formulas.isLoading ? (
          <div className="space-y-4 p-4">
            <p className="font-mono text-xs uppercase text-muted-foreground">
              실험은 FORMULA VERSION을 참조합니다 — 먼저 FORMULA를 만드세요
            </p>
            <Link to="/formulas" className={buttonClass}>
              GO TO FORMULAS
            </Link>
          </div>
        ) : (
          <form
            className="space-y-4 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="FORMULA">
              <select
                className={selectClass}
                value={formulaId}
                disabled={Boolean(preset?.formulaId)}
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
            <Field label="FORMULA VERSION">
              <select
                className={selectClass}
                value={versionId}
                disabled={!formulaId || Boolean(preset?.formulaVersionId)}
                onChange={(e) => setVersionId(e.target.value)}
                required
              >
                <option value="">SELECT VERSION…</option>
                {[...versionList]
                  .sort((a, b) => b.version_number - a.version_number)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {versionLabel(v.version_number)} · {v.status}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="PRODUCT">
                <select
                  className={selectClass}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">NO PRODUCT</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="COMPONENT (AUTO)">
                <p className="flex min-h-[44px] items-center border border-dashed border-border px-3 font-mono text-sm text-muted-foreground">
                  {formula?.components?.name ?? "—"}
                </p>
              </Field>
              <Field label="MOULD (DEFAULT FROM VERSION)">
                <MouldSelect
                  value={mouldId}
                  onChange={(id) => {
                    setMouldTouched(true);
                    setMouldId(id);
                  }}
                />
              </Field>
              <Field label="BATCH ×N">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  className={`${inputClass} min-h-[52px] text-base`}
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </Field>
            </div>
            <Field label="DATE">
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
            <Field label="HYPOTHESIS (OPTIONAL)">
              <textarea
                rows={2}
                className={inputClass}
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="당도를 낮추면 크럼이 더 단단해질 것"
              />
            </Field>
            <Field label="VARIABLES (OPTIONAL)">
              <textarea
                rows={2}
                className={inputClass}
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                placeholder="SUGAR 120g → 110g"
              />
            </Field>
            <Field label="BASELINE EXPERIMENT (OPTIONAL)">
              <select
                className={selectClass}
                value={baselineId}
                onChange={(e) => setBaselineId(e.target.value)}
              >
                <option value="">NO BASELINE</option>
                {(baselineOptions.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.experiment_number} · {b.date}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                이번 실험이 비교하는 기준 실험 (Base Formula와 다름)
              </p>
            </Field>
            {create.isError && (
              <p className="font-mono text-xs uppercase text-destructive">
                FAILED TO CREATE — TRY AGAIN
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={!versionId || create.isPending}
              >
                CREATE EXPERIMENT
              </button>
              <button type="button" className={buttonClass} onClick={onCancel}>
                CANCEL
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
