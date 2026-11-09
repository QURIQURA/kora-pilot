import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  baseWeightsQuery,
  capacitiesQuery,
  sizeSpecLinesQuery,
  formulasQuery,
  mouldsQuery,
  techniqueCategoriesQuery,
  versionIngredientsQuery,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { parseComponentPlan, productionDemandSummary } from "@/lib/order-component-plan";
import { resolveSlotGroup } from "@/lib/technique";
import { sumBaseGrams } from "@/lib/work-session";
import { fmtNumber, toGrams } from "@/lib/formula";
import { ingredientDisplayName } from "@/lib/pilot";
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
  bw: row.base_weight_id ?? "",
  bwQty: row.base_weight_qty == null ? "1" : String(row.base_weight_qty),
  // 재료 기준 배수 자동 계산(저장되지 않는 입력값): 기준 재료 라인 id / 그 재료의 목표 g
  ing: row.plan_ingredient_id ?? "",
  ingG: row.plan_ingredient_g == null ? "" : String(row.plan_ingredient_g),
  // 입력 방식(MOULD/BASE/MULT/ING). ""이면 저장된 값으로 자동 판단.
  mode: "",
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
  // 평소엔 저장된 계획을 텍스트 요약으로만 보여주고, "생산 계획 수정"을 눌러야 입력칸이 열린다(2026-11-09).
  const [editing, setEditing] = useState(false);
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
  const autoMode = draft.mould ? "MOULD" : draft.bw ? "BASE" : draft.ing ? "ING" : "MULT";
  const mode = draft.mode || autoMode;
  const useMould = mode === "MOULD" && mouldMode && Boolean(targetMould?.reference_weight_g);
  const effectiveMultiplier = useMould
    ? (mouldMultiplier(Number(qtyText), baseMould, targetMould) ?? Number.NaN)
    : Number(draft.multiplier);
  // 기준중량 기준(가나슈/크림/필링 등 몰드 없는 컴포넌트): 설정의 기준중량 × 개수 = 목표 중량 → 배수 자동 계산.
  const baseWeights = useQuery(baseWeightsQuery());
  const bwPreset = (baseWeights.data ?? []).find((b) => b.id === draft.bw);
  const useBase = mode === "BASE" && !mouldMode && Boolean(bwPreset?.weight_g) && base > 0;
  const bwQtyNum = Number(draft.bwQty);
  const bwTargetG = useBase && bwQtyNum > 0 ? Number(bwPreset!.weight_g) * bwQtyNum : null;
  const bwMultiplier =
    bwTargetG != null ? Math.round((bwTargetG / base) * 10000) / 10000 : Number.NaN;
  // 저장된 목표 중량이 어떤 기준중량의 정수배면 그 프리셋을 처음부터 선택해 보여준다.
  useEffect(() => {
    if (
      mouldMode ||
      draft.bw ||
      row.base_weight_id ||
      !baseWeights.data ||
      row.target_quantity_g == null
    )
      return;
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
  // 재료 기준(2026-11-09 사용자 요청): 재료 하나의 목표 g을 넣으면 전체 배수 = 목표 ÷ 그 재료의 레시피(×1) g.
  // 몰드/기준중량을 쓰지 않는 직접 입력 상태에서만 쓴다.
  // 같은 재료가 여러 줄이면 g을 합쳐서 하나로 본다(재료 마스터 id 기준 — 버전이 바뀌어도 매칭된다).
  const ingMap = new Map<string, { id: string; name: string; g: number }>();
  for (const l of ingredients.data ?? []) {
    const g = toGrams(Number(l.amount), l.unit);
    if (g == null || !(g > 0) || !l.ingredients || !l.ingredient_id) continue;
    const prev = ingMap.get(l.ingredient_id);
    if (prev) prev.g += g;
    else
      ingMap.set(l.ingredient_id, {
        id: l.ingredient_id,
        name: ingredientDisplayName(l.ingredients),
        g,
      });
  }
  const ingLines = [...ingMap.values()];
  const ingLine = ingLines.find((l) => l.id === draft.ing);
  const ingTarget = Number(draft.ingG);
  const useIng = mode === "ING" && Boolean(ingLine) && ingTarget > 0;
  const ingMultiplier = useIng ? Math.round((ingTarget / ingLine!.g) * 10000) / 10000 : Number.NaN;
  const effectiveMultiplierAll = useBase
    ? bwMultiplier
    : useIng
      ? ingMultiplier
      : effectiveMultiplier;
  const parsedTarget = useBase
    ? bwTargetG
    : useIng
      ? null
      : draft.target.trim()
        ? Number(draft.target)
        : null;
  const preview =
    Number.isFinite(effectiveMultiplierAll) && effectiveMultiplierAll > 0
      ? productionDemandSummary(
          [{ multiplier: effectiveMultiplierAll, target_quantity_g: parsedTarget }],
          base,
        )
      : null;
  // 규격 스펙: 이 주문의 완성 사이즈에 이 역할(SHEET/CREAM…)로 정의된 줄이 있으면 눌러서 그대로 적용한다.
  const sessionSize = useQuery({
    queryKey: ["work_sessions", "cake_size_id", row.work_session_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_sessions")
        .select("cake_size_id")
        .eq("id", row.work_session_id)
        .maybeSingle();
      if (error) throw error;
      return data?.cake_size_id ?? null;
    },
  });
  const specLines = useQuery(sizeSpecLinesQuery());
  const capacities = useQuery(capacitiesQuery());
  const specChoices = (specLines.data ?? []).filter(
    (l) => l.cake_size_id === sessionSize.data && l.slot === row.slot,
  );
  const applySpec = (line: (typeof specChoices)[number]) => {
    const cap = (capacities.data ?? []).find((c) => c.id === line.capacity_id);
    if (!cap) return;
    if (cap.kind === "MOULD")
      setDraft((d) => ({ ...d, mould: cap.id, qty: String(line.capacity_qty), bw: "" }));
    else setDraft((d) => ({ ...d, bw: cap.id, bwQty: String(line.capacity_qty), mould: "" }));
  };
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
          : useIng
            ? { multiplier: ingMultiplier, target_quantity_g: null }
            : parseComponentPlan(draft.multiplier, draft.target, row.multiplier);
      if (!Number.isFinite(plan.multiplier) || plan.multiplier <= 0)
        throw new Error("생산 배수를 계산할 수 없어요 — 몰드의 기준중량을 확인하세요");
      const { data, error } = await supabase.rpc("save_order_component_plan_v3", {
        p_selection_id: row.id,
        p_expected_updated_at: baseline.current.updatedAt,
        p_version_id: draft.version,
        p_multiplier: plan.multiplier,
        p_target_quantity_g: plan.target_quantity_g,
        p_version_pinned: draft.pinned,
        p_mould_id: useMould ? draft.mould : null,
        p_mould_qty: useMould ? Number(qtyText) : null,
        p_base_weight_id: useBase ? draft.bw : null,
        p_base_weight_qty: useBase ? bwQtyNum : null,
      });
      if (error) throw error;
      // 재료 기준이면 기준 재료/목표 g를 함께 저장(요약에 그대로 보여주기 위함), 다른 방식이면 비운다.
      const { data: basis, error: basisError } = await supabase
        .from("work_session_formula_versions")
        .update({
          plan_ingredient_id: useIng ? draft.ing : null,
          plan_ingredient_g: useIng ? ingTarget : null,
        })
        .eq("id", row.id)
        .select("updated_at,plan_ingredient_id,plan_ingredient_g")
        .single();
      if (basisError) throw basisError;
      return { ...(data as object), ...basis } as {
        id: string;
        formula_version_id: string;
        multiplier: number;
        target_quantity_g: number | null;
        version_pinned: boolean;
        mould_id: string | null;
        mould_qty: number | null;
        base_weight_id: string | null;
        base_weight_qty: number | null;
        updated_at: string;
        plan_ingredient_id: string | null;
        plan_ingredient_g: number | null;
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
        bw: saved.base_weight_id ?? "",
        bwQty: saved.base_weight_qty == null ? "1" : String(saved.base_weight_qty),
        ing: saved.plan_ingredient_id ?? "",
        ingG: saved.plan_ingredient_g == null ? "" : String(saved.plan_ingredient_g),
        mode: "",
      };
      setEditing(false);
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
  // 저장된 계획의 텍스트 요약 — 입력한 내용(재료/몰드/기준중량/배수)을 그대로 보여준다.
  const savedVersion = (versions.data ?? []).find((v) => v.id === draft.version);
  const versionText = `V${savedVersion?.version_number ?? row.formula_versions.version_number}${
    savedVersion ? ` · ${savedVersion.status}` : ""
  }`;
  const productionText =
    ingredients.isSuccess && preview ? ` · 생산 ${fmtNumber(preview.production)}g` : "";
  let planText: string;
  if (mode === "ING" && ingLine && Number.isFinite(ingMultiplier))
    planText = `재료 기준 — ${ingLine.name} ${fmtNumber(ingTarget)}g → 레시피 ×${fmtNumber(ingMultiplier, 4)}`;
  else if (useMould && targetMould)
    planText = `몰드 기준 — ${mouldAbbr(targetMould)} ×${fmtNumber(Number(qtyText), 2)} → 레시피 ×${fmtNumber(effectiveMultiplier, 4)}`;
  else if (useBase && bwPreset)
    planText = `기준중량 기준 — ${bwPreset.name} ×${fmtNumber(bwQtyNum, 2)} = 목표 ${bwTargetG != null ? fmtNumber(bwTargetG) : "?"}g → 레시피 ×${fmtNumber(bwMultiplier, 4)}`;
  else
    planText = `배수 직접 입력 — 레시피 ×${fmtNumber(Number(draft.multiplier) || row.multiplier, 4)}`;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs">
        {row.formula_versions.formulas.components?.name ?? row.formula_versions.formulas.name}
      </p>
      {!editing && (
        <div className="space-y-1">
          <p className="font-mono text-[11px]">
            {versionText} · {planText}
            {productionText}
          </p>
          {!disabled && (
            <button type="button" className={buttonClass} onClick={() => setEditing(true)}>
              생산 계획 수정
            </button>
          )}
        </div>
      )}
      {editing && (
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
                    !["ARCHIVED", "SUPERSEDED"].includes(v.status) ||
                    v.id === row.formula_version_id,
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    V{v.version_number} · {v.status}
                  </option>
                ))}
            </select>
          </label>
          {specChoices.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="label-caps text-muted-foreground">규격 스펙</span>
              {specChoices.map((l) => {
                const cap = (capacities.data ?? []).find((c) => c.id === l.capacity_id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`${buttonClass} !h-7 !min-h-0 px-2 text-[11px]`}
                    disabled={!cap}
                    title={
                      cap ? "이 규격 스펙대로 적용" : "SETTINGS > 규격 스펙에서 기준을 정하세요"
                    }
                    onClick={() => applySpec(l)}
                  >
                    {l.label || l.slot} · {cap ? `${cap.name} ×${l.capacity_qty}` : "기준 미정"}
                  </button>
                );
              })}
            </div>
          )}
          <div className="space-y-2 border border-border/70 bg-background/60 p-2">
            <label className="block text-[11px]">
              입력 방식
              <select
                aria-label="입력 방식"
                className={selectClass}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    mode: next,
                    // 다른 방식으로 바꾸면 이전 방식의 몰드/기준중량 선택은 비운다(저장 시 섞이지 않게).
                    mould: next === "MOULD" ? d.mould : "",
                    qty: next === "MOULD" ? d.qty : "",
                    bw: next === "BASE" ? d.bw : "",
                    bwQty: next === "BASE" ? d.bwQty : "1",
                    ing: next === "ING" ? d.ing : "",
                    ingG: next === "ING" ? d.ingG : "",
                  }));
                }}
              >
                {mouldMode ? (
                  <option value="MOULD">몰드 기준</option>
                ) : (
                  <option value="BASE">기준중량 기준</option>
                )}
                <option value="MULT">배수 직접 입력</option>
                <option value="ING">재료 기준</option>
              </select>
            </label>
            {mode === "MOULD" && mouldMode && (
              <>
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
                      <option value="">몰드 선택…</option>
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
                {useMould && (
                  <p className="font-mono text-[11px]">
                    {mouldAbbr(targetMould!)} ×{fmtNumber(Number(qtyText), 2)} = 레시피(
                    {baseMould ? mouldAbbr(baseMould) : "기본"} 기준) ×
                    {Number.isFinite(effectiveMultiplier) ? fmtNumber(effectiveMultiplier, 4) : "?"}
                  </p>
                )}
              </>
            )}
            {mode === "BASE" && !mouldMode && (
              <>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <label className="text-[11px]">
                    기준중량 (SETTINGS)
                    <select
                      aria-label="기준중량"
                      className={selectClass}
                      value={draft.bw}
                      onChange={(e) => setDraft((d) => ({ ...d, bw: e.target.value, bwQty: "1" }))}
                    >
                      <option value="">기준중량 선택…</option>
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
                {useBase && (
                  <p className="font-mono text-[11px]">
                    {bwPreset!.name} ×{fmtNumber(bwQtyNum, 2)} = 목표{" "}
                    {bwTargetG != null ? fmtNumber(bwTargetG) : "?"}g → 레시피 ×
                    {Number.isFinite(bwMultiplier) ? fmtNumber(bwMultiplier, 4) : "?"}
                  </p>
                )}
                {draft.bw && base <= 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    이 버전의 재료 합계(g)를 알 수 없어 기준중량으로 배수를 계산할 수 없어요.
                  </p>
                )}
              </>
            )}
            {mode === "MULT" && (
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
            {mode === "ING" && (
              <>
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <label className="text-[11px]">
                    기준 재료
                    <select
                      aria-label="기준 재료"
                      className={selectClass}
                      value={draft.ing}
                      onChange={(e) => setDraft((d) => ({ ...d, ing: e.target.value, ingG: "" }))}
                    >
                      <option value="">재료 선택…</option>
                      {ingLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · 레시피 {fmtNumber(l.g)}g
                        </option>
                      ))}
                    </select>
                  </label>
                  {ingLine && (
                    <label className="text-[11px]">
                      목표 (g)
                      <input
                        aria-label="기준 재료 목표 g"
                        type="number"
                        min="0"
                        step="any"
                        className={inputClass}
                        value={draft.ingG}
                        onChange={(e) => setDraft((d) => ({ ...d, ingG: e.target.value }))}
                      />
                    </label>
                  )}
                </div>
                {ingLine && (
                  <p className="font-mono text-[11px]">
                    {ingLine.name} {draft.ingG ? fmtNumber(ingTarget) : "?"}g ÷{" "}
                    {fmtNumber(ingLine.g)}g → 레시피 ×
                    {Number.isFinite(ingMultiplier) ? fmtNumber(ingMultiplier, 4) : "?"}
                  </p>
                )}
              </>
            )}
          </div>
          {mode === "MULT" && !Number.isInteger(row.multiplier) && (
            <p className="text-[11px] text-muted-foreground">
              MERGE에서 나눈 주문 배정분입니다. 배수를 직접 바꿀 때는 정수로 입력하세요.
            </p>
          )}
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
          </button>{" "}
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setDraft(baseline.current.draft);
              setEditing(false);
            }}
          >
            취소
          </button>
        </fieldset>
      )}
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
