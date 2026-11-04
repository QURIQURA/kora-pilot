import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  versionIngredientsQuery,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { parseComponentPlan, productionDemandSummary } from "@/lib/order-component-plan";
import { sumBaseGrams } from "@/lib/work-session";
import { fmtNumber } from "@/lib/formula";
import { invalidateProductionSync } from "@/lib/production-sync";
import { buttonClass, inputClass, selectClass } from "./ui";

const fromRow = (row: WorkSessionFormulaVersionRow) => ({
  version: row.formula_version_id,
  multiplier: String(row.multiplier),
  target: row.target_quantity_g == null ? "" : String(row.target_quantity_g),
  pinned: row.version_pinned,
});

/** Order and Production edit one selection record; this is not a second recipe copy. */
export function OrderComponentPlanRow({
  row,
  disabled = false,
}: {
  row: WorkSessionFormulaVersionRow;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => fromRow(row));
  const baseline = useRef({ draft: fromRow(row), updatedAt: row.updated_at });
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current.draft);
  const conflict = row.updated_at !== baseline.current.updatedAt && dirty;
  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(baseline.current.draft)) {
      const next = fromRow(row);
      baseline.current = { draft: next, updatedAt: row.updated_at };
      setDraft(next);
    }
    // Remote refresh must not overwrite a locally edited production plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.updated_at]);
  const versions = useQuery({
    queryKey: ["formula_versions", "order-plan", row.formula_versions.formulas.id],
    queryFn: async () => {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("formula_versions")
        .select("id,version_number,status")
        .eq("user_id", uid)
        .eq("formula_id", row.formula_versions.formulas.id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const ingredients = useQuery(versionIngredientsQuery(draft.version));
  const base = sumBaseGrams(ingredients.data ?? []);
  let preview = null;
  try {
    preview = productionDemandSummary(
      [parseComponentPlan(draft.multiplier, draft.target, row.multiplier)],
      base,
    );
  } catch {
    /* shown on save */
  }
  const save = useMutation({
    mutationFn: async () => {
      const plan = parseComponentPlan(draft.multiplier, draft.target, row.multiplier);
      const { data, error } = await supabase.rpc("save_order_component_plan", {
        p_selection_id: row.id,
        p_expected_updated_at: baseline.current.updatedAt,
        p_version_id: draft.version,
        p_multiplier: plan.multiplier,
        p_target_quantity_g: plan.target_quantity_g,
        p_version_pinned: draft.pinned,
      });
      if (error) throw error;
      return data as {
        id: string;
        formula_version_id: string;
        multiplier: number;
        target_quantity_g: number | null;
        version_pinned: boolean;
        updated_at: string;
      };
    },
    onSuccess: (saved) => {
      const next = {
        version: saved.formula_version_id,
        multiplier: String(saved.multiplier),
        target: saved.target_quantity_g == null ? "" : String(saved.target_quantity_g),
        pinned: saved.version_pinned,
      };
      baseline.current = { draft: next, updatedAt: saved.updated_at };
      setDraft(next);
      client.setQueryData(
        ["work_session_formula_versions", row.work_session_id],
        (old: WorkSessionFormulaVersionRow[] | undefined) =>
          old?.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)),
      );
      void invalidateProductionSync(client);
    },
  });
  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
      <p className="text-xs">
        {row.formula_versions.formulas.components?.name ?? row.formula_versions.formulas.name}
      </p>
      <fieldset disabled={disabled || save.isPending} className="space-y-2">
        <label className="block text-[11px]">
          레시피 버전
          <select
            aria-label="주문 레시피 버전"
            className={selectClass}
            value={draft.version}
            onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value, pinned: true }))}
          >
            {versions.isLoading && (
              <option value={draft.version}>V{row.formula_versions.version_number}</option>
            )}
            {(versions.data ?? [])
              .filter(
                (v) =>
                  !["ARCHIVED", "SUPERSEDED"].includes(v.status) || v.id === row.formula_version_id,
              )
              .map((v) => (
                <option key={v.id} value={v.id}>
                  V{v.version_number} · {v.status}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px]">
            이 주문 사용 목표 (g)
            <input
              aria-label="주문 사용 목표 g"
              type="number"
              min="0"
              step="any"
              placeholder="미지정"
              className={inputClass}
              value={draft.target}
              onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
            />
          </label>
          <label className="text-[11px]">
            생산 배수 ×
            <input
              aria-label="주문 생산 배수"
              type="number"
              min="1"
              step="1"
              className={inputClass}
              value={draft.multiplier}
              onChange={(e) => setDraft((d) => ({ ...d, multiplier: e.target.value }))}
            />
          </label>
        </div>
        {!Number.isInteger(row.multiplier) && (
          <p className="text-[11px] text-muted-foreground">
            MERGE에서 나눈 주문 배정분입니다. 배수를 직접 바꿀 때는 정수로 입력하세요.
          </p>
        )}
        <label className="flex items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => setDraft((d) => ({ ...d, pinned: e.target.checked }))}
          />
          이 주문의 버전 고정
        </label>
        {ingredients.isSuccess && preview && (
          <p className="font-mono text-[11px]">
            기본 {fmtNumber(base)}g × {draft.multiplier} = 생산 {fmtNumber(preview.production)}g
            {preview.remaining !== null && (
              <span className={preview.remaining < 0 ? "text-destructive" : ""}>
                {" "}
                · {preview.remaining < 0 ? "부족" : "예상 잔량"}{" "}
                {fmtNumber(Math.abs(preview.remaining))}g
              </span>
            )}
          </p>
        )}
        <button
          type="button"
          className={buttonClass}
          disabled={!dirty || conflict || versions.isError || ingredients.isError}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "저장 중…" : "생산 계획 저장"}
        </button>
      </fieldset>
      <Link
        className="block text-[11px] underline"
        to="/formulas/$formulaId"
        params={{ formulaId: row.formula_versions.formulas.id }}
        search={{ version: row.formula_version_id }}
      >
        현재 주문에 연결된 레시피 열기
      </Link>
      {conflict && (
        <div role="alert" className="text-xs text-destructive">
          다른 화면에서 계획이 변경됐어요.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const next = fromRow(row);
              baseline.current = { draft: next, updatedAt: row.updated_at };
              setDraft(next);
            }}
          >
            최신 계획 불러오기
          </button>
        </div>
      )}
      {(save.isError || versions.isError || ingredients.isError) && (
        <p role="alert" className="text-xs text-destructive">
          {save.error?.message ?? "배합을 불러오지 못했습니다."}
        </p>
      )}
    </div>
  );
}
