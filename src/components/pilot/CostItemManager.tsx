import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { costItemsQuery, costItemUsageQuery, type CostItemCategory } from "@/lib/queries";
import { fmtCurrency } from "@/lib/cost";
import { CostItemCreateForm } from "./CostItemCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

const CATEGORIES: { value: CostItemCategory; label: string }[] = [
  { value: "UTILITY", label: "UTILITY — 배치당" },
  { value: "CONSUMABLE", label: "CONSUMABLE — 배치당" },
  { value: "PACKAGING", label: "PACKAGING — 개당" },
  { value: "OVERHEAD", label: "OVERHEAD — 월 고정비" },
];

/** SETTINGS의 COST ITEMS 관리 섹션 — 카테고리별로 묶어서 목록/수정/삭제(사용 중 보호) */
export function CostItemManager() {
  const queryClient = useQueryClient();
  const items = useQuery(costItemsQuery());
  const usage = useQuery(costItemUsageQuery());
  const [addingCategory, setAddingCategory] = useState<CostItemCategory | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cost_items"] });
    await queryClient.invalidateQueries({ queryKey: ["cost_item_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["component_cost_items"] });
    await queryClient.invalidateQueries({ queryKey: ["component_cost_items_bulk"] });
    await queryClient.invalidateQueries({ queryKey: ["product_cost_items"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; unit_cost?: number; unit_label?: string | null };
    }) => {
      const { error } = await supabase.from("cost_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cost_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

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
                {catRows.map((item) => {
                  const used = usageMap[item.id] ?? 0;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <input
                        className={`${inputClass} flex-1 min-w-[10rem] border-transparent hover:border-input`}
                        defaultValue={item.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== item.name)
                            update.mutate({ id: item.id, patch: { name } });
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <span className="label-caps text-[10px] text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          className={`${inputClass} w-24 border-transparent text-right hover:border-input`}
                          defaultValue={item.unit_cost}
                          onBlur={(e) => {
                            const next = e.target.value.trim() ? Number(e.target.value) : 0;
                            if (next !== item.unit_cost)
                              update.mutate({ id: item.id, patch: { unit_cost: next } });
                          }}
                        />
                      </div>
                      <input
                        className={`${inputClass} w-28 border-transparent hover:border-input`}
                        placeholder="단위(OPTIONAL)"
                        defaultValue={item.unit_label ?? ""}
                        onBlur={(e) => {
                          const unit_label = e.target.value.trim() || null;
                          if (unit_label !== (item.unit_label ?? null))
                            update.mutate({ id: item.id, patch: { unit_label } });
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
                        onClick={() => {
                          if (used > 0) {
                            alert(
                              `${used}곳에서 이 항목을 사용 중입니다 — 먼저 배정을 해제하세요.`,
                            );
                            return;
                          }
                          if (confirm(`DELETE "${item.name}"?`)) remove.mutate(item.id);
                        }}
                      >
                        DELETE
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
