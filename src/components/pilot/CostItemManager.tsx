import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  costItemHistoryQuery,
  costItemsQuery,
  costItemUsageQuery,
  currentUserId,
  type CostItem,
  type CostItemCategory,
} from "@/lib/queries";
import { fmtCurrency } from "@/lib/cost";
import { formatDateTime } from "@/lib/datetime";
import { CostItemCreateForm } from "./CostItemCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

const CATEGORIES: { value: CostItemCategory; label: string }[] = [
  { value: "UTILITY", label: "UTILITY — 개당" },
  { value: "CONSUMABLE", label: "CONSUMABLE — 개당" },
  { value: "PACKAGING", label: "PACKAGING — 개당" },
  { value: "OVERHEAD", label: "OVERHEAD — 월 고정비" },
];

/** SETTINGS의 COST ITEMS 관리 섹션 — 카테고리별로 묶어서 목록/수정/삭제(사용 중 보호) */
export function CostItemManager() {
  const items = useQuery(costItemsQuery());
  const usage = useQuery(costItemUsageQuery());
  const [addingCategory, setAddingCategory] = useState<CostItemCategory | null>(null);

  const rows = items.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <div className="space-y-4">
      {CATEGORIES.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat.value);
        return (
          <SectionCard
            key={cat.value}
            title={cat.label}
            action={
              <button
                type="button"
                className="label-caps px-2 py-2 text-xs hover:bg-secondary"
                onClick={() =>
                  setAddingCategory((v) => (v === cat.value ? null : cat.value))
                }
              >
                {addingCategory === cat.value ? "CLOSE" : "+ ADD ITEM"}
              </button>
            }
          >
            {addingCategory === cat.value && (
              <div className="mb-4 border border-border p-4">
                <CostItemCreateForm
                  defaultCategory={cat.value}
                  onCancel={() => setAddingCategory(null)}
                  onCreated={() => setAddingCategory(null)}
                />
              </div>
            )}
            {catRows.length === 0 ? (
              <p className="font-mono text-xs uppercase text-muted-foreground">
                항목 없음
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border">
                {catRows.map((item) => (
                  <CostItemRow key={item.id} item={item} used={usageMap[item.id] ?? 0} />
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function CostItemRow({ item, used }: { item: CostItem; used: number }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery({ ...costItemHistoryQuery(item.id), enabled: historyOpen });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cost_items"] });
    await queryClient.invalidateQueries({ queryKey: ["cost_item_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["component_cost_items"] });
    await queryClient.invalidateQueries({ queryKey: ["component_cost_items_bulk"] });
    await queryClient.invalidateQueries({ queryKey: ["product_cost_items"] });
    await queryClient.invalidateQueries({ queryKey: ["cost_item_history", item.id] });
  };

  const update = useMutation({
    mutationFn: async (patch: { name?: string; unit_cost?: number; unit_label?: string | null }) => {
      const { error } = await supabase.from("cost_items").update(patch).eq("id", item.id);
      if (error) throw error;
      // 단가(unit_cost)가 바뀔 때만 이력을 남긴다 — "언제, 얼마에서 얼마로, 왜"를 추적해서
      // 나중에 실제 운용 비용이 나왔을 때 근거와 함께 갱신할 수 있게 한다(2026-09-24).
      if (patch.unit_cost !== undefined) {
        const user_id = await currentUserId();
        const { error: historyError } = await supabase.from("cost_item_history").insert({
          user_id,
          cost_item_id: item.id,
          previous_cost: item.unit_cost,
          new_cost: patch.unit_cost,
          note: note.trim() || null,
        });
        if (historyError) throw historyError;
        setNote("");
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cost_items").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} flex-1 min-w-[10rem] border-transparent hover:border-input`}
          defaultValue={item.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== item.name) update.mutate({ name });
          }}
        />
        <div className="flex items-center gap-1">
          <span className="label-caps text-[10px] text-muted-foreground">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={`${inputClass} w-24 border-transparent text-right hover:border-input`}
            defaultValue={item.unit_cost}
            onBlur={(e) => {
              const next = e.target.value.trim() ? Number(e.target.value) : 0;
              if (next !== item.unit_cost) update.mutate({ unit_cost: next });
            }}
          />
        </div>
        <input
          className={`${inputClass} w-28 border-transparent hover:border-input`}
          placeholder="단위(OPTIONAL)"
          defaultValue={item.unit_label ?? ""}
          onBlur={(e) => {
            const unit_label = e.target.value.trim() || null;
            if (unit_label !== (item.unit_label ?? null)) update.mutate({ unit_label });
          }}
        />
        <span className="label-caps text-xs text-muted-foreground">
          {fmtCurrency(item.unit_cost)}
          {item.unit_label ? ` / ${item.unit_label}` : ""}
        </span>
        <span className="label-caps text-xs text-muted-foreground">
          {used > 0 ? `${used} IN USE` : "UNUSED"}
        </span>
        <button
          type="button"
          className={`${buttonClass} px-3 text-xs`}
          onClick={() => setHistoryOpen((v) => !v)}
        >
          {historyOpen ? "이력 닫기" : "이력"}
        </button>
        <button
          type="button"
          className={`${buttonClass} px-3 text-xs`}
          onClick={() => {
            if (used > 0) {
              alert(`${used}곳에서 이 항목을 사용 중입니다 — 먼저 배정을 해제하세요.`);
              return;
            }
            if (confirm(`DELETE "${item.name}"?`)) remove.mutate();
          }}
        >
          DELETE
        </button>
      </div>

      {historyOpen && (
        <div className="space-y-2 border-t border-dashed border-border pt-2">
          <input
            className={`${inputClass} w-full text-xs`}
            placeholder="단가를 바꿀 때 근거/메모를 여기 적고 위 $ 칸을 수정하면 이력에 함께 남습니다"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {history.isLoading ? (
            <p className="font-mono text-[11px] text-muted-foreground">LOADING…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">이력 없음</p>
          ) : (
            <ul className="space-y-1">
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="font-mono text-[11px] text-muted-foreground">
                  {formatDateTime(h.changed_at)} ·{" "}
                  {h.previous_cost != null
                    ? `${fmtCurrency(h.previous_cost)} → ${fmtCurrency(h.new_cost)}`
                    : `${fmtCurrency(h.new_cost)} (초기 기록)`}
                  {h.note ? ` — ${h.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
