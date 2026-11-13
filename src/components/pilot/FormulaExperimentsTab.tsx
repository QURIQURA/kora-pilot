import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  formulaExperimentsQuery,
  type ExperimentVersion,
  type FormulaExperimentRow,
  type FormulaListRow,
} from "@/lib/queries";
import { versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

type Decision = "PROMOTED" | "KEPT" | "DISCARDED";

const DECISION_LABEL: Record<FormulaExperimentRow["status"], string> = {
  OPEN: "진행 중",
  PROMOTED: "새 버전으로 적용됨",
  KEPT: "실험 기록으로 보관",
  DISCARDED: "폐기",
};

interface DiffLine {
  name: string;
  before: string;
  after: string;
}

const fmtAmount = (amount: number, unit: string) =>
  `${Math.round(Number(amount) * 100) / 100}${unit}`;

/** 기준 버전과 실험 버전의 재료 차이만 뽑는다 — 바뀐 것만 보이게. */
export function diffVersions(
  base: ExperimentVersion | null,
  trial: ExperimentVersion | null,
): { changes: DiffLine[]; unchanged: number } {
  const baseRows = base?.formula_version_ingredients ?? [];
  const trialRows = trial?.formula_version_ingredients ?? [];
  const baseById = new Map(baseRows.map((r) => [r.ingredient_id, r]));
  const trialById = new Map(trialRows.map((r) => [r.ingredient_id, r]));
  const changes: DiffLine[] = [];
  let unchanged = 0;
  for (const row of trialRows) {
    const name = row.ingredients?.name ?? "—";
    const prev = baseById.get(row.ingredient_id);
    if (!prev) {
      changes.push({ name, before: "—", after: `${fmtAmount(row.amount, row.unit)} (추가)` });
    } else if (Number(prev.amount) !== Number(row.amount) || prev.unit !== row.unit) {
      const pct =
        Number(prev.amount) > 0 && prev.unit === row.unit
          ? ` (${Number(row.amount) >= Number(prev.amount) ? "+" : ""}${Math.round(((Number(row.amount) - Number(prev.amount)) / Number(prev.amount)) * 100)}%)`
          : "";
      changes.push({
        name,
        before: fmtAmount(prev.amount, prev.unit),
        after: `${fmtAmount(row.amount, row.unit)}${pct}`,
      });
    } else unchanged += 1;
  }
  for (const row of baseRows) {
    if (!trialById.has(row.ingredient_id))
      changes.push({
        name: row.ingredients?.name ?? "—",
        before: fmtAmount(row.amount, row.unit),
        after: "삭제",
      });
  }
  return { changes, unchanged };
}

export function FormulaExperimentsTab({ formulas }: { formulas: FormulaListRow[] }) {
  const experiments = useQuery(formulaExperimentsQuery());
  const [creating, setCreating] = useState(false);
  const rows = experiments.data ?? [];
  const open = rows.filter((e) => e.status === "OPEN");
  const decided = rows.filter((e) => e.status !== "OPEN");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted-foreground">
          기존 포뮬라를 복사해 일부만 바꾸고, 구워 본 결과를 보고 적용·보관·폐기를 정해요.
        </p>
        <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
          + NEW EXPERIMENT
        </button>
      </div>

      {open.length === 0 ? (
        <EmptyState
          message="진행 중인 실험이 없어요"
          actionLabel="+ NEW EXPERIMENT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <ul className="space-y-3">
          {open.map((e) => (
            <ExperimentCard key={e.id} experiment={e} />
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <details className="border border-border bg-card">
          <summary className="label-caps cursor-pointer px-3 py-2 text-xs text-muted-foreground">
            결정된 실험 {decided.length}
          </summary>
          <ul className="divide-y divide-border">
            {decided.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span>{e.title}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {e.formulas?.name ?? "—"} · {DECISION_LABEL[e.status]}
                </span>
                {e.result_height_mm != null && (
                  <span className="font-mono text-xs">
                    구운 높이 {Number(e.result_height_mm) / 10}cm
                  </span>
                )}
                {e.result_notes && (
                  <span className="text-xs text-muted-foreground">{e.result_notes}</span>
                )}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {formatDateTime(e.decided_at ?? e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {creating && <NewExperimentModal formulas={formulas} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** 그 버전으로 진행한 생산 TASK에 기록된 가장 최근 반죽 높이·구움 높이(mm) */
const sessionHeightsQuery = (versionId: string | null) =>
  queryOptions({
    queryKey: ["session_heights", versionId],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<{ batter: number | null; baked: number | null }> => {
      if (!versionId) return { batter: null, baked: null };
      const { data, error } = await supabase
        .from("work_session_tasks")
        .select("batter_height_mm, observation_height_end_mm, updated_at")
        .eq("formula_version_id", versionId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const pick = (f: "batter_height_mm" | "observation_height_end_mm") => {
        const r = rows.find((x) => x[f] != null);
        return r ? Number(r[f]) : null;
      };
      return { batter: pick("batter_height_mm"), baked: pick("observation_height_end_mm") };
    },
  });

export function ExperimentCard({
  experiment: e,
  hideEditLink = false,
}: {
  experiment: FormulaExperimentRow;
  /** WORK VIEW 편집 창 안에서는 배합 편집 링크가 필요 없다 */
  hideEditLink?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { changes, unchanged } = diffVersions(e.base, e.trial);
  const [height, setHeight] = useState(
    e.result_height_mm != null ? String(Number(e.result_height_mm) / 10) : "",
  );
  const [notes, setNotes] = useState(e.result_notes ?? "");
  const trialHeights = useQuery(sessionHeightsQuery(e.version_id));
  const baseHeights = useQuery(sessionHeightsQuery(e.base_version_id));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["formula_experiments"] });
    await queryClient.invalidateQueries({ queryKey: ["formulas"] });
    await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
  };

  const saveResult = useMutation({
    mutationFn: async () => {
      const cm = height.trim() === "" ? null : Number(height);
      if (cm != null && (!Number.isFinite(cm) || cm <= 0))
        throw new Error("높이는 0보다 큰 숫자로 입력하세요");
      const { error: err } = await supabase
        .from("formula_experiments")
        .update({
          result_height_mm: cm == null ? null : Math.round(cm * 10 * 10) / 10,
          result_notes: notes.trim() || null,
        })
        .eq("id", e.id);
      if (err) throw err;
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["formula_experiments"] });
    },
    onError: (err) => setError(err.message),
  });

  const decide = useMutation({
    mutationFn: async (decision: Decision) => {
      const { error: err } = await supabase.rpc("decide_formula_experiment", {
        p_id: e.id,
        p_decision: decision,
      });
      if (err) throw err;
    },
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: (err) => setError(err.message),
  });

  const hasResult = height.trim() !== "" || notes.trim() !== "";
  const ask = (decision: Decision, message: string) => {
    if (!hasResult) {
      setError("구운 높이나 메모 중 하나는 먼저 입력하세요");
      return;
    }
    if (window.confirm(message)) decide.mutate(decision);
  };
  const name = e.formulas?.name ?? "—";

  return (
    <li className="border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="text-sm font-medium">{e.title}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {name} · 기준 {e.base ? versionLabel(e.base.version_number) : "—"} → 실험{" "}
            {e.trial ? versionLabel(e.trial.version_number) : "—"} · {formatDateTime(e.created_at)}
          </div>
          {e.hypothesis && <div className="mt-1 text-xs text-muted-foreground">{e.hypothesis}</div>}
        </div>
        {e.trial && !hideEditLink && (
          <Link
            to="/formulas/$formulaId"
            params={{ formulaId: e.formula_id }}
            search={{ version: e.trial.id }}
            className={buttonClass}
          >
            배합 편집
          </Link>
        )}
      </div>

      <div className="px-3 py-2">
        <div className="label-caps mb-1 text-[10px] text-muted-foreground">
          바뀐 것만 (나머지는 기준 그대로)
        </div>
        {changes.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            아직 바뀐 재료가 없어요. 배합 편집에서 양을 고치세요.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {changes.map((c) => (
                <tr key={c.name} className="border-t border-border first:border-t-0">
                  <td className="py-1 pr-2">{c.name}</td>
                  <td className="py-1 pr-2 font-mono text-xs text-muted-foreground">{c.before}</td>
                  <td className="py-1 font-mono text-xs">{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {unchanged > 0 && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            그 외 재료 {unchanged}개 변경 없음
          </p>
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        <p className="label-caps mb-1 text-[11px] text-muted-foreground">
          생산 기록 높이 (반죽 → 구움, 세션 디테일에서 입력한 값)
        </p>
        <table className="w-full font-mono text-[11px]">
          <tbody>
            {(
              [
                ["기준 버전", baseHeights.data],
                ["이 실험", trialHeights.data],
              ] as const
            ).map(([label, h]) => (
              <tr key={label}>
                <td className="w-24 py-0.5 text-muted-foreground">{label}</td>
                <td>{h?.batter != null ? `반죽 ${h.batter}mm` : "반죽 —"}</td>
                <td>{h?.baked != null ? `구움 ${h.baked}mm` : "구움 —"}</td>
                <td>
                  {h?.batter != null && h.baked != null && h.batter > 0
                    ? `×${Math.round((h.baked / h.batter) * 100) / 100}`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trialHeights.data?.baked != null && e.result_height_mm == null && (
          <button
            type="button"
            className={`${buttonClass} mt-1 text-[11px]`}
            onClick={() => {
              setHeight(String((trialHeights.data?.baked ?? 0) / 10));
              setTimeout(() => saveResult.mutate(), 0);
            }}
          >
            구움 {trialHeights.data.baked}mm를 결과로 가져오기
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-border px-3 py-2 sm:grid-cols-3">
        <Field label="구운 높이 (cm)">
          <input
            className={inputClass}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={height}
            placeholder="예: 7.5"
            onChange={(ev) => setHeight(ev.target.value)}
            onBlur={() => saveResult.mutate()}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="식감·맛 메모">
            <input
              className={inputClass}
              value={notes}
              placeholder="촉촉, 약간 무거움"
              onChange={(ev) => setNotes(ev.target.value)}
              onBlur={() => saveResult.mutate()}
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        {error && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() =>
              ask(
                "PROMOTED",
                `이 실험을 새 버전으로 적용할까요? ${name}의 생산용 CURRENT가 이 배합으로 바뀌고, 지금 CURRENT는 이전 버전(SUPERSEDED)이 돼요.`,
              )
            }
          >
            새 버전으로 적용
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              ask("KEPT", "실험 기록으로 보관할까요? 새 포뮬라로 남지만 생산에는 쓰이지 않아요.")
            }
          >
            실험 기록으로 보관
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => ask("DISCARDED", "폐기할까요? 결과 메모만 남기고 닫혀요.")}
          >
            폐기
          </button>
        </div>
      </div>
    </li>
  );
}

function NewExperimentModal({
  formulas,
  onClose,
}: {
  formulas: FormulaListRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [formulaId, setFormulaId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");

  const formula = formulas.find((f) => f.id === formulaId);
  const versions = [...(formula?.formula_versions ?? [])]
    .filter((v) => v.status !== "ARCHIVED")
    .sort((a, b) => b.version_number - a.version_number);

  const pickFormula = (id: string) => {
    setFormulaId(id);
    const vs = formulas.find((f) => f.id === id)?.formula_versions ?? [];
    const cur = [...vs].sort((a, b) => b.version_number - a.version_number)[0];
    setBaseId(cur?.id ?? "");
  };

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("start_formula_experiment", {
        p_formula_id: formulaId,
        p_base_version_id: baseId,
        p_title: title.trim(),
        p_hypothesis: hypothesis.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formula_experiments"] });
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-3">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="label-caps">NEW EXPERIMENT</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-3 p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (formulaId && baseId && title.trim()) start.mutate();
          }}
        >
          <Field label="포뮬라">
            <select
              className={selectClass}
              required
              value={formulaId}
              onChange={(ev) => pickFormula(ev.target.value)}
            >
              <option value="" disabled>
                실험할 포뮬라 선택
              </option>
              {formulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="기준 버전">
            <select
              className={selectClass}
              required
              value={baseId}
              onChange={(ev) => setBaseId(ev.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {versionLabel(v.version_number)} · {v.status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="실험 이름">
            <input
              className={inputClass}
              required
              value={title}
              placeholder="예: 계란 7개로 높이 올리기"
              onChange={(ev) => setTitle(ev.target.value)}
            />
          </Field>
          <Field label="가설·메모 (선택)">
            <input
              className={inputClass}
              value={hypothesis}
              onChange={(ev) => setHypothesis(ev.target.value)}
            />
          </Field>
          {start.isError && (
            <p role="alert" className="text-xs text-destructive">
              {start.error.message}
            </p>
          )}
          <p className="font-mono text-xs text-muted-foreground">
            기준 버전을 복사한 DRAFT가 만들어져요. 생산용 포뮬라에는 영향이 없어요.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={start.isPending || !formulaId || !baseId}
            >
              START
            </button>
            <button type="button" className={buttonClass} onClick={onClose}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
