import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { costItemsQuery, currentUserId, productCostItemsQuery } from "@/lib/queries";
import { fmtCurrency } from "@/lib/cost";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

/**
 * PRODUCT DETAIL — PACKAGING 항목 (2026-09-23, 개당).
 * 상자/보드/스티커/리본 등 이 Product 1개(사이즈 무관)에 드는 포장 원가를 배정한다.
 * Component의 PRODUCTION COST 항목(배치당)과 대칭 구조 — ComponentCostItemsSection 참고.
 */
export function ProductPackagingSection({ productId }: { productId: string }) {
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
    (item) => item.category === "PACKAGING" && !rows.some((r) => r.cost_item_id === item.id),
  );
  const total = rows.reduce((sum, r) => sum + r.quantity * r.cost_items.unit_cost, 0);

  return (
    <SectionCard
      title="PACKAGING (개당)"
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
                {item.name} — {fmtCurrency(item.unit_cost)}
                {item.unit_label ? ` / ${item.unit_label}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          배정된 항목 없음 — SETTINGS에서 COST ITEMS(PACKAGING)를 먼저 등록하세요.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="label-caps flex-1 min-w-[8rem] text-xs text-muted-foreground">
                {row.cost_items.name}
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
