import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { costItemsQuery, currentUserId, productCostItemsQuery } from "@/lib/queries";
import { fmtCurrency } from "@/lib/cost";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

/**
 * PRODUCT DETAIL — PRODUCTION COST 항목 (2026-09-23, 케익 1개당).
 * UTILITY(전기/가스 등)/CONSUMABLE(소모품)/PACKAGING(상자/보드 등)을 전부 여기서, Product 1개
 * (사이즈 무관) 기준으로 배정한다. 원래 UTILITY/CONSUMABLE은 Component 단위·배치당으로 배정했었는데,
 * 케익 하나에 들어가는 Component 개수만큼 "배치" 횟수가 무한히 배수될 수 있어 고정 기준으로 삼기
 * 애매하다는 사용자 판단(2026-09-23)에 따라 PACKAGING과 동일하게 Product 단위·개당으로 통일했다.
 * OVERHEAD는 여기서 배정하지 않는다 — SETTINGS의 월 고정비÷월 케익 개수로 모든 Product에 공통 적용.
 */
export function ProductCostItemsSection({
  productId,
  overheadPerCake = 0,
}: {
  productId: string;
  /** 이 PRODUCTION COST 열의 항목 리스트에는 안 잡히는 OVERHEAD(월 고정비÷월 케익 개수) — 1열
   * "총원가" 계산식과 맞춰보기 위해 여기 합계에도 함께 표시한다(2026-09-23, 계산 검증 요청). */
  overheadPerCake?: number;
}) {
  const queryClient = useQueryClient();
  const linked = useQuery(productCostItemsQuery(productId));
  const allItems = useQuery(costItemsQuery());
  const [selecting, setSelecting] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product_cost_items", productId] });
    await queryClient.invalidateQueries({ queryKey: ["cost_item_usage"] });
  };

  const link = useMutation({
    mutationFn: async (costItemId: string) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("product_cost_items")
        .insert({ user_id, product_id: productId, cost_item_id: costItemId, quantity: 1 });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateQuantity = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase
        .from("product_cost_items")
        .update({ quantity })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_cost_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = linked.data ?? [];
  const candidates = (allItems.data ?? []).filter(
    (item) =>
      (item.category === "UTILITY" ||
        item.category === "CONSUMABLE" ||
        item.category === "PACKAGING") &&
      !rows.some((r) => r.cost_item_id === item.id),
  );
  const total = rows.reduce((sum, r) => sum + r.quantity * r.cost_items.unit_cost, 0);
  const grandTotal = total + overheadPerCake;

  return (
    <SectionCard
      title="PRODUCTION COST 항목 (케익 1개당 — UTILITY / CONSUMABLE / PACKAGING)"
      subtitle={
        <>
          항목 합계 {fmtCurrency(total)} + OVERHEAD {fmtCurrency(overheadPerCake)} = 합계{" "}
          {fmtCurrency(grandTotal)}
        </>
      }
      bodyClassName="max-h-[420px] overflow-y-auto"
      action={
        candidates.length > 0 ? (
          <button
            type="button"
            className="label-caps px-2 py-2 text-xs hover:bg-secondary"
            onClick={() => setSelecting((v) => !v)}
          >
            {selecting ? "CLOSE" : "+ ADD ITEM"}
          </button>
        ) : undefined
      }
    >
      {selecting && (
        <div className="mb-3">
          <select
            className={selectClass}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                link.mutate(e.target.value);
                setSelecting(false);
              }
            }}
          >
            <option value="" disabled>
              항목 선택...
            </option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                [{item.category}] {item.name} — {fmtCurrency(item.unit_cost)}
                {item.unit_label ? ` / ${item.unit_label}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          배정된 항목 없음 — SETTINGS에서 COST ITEMS(UTILITY/CONSUMABLE/PACKAGING)를 먼저 등록하세요.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="label-caps flex-1 min-w-[8rem] text-xs text-muted-foreground">
                [{row.cost_items.category}] {row.cost_items.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {fmtCurrency(row.cost_items.unit_cost)}
                {row.cost_items.unit_label ? ` / ${row.cost_items.unit_label}` : ""}
              </span>
              <span className="label-caps text-[10px] text-muted-foreground">×</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className={`${inputClass} w-20 text-right`}
                defaultValue={row.quantity}
                onBlur={(e) => {
                  const next = e.target.value.trim() ? Number(e.target.value) : 0;
                  if (next !== row.quantity) updateQuantity.mutate({ id: row.id, quantity: next });
                }}
              />
              <span className="font-mono text-xs tabular-nums">
                = {fmtCurrency(row.quantity * row.cost_items.unit_cost)}
              </span>
              <button
                type="button"
                className={`${buttonClass} px-3 text-xs`}
                onClick={() => unlink.mutate(row.id)}
              >
                REMOVE
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <p className="mt-2 font-mono text-xs uppercase text-muted-foreground">
          개당 합계: {fmtCurrency(total)}
        </p>
      )}
    </SectionCard>
  );
}
