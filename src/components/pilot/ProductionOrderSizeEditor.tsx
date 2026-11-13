import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  cakeSizesQuery,
  currentUserId,
  workSessionFormulaVersionsQuery,
  type OrderListRow,
} from "@/lib/queries";
import { ensureStandardProfile } from "@/lib/standard-profile";
import { formatProductSizeLabel } from "@/lib/product-size";
import { invalidateProductionSync } from "@/lib/production-sync";
import { ProductSelect } from "./ProductSelect";
import { buttonClass, inputClass, selectClass } from "./ui";

/** 이름이 이미 약어(Ø8″-H10)면 한 번만 보여준다 */
const sizeText = (c: {
  name: string;
  shape: string | null;
  diameter_mm: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
}) => {
  const abbr = formatProductSizeLabel({ ...c, shape: c.shape ?? "" });
  return c.name === abbr ? abbr : `${c.name} · ${abbr}`;
};

const stateFor = (order: OrderListRow) => ({
  product: order.product_id ?? "",
  size: order.product_size_id ?? "",
  standard: order.cake_size_id ?? "",
  servings: order.servings == null ? "" : String(order.servings),
});

export function ProductionOrderSizeEditor({
  order,
  sessionId,
  readOnly,
}: {
  order: OrderListRow;
  sessionId: string;
  readOnly: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => stateFor(order));
  const baseline = useRef({ state: stateFor(order), updatedAt: order.updated_at });
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current.state);
  const conflict = dirty && baseline.current.updatedAt !== order.updated_at;
  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(baseline.current.state)) {
      const state = stateFor(order);
      baseline.current = { state, updatedAt: order.updated_at };
      setDraft(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.updated_at]);
  const standards = useQuery(cakeSizesQuery());
  const selections = useQuery(workSessionFormulaVersionsQuery(sessionId));
  const selected = (standards.data ?? []).find((c) => c.id === draft.standard);
  /** 주문(+진행 중 세션)에 제품/사이즈를 저장한다. 저장하는 값은 next — 제품만 바꿀 때는 마지막 저장값 + 제품. */
  const persist = async (next: typeof draft) => {
    {
      const servings = next.servings.trim() ? Number(next.servings) : null;
      if (servings !== null && (!Number.isInteger(servings) || servings < 0))
        throw new Error("인분은 0 이상의 정수로 입력하세요");
      const uid = await currentUserId();
      const profileId = await ensureStandardProfile(next.product, next.standard, next.size);
      const { data, error } = await supabase
        .from("orders")
        .update({
          product_id: next.product || null,
          product_size_id: profileId,
          cake_size_id: next.standard || null,
          servings,
        })
        .eq("id", order.id)
        .eq("user_id", uid)
        .eq("updated_at", baseline.current.updatedAt)
        .select("updated_at")
        .single();
      if (error) throw new Error(`주문 사이즈 저장 실패 — 최신 값을 확인하세요: ${error.message}`);
      // Persist the saved order before mirroring optional session metadata. Never change recipe quantities.
      next = { ...next, size: profileId ?? "" };
      baseline.current = { state: next, updatedAt: data.updated_at };
      setDraft(next);
      const { error: sessionError } = await supabase
        .from("work_sessions")
        .update({
          product_id: next.product || null,
          product_size_id: profileId,
          cake_size_id: next.standard || null,
        })
        .eq("order_id", order.id)
        .eq("user_id", uid)
        .not("status", "in", "(COMPLETED,CANCELLED)");
      if (sessionError)
        throw new Error(
          `주문 사이즈는 저장됐지만 세션 반영이 실패했습니다. 다시 불러온 뒤 저장하세요: ${sessionError.message}`,
        );
    }
  };
  const save = useMutation({
    mutationFn: async () => {
      await persist(draft);
    },
    onSettled: () => {
      void invalidateProductionSync(client);
    },
  });
  // 제품만 바로 바꾸기(2026-11-05) — 오더 상세가 읽기 전용이 돼서 PRODUCTION ORDERS에서 바꾼다.
  // 제품 전용 사이즈는 제품마다 달라 비우고, 다른 미저장 편집은 건드리지 않는다.
  const changeProduct = useMutation({
    mutationFn: async (productId: string) => {
      const next = { ...baseline.current.state, product: productId, size: "" };
      await persist(next);
      setDraft((d) => ({ ...d, product: productId, size: "" }));
    },
    onSettled: () => {
      void invalidateProductionSync(client);
    },
  });
  const stored = (standards.data ?? []).find((c) => c.id === order.cake_size_id);
  const linkedParts = (selections.data ?? []).flatMap((r) =>
    r.formula_versions.formulas.component_id
      ? [
          {
            label: r.slot ?? r.kind,
            name: r.formula_versions.formulas.components?.name ?? r.formula_versions.formulas.name,
            componentId: r.formula_versions.formulas.component_id,
            formulaVersionId: r.formula_version_id,
          },
        ]
      : [],
  );
  return (
    <div className="border-t border-dashed border-border pt-2 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="label-caps text-[10px] text-muted-foreground">제품</span>
        <div className="min-w-0 flex-1 basis-56">
          <ProductSelect
            value={baseline.current.state.product}
            disabled={readOnly || changeProduct.isPending || save.isPending}
            onChange={(id) => changeProduct.mutate(id)}
            linkedParts={linkedParts}
          />
        </div>
        {changeProduct.isPending && <span className="text-muted-foreground">저장 중…</span>}
      </div>
      {changeProduct.isError && (
        <p role="alert" className="mb-2 text-destructive">
          {changeProduct.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className="flex-1">
          완성 사이즈 · {stored ? sizeText(stored) : "미지정"}
          {order.servings == null ? "" : ` · ${order.servings}인분`}
        </span>
        {!readOnly && (
          <button
            type="button"
            aria-expanded={open}
            className="underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "닫기" : "제품·사이즈 설정"}
          </button>
        )}
      </div>
      {open && !readOnly && (
        <fieldset
          disabled={save.isPending || changeProduct.isPending}
          className="mt-2 space-y-2 border border-border p-2"
        >
          <label className="block">
            제품
            <ProductSelect
              value={draft.product}
              onChange={(id) => setDraft((d) => ({ ...d, product: id, size: "" }))}
              linkedParts={linkedParts}
            />
          </label>
          <label className="block">
            공용 완성 규격
            <select
              className={selectClass}
              value={draft.standard}
              disabled={standards.isLoading}
              onChange={(e) => {
                const size = (standards.data ?? []).find((s) => s.id === e.target.value);
                setDraft((d) => ({
                  ...d,
                  standard: e.target.value,
                  size: "",
                  servings: size?.servings == null ? d.servings : String(size.servings),
                }));
              }}
            >
              <option value="">미지정</option>
              {(standards.data ?? [])
                .filter((s) => s.kind !== "FREE" || s.id === draft.standard)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {sizeText(s)} · #{s.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            인분
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={draft.servings}
              onChange={(e) => setDraft((d) => ({ ...d, servings: e.target.value }))}
            />
          </label>
          {conflict && (
            <p className="text-destructive">
              다른 화면에서 주문이 변경됐습니다.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const state = stateFor(order);
                  baseline.current = { state, updatedAt: order.updated_at };
                  setDraft(state);
                }}
              >
                최신 값 불러오기
              </button>
            </p>
          )}
          {save.isError && (
            <p role="alert" className="text-destructive">
              {save.error.message}
            </p>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={(!dirty && !save.isError) || conflict || standards.isError}
            onClick={() => save.mutate()}
          >
            사이즈 저장
          </button>
          <p className="text-muted-foreground">
            사이즈를 바꿔도 컴포넌트 생산 배수는 자동 변경하지 않습니다.
          </p>
        </fieldset>
      )}
    </div>
  );
}
