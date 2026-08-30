import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { currentUserId, experimentObservationsQuery, experimentQuery } from "@/lib/queries";
import { EXPERIMENT_STATUSES, experimentLabel, type ExperimentStatus } from "@/lib/experiment";
import { parseNumber, versionLabel } from "@/lib/formula";
import { formatDateLabel, formatDateTime, formatTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { MouldSelect } from "@/components/pilot/MouldSelect";
import { ProcessTimelineSection } from "@/components/pilot/ProcessTimelineSection";
import { SensoryEvaluationSection } from "@/components/pilot/SensoryEvaluationSection";
import { experimentsForBaselineQuery } from "@/lib/queries";
import { lossPct } from "@/lib/experiment";
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
  const exp = experiment.data;

  const [obsLabel, setObsLabel] = useState("");
  const [obsValue, setObsValue] = useState("");

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
          <Field label="BASELINE EXPERIMENT (OPTIONAL)">
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
