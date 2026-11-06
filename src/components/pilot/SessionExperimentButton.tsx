/**
 * 생산 세션에 올라온 컴포넌트를 바로 R&D 실험으로 전환한다(2026-11-06).
 * 그 컴포넌트가 쓰던 버전을 복사한 DRAFT 실험 버전을 만들고 이 세션 행을 새 버전으로 옮긴다.
 * 이후 재료 수정·결과 입력·적용/보관/폐기는 FORMULAS → R&D 실험 탭에서 한다.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formulaExperimentsQuery, type DashboardComponentRow } from "@/lib/queries";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/pilot/ui";

export function SessionExperimentButton({ row }: { row: DashboardComponentRow }) {
  const queryClient = useQueryClient();
  const experiments = useQuery(formulaExperimentsQuery());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = (experiments.data ?? []).find(
    (x) => x.status === "OPEN" && x.version_id === row.formulaVersionId,
  );
  if (running) {
    return (
      <p className="flex flex-wrap items-center gap-2 border border-border bg-muted px-2 py-1 font-mono text-[11px]">
        🧪 R&amp;D 실험 중 · {running.title}
        <Link to="/formulas" className="underline">
          결과 입력·결정 → FORMULAS
        </Link>
      </p>
    );
  }
  if (!row.formulaId) return null;

  const convert = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("convert_session_row_to_experiment", {
      p_row_id: row.id,
      p_title: title.trim() || `${row.componentName} 실험`,
      ...(hypothesis.trim() ? { p_hypothesis: hypothesis.trim() } : {}),
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setOpen(false);
    setTitle("");
    setHypothesis("");
    for (const key of [
      "dashboard_components",
      "formula_experiments",
      "work_session_tasks",
      "work_session_formula_versions",
      "formulas",
    ])
      await queryClient.invalidateQueries({ queryKey: [key] });
  };

  if (!open)
    return (
      <button type="button" className={`${buttonClass} text-[11px]`} onClick={() => setOpen(true)}>
        🧪 R&amp;D 실험으로 전환
      </button>
    );
  return (
    <div className="space-y-2 border border-border bg-card p-2">
      <p className="label-caps text-[11px] text-muted-foreground">
        {row.componentName} → R&amp;D 실험 (현재 버전을 복사한 DRAFT로 이 세션이 옮겨져요)
      </p>
      <input
        className={inputClass}
        placeholder={`실험 이름 (예: ${row.componentName} 계란 7개)`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={inputClass}
        placeholder="가설 (선택)"
        value={hypothesis}
        onChange={(e) => setHypothesis(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={() => void convert()}
        >
          전환
        </button>
        <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
    </div>
  );
}
