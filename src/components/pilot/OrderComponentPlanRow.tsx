import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  baseWeightsQuery,
  formulasQuery,
  mouldsQuery,
  techniqueCategoriesQuery,
  versionIngredientsQuery,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { parseComponentPlan, productionDemandSummary } from "@/lib/order-component-plan";
import { resolveSlotGroup } from "@/lib/technique";
import { sumBaseGrams } from "@/lib/work-session";
import { fmtNumber } from "@/lib/formula";
import { mouldAbbr, mouldMultiplier, mouldQty } from "@/lib/component-size";
import { invalidateProductionSync } from "@/lib/production-sync";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
import { buttonClass, inputClass, selectClass } from "./ui";

const fromRow = (row: WorkSessionFormulaVersionRow) => ({
  formula: row.formula_versions.formulas.id,
  version: row.formula_version_id,
  multiplier: String(row.multiplier),
  target: row.target_quantity_g == null ? "" : String(row.target_quantity_g),
  pinned: row.version_pinned,
  // 몰드 기준 생산: 목표 몰드 id / 개수(""이면 저장된 배수에서 계산)
  mould: row.mould_id ?? "",
  qty: "",
  // 기준중량 기준 생산: SETTINGS > BASE WEIGHTS 프리셋 id / 개수
  bw: "",
  bwQty: "1",
});

/** Order and Production edit one selection record; this is not a second recipe copy. */
export function OrderComponentPlanRow({
  row,
  disabled = false,
  allowFormulaChange = false,
}: {
  row: WorkSessionFormulaVersionRow;
  disabled?: boolean;
  allowFormulaChange?: boolean;
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
  const formulas = useQuery({ ...formulasQuery(), enabled: allowFormulaChange });
  const techniques = useQuery({ ...techniqueCategoriesQuery(), enabled: allowFormulaChange });
  const choices = (formulas.data ?? []).filter(
    (f) =>
      f.id === draft.formula ||
      resolveSlotGroup(
        techniques.data ?? [],
        f.components?.technique_category_id ?? f.technique_category_id,
      ) === row.slot,
  );
  const versions = useQuery({
    queryKey: ["formula_versions", "order-plan", draft.formula],
    queryFn: async () => {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("formula_versions")
        .select("id,version_number,status,default_mould_id")
        .eq("user_id", uid)
        .eq("formula_id", draft.formula)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const ingredients = useQuery(versionIngredientsQuery(draft.version));
  const base = sumBaseGrams(ingredients.data ?? []);
  // 몰드 기준: 레시피 기본 몰드(예: 6인치)와 이 주문에서 만들 목표 몰드(예: 8인치)의 기준중량 비율로 배수를 정한다.
  const moulds = useQuery(mouldsQuery());
  const defaultMouldId =
    (versions.data ?? []).find((v) => v.id === draft.version)?.default_mould_id ??
    row.formula_versions.default_mould_id;
  const baseMould = (moulds.data ?? []).find((m) => m.id === defaultMouldId);
  const targetMould = (moulds.data ?? []).find((m) => m.id === draft.mould);
  const mouldMode = Boolean(baseMould?.reference_weight_g);
  const derivedQty = targetMould ? (mouldQty(row.multiplier, baseMould, targetMould) ?? 1) : 1;
  const qtyText = draft.qty !== "" ? draft.qty : String(derivedQty);
  const useMould = mouldMode && Boolean(targetMould?.reference_weight_g);
  const effectiveMultiplier = useMould
    ? (mouldMultiplier(Number(qtyText), baseMould, targetMould) ?? Number.NaN)
    : Number(draft.multiplier);
  // 기준중량 기준(가나슈/크림/필링 등 몰드 없는 컴포넌트): 설정의 기준중량 × 개수 = 목표 중량 → 배수 자동 계산.
  const baseWeights = useQuery(baseWeightsQuery());
  const bwPreset = (baseWeights.data ?? []).find((b) => b.id === draft.bw);
  const useBase = !mouldMode && Boolean(bwPreset?.weight_g) && base > 0;
  const bwQtyNum = Number(draft.bwQty);
  const bwTargetG = useBase && bwQtyNum > 0 ? Number(bwPreset!.weight_g) * bwQtyNum : null;
  const bwMultiplier =
    bwTargetG != null ? Math.round((bwTargetG / base) * 10000) / 10000 : Number.NaN;
  // 저장된 목표 중량이 어떤 기준중량의 정수배면 그 프리셋을 처음부터 선택해 보여준다.
  useEffect(() => {
    if (mouldMode || draft.bw || !baseWeights.data || row.target_quantity_g == null) return;
    if (JSON.stringify(draft) !== JSON.stringify(baseline.current.draft)) return;
    const target = Number(row.target_quantity_g);
    const hit = [...baseWeights.data]
      .filter((b) => b.weight_g && target / Number(b.weight_g) >= 1)
      .filter(
        (b) =>
          Math.abs(target / Number(b.weight_g) - Math.round(target / Number(b.weight_g))) < 1e-6,
      )
      .sort((a, b) => Number(b.weight_g) - Number(a.weight_g))[0];
    if (!hit) return;
    const next = { ...draft, bw: hit.id, bwQty: String(Math.round(target / Number(hit.weight_g))) };
    baseline.current = { ...baseline.current, draft: next };
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouldMode, baseWeights.data, row.target_quantity_g]);
  const effectiveMultiplierAll = useBase ? bwMultiplier : effectiveMultiplier;
  const parsedTarget = useBase ? bwTargetG : draft.target.trim() ? Number(draft.target) : null;
  const preview =
    Number.isFinite(effectiveMultiplierAll) && effectiveMultiplierAll > 0
      ? productionDemandSummary(
          [{ multiplier: effectiveMultiplierAll, target_quantity_g: parsedTarget }],
          base,
        )
      : null;
  const save = useMutation({
    mutationFn: async () => {
      if (!draft.version) throw new Error("레시피 버전을 선택하세요");
      if (useMould && !(Number(qtyText) > 0))
        throw new Error("몰드 개수는 0보다 큰 숫자여야 합니다");
      // 몰드 없이 직접 입력하는 경우만 정수 배수 규칙을 적용한다.
      if (useBase && !(bwQtyNum > 0)) throw new Error("기준중량 개수는 0보다 큰 숫자여야 합니다");
      const plan = useMould
        ? { multiplier: effectiveMultiplier, target_quantity_g: parsedTarget }
        : useBase
          ? { multiplier: bwMultiplier, target_quantity_g: bwTargetG }
          : parseComponentPlan(draft.multiplier, draft.target, row.multiplier);
      if (!Number.isFinite(plan.multiplier) || plan.multiplier <= 0)
        throw new Error("생산 배수를 계산할 수 없어요 — 몰드의 기준중량을 확인하세요");
      const { data, error } = await supabase.rpc("save_order_component_plan_v2", {
        p_selection_id: row.id,
        p_expected_updated_at: baseline.current.updatedAt,
        p_version_id: draft.version,
        p_multiplier: plan.multiplier,
        p_target_quantity_g: plan.target_quantity_g,
        p_version_pinned: draft.pinned,
        p_mould_id: useMould ? draft.mould : null,
        p_mould_qty: useMould ? Number(qtyText) : null,
      });
      if (error) throw error;
      return data as {
        id: string;
        formula_version_id: string;
        multiplier: number;
        target_quantity_g: number | null;
        version_pinned: boolean;
        mould_id: string | null;
        mould_qty: number | null;
        updated_at: string;
      };
    },
    onSuccess: (saved) => {
      const next = {
        formula: draft.formula,
        version: saved.formula_version_id,
        multiplier: String(saved.multiplier),
        target: saved.target_quantity_g == null ? "" : String(saved.target_quantity_g),
        pinned: saved.version_pinned,
        mould: saved.mould_id ?? "",
        qty: "",
        bw: draft.bw,
        bwQty: draft.bwQty,
      };
      baseline.current = { draft: next, updatedAt: saved.updated_at };
      setDraft(next);
      if (saved.formula_version_id === row.formula_version_id)
        client.setQueryData(
          ["work_session_formula_versions", row.work_session_id],
          (old: WorkSessionFormulaVersionRow[] | undefined) =>
            old?.map((r) => (r.id === saved.id ? { ...r, ...saved } : r)),
        );
      void invalidateProductionSync(client);
      // 플래너 TASK 제목(사이즈 × 배수)이 계획과 어긋나지 않게 바로 다시 동기화한다.
      void syncWorkSessionToPlanner(row.work_session_id);
    },
  });
  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-border pt-2">
      <p className="text-xs">
        {row.formula_versions.formulas.components?.name ?? row.formula_versions.formulas.name}
      </p>
      <fieldset disabled={disabled || save.isPending} className="space-y-2">
        {allowFormulaChange && (
          <label className="block text-[11px]">
            컴포넌트 / FORMULA 교체
            <select
              aria-label="컴포넌트 교체"
              className={selectClass}
              value={draft.formula}
              onChange={(e) =>
                setDraft((d) => ({ ...d, formula: e.target.value, version: "", pinned: true }))
              }
            >
              {!choices.some((f) => f.id === draft.formula) && (
                <option value={draft.formula}>
                  {row.formula_versions.formulas.components?.name ??
                    row.formula_versions.formulas.name}
                </option>
              )}
              {choices.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.components?.name ?? f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-[11px]">
          레시피 버전
          <select
            aria-label="주문 레시피 버전"
            className={selectClass}
            value={draft.version}
            onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value, pinned: true }))}
          >
            {!draft.version && <option value="">버전 선택…</option>}
            {versions.isLoading && draft.version && (
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
        {mouldMode ? (
          <div className="space-y-1 border border-border p-2">
            <p className="text-[11px] text-muted-foreground">
              레시피 기본 몰드: {baseMould ? mouldAbbr(baseMould) : "—"} (
              {fmtNumber(Number(baseMould?.reference_weight_g ?? 0))}g)
            </p>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <label className="text-[11px]">
                생산 몰드
                <select
                  aria-label="생산 몰드"
                  className={selectClass}
                  value={draft.mould}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      mould: e.target.value,
                      qty: d.mould ? qtyText : "1",
                    }))
                  }
                >
                  <option value="">몰드 없이 배수로 직접 입력</option>
                  {(moulds.data ?? []).map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.reference_weight_g}>
                      {mouldAbbr(m)}
                      {m.reference_weight_g
                        ? ` · ${fmtNumber(Number(m.reference_weight_g))}g`
                        : " · 기준중량 없음"}
                    </option>
                  ))}
                </select>
              </label>
              {useMould && (
                <label className="text-[11px]">
                  개수
                  <input
                    aria-label="생산 몰드 개수"
                    type="number"
                    min="0"
                    step="any"
                    className={inputClass}
                    value={qtyText}
                    onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
                  />
                </label>
              )}
            </div>
            {useMould ? (
              <p className="font-mono text-[11px]">
                {mouldAbbr(targetMould!)} ×{fmtNumber(Number(qtyText), 2)} = 레시피(
                {baseMould ? mouldAbbr(baseMould) : "기본"} 기준) ×
                {Number.isFinite(effectiveMultiplier) ? fmtNumber(effectiveMultiplier, 4) : "?"}
              </p>
            ) : (
              <label className="block text-[11px]">
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
            )}
          </div>
        ) : (
          <div className="space-y-1 border border-border p-2">
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <label className="text-[11px]">
                기준중량 (SETTINGS)
                <select
                  aria-label="기준중량"
                  className={selectClass}
                  value={draft.bw}
                  onChange={(e) => setDraft((d) => ({ ...d, bw: e.target.value, bwQty: "1" }))}
                >
                  <option value="">기준중량 없이 배수로 직접 입력</option>
                  {(baseWeights.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {fmtNumber(Number(b.weight_g))}g
                    </option>
                  ))}
                </select>
              </label>
              {useBase && (
                <label className="text-[11px]">
                  개수
                  <input
                    aria-label="기준중량 개수"
                    type="number"
                    min="0"
                    step="any"
                    className={inputClass}
                    value={draft.bwQty}
                    onChange={(e) => setDraft((d) => ({ ...d, bwQty: e.target.value }))}
                  />
                </label>
              )}
            </div>
            {useBase ? (
              <p className="font-mono text-[11px]">
                {bwPreset!.name} ×{fmtNumber(bwQtyNum, 2)} = 목표{" "}
                {bwTargetG != null ? fmtNumber(bwTargetG) : "?"}g → 레시피 ×
                {Number.isFinite(bwMultiplier) ? fmtNumber(bwMultiplier, 4) : "?"}
              </p>
            ) : (
              <label className="block text-[11px]">
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
            )}
            {draft.bw && base <= 0 && (
              <p className="text-[11px] text-muted-foreground">
                이 버전의 재료 합계(g)를 알 수 없어 기준중량으로 배수를 계산할 수 없어요.
              </p>
            )}
          </div>
        )}
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
            기본 {fmtNumber(base)}g × {fmtNumber(effectiveMultiplierAll, 4)} = 생산{" "}
            {fmtNumber(preview.production)}g
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
