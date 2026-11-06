import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  cakeSizesQuery,
  capacitiesQuery,
  currentUserId,
  sizeSpecLinesQuery,
  type SizeSpecLine,
} from "@/lib/queries";
import { fmtNumber } from "@/lib/formula";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

export const SPEC_SLOTS = ["SHEET", "CREAM", "FILLING", "DECORATIVE"] as const;

/** 줄의 목표 g — 직접 적은 목표가 있으면 그것, 없으면 기준(g) × 개수. 둘 다 없으면 null(아직 숫자 미정). */
export function specTargetG(
  line: Pick<SizeSpecLine, "target_g" | "capacity_qty">,
  capacityWeightG: number | null | undefined,
): number | null {
  if (line.target_g != null) return Number(line.target_g);
  if (capacityWeightG != null && Number(capacityWeightG) > 0)
    return Number(capacityWeightG) * Number(line.capacity_qty);
  return null;
}

/**
 * SETTINGS > 규격 스펙 — 최종 완성 사이즈 하나가 "역할별 기준(몰드/기준중량) × 개수 = 목표 g" 줄들의 합이 되도록 정의한다.
 * 숫자는 레시피 조정이 끝나는 대로 채우면 되고(기준/목표 비어 있어도 됨), 주문 컴포넌트 설정에서 이 줄을 눌러 적용한다.
 */
export function SizeSpecManager() {
  const queryClient = useQueryClient();
  const sizes = useQuery(cakeSizesQuery());
  const lines = useQuery(sizeSpecLinesQuery());
  const capacities = useQuery(capacitiesQuery());
  const capList = capacities.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["size_spec_lines"] });

  const add = useMutation({
    mutationFn: async (v: { sizeId: string; slot: string; sort: number }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("size_spec_lines")
        .insert({ user_id, cake_size_id: v.sizeId, slot: v.slot, sort_order: v.sort });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<SizeSpecLine> }) => {
      const { error } = await supabase
        .from("size_spec_lines")
        .update({ ...v.patch, updated_at: new Date().toISOString() })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("size_spec_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <SectionCard title="규격 스펙 (완성 사이즈 = 컴포넌트별 기준 × 개수의 합)">
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        기준(CAPACITY)은 몰드 또는 BASE WEIGHT, 목표 g = 기준 g × 개수(직접 적으면 그 값 우선).
        숫자는 나중에 채워도 돼요. 주문의 컴포넌트 설정에서 이 줄을 눌러 그대로 적용할 수 있어요.
      </p>
      <div className="space-y-4">
        {(sizes.data ?? []).map((size) => {
          const sizeLines = (lines.data ?? []).filter((l) => l.cake_size_id === size.id);
          const total = sizeLines.reduce(
            (sum, l) =>
              sum + (specTargetG(l, capList.find((c) => c.id === l.capacity_id)?.weight_g) ?? 0),
            0,
          );
          return (
            <div key={size.id} className="border border-border">
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-2 py-1">
                <span className="font-mono text-sm">{size.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {size.servings ? `${size.servings}인분` : ""}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  합계 {total > 0 ? `${fmtNumber(total)}g` : "—"}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {sizeLines.map((l) => {
                  const cap = capList.find((c) => c.id === l.capacity_id);
                  const target = specTargetG(l, cap?.weight_g);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 px-2 py-1">
                      <select
                        aria-label="역할"
                        className={`${selectClass} !w-28`}
                        value={l.slot}
                        onChange={(e) =>
                          update.mutate({ id: l.id, patch: { slot: e.target.value } })
                        }
                      >
                        {SPEC_SLOTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="이름"
                        className={`${inputClass} !w-28`}
                        placeholder="이름 (샌딩/아이싱…)"
                        defaultValue={l.label}
                        onBlur={(e) => {
                          if (e.target.value !== l.label)
                            update.mutate({ id: l.id, patch: { label: e.target.value } });
                        }}
                      />
                      <select
                        aria-label="기준"
                        className={`${selectClass} !w-52`}
                        value={l.capacity_id ?? ""}
                        onChange={(e) =>
                          update.mutate({
                            id: l.id,
                            patch: { capacity_id: e.target.value || null },
                          })
                        }
                      >
                        <option value="">기준 미정</option>
                        {capList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.kind === "MOULD" ? "몰드" : "기준중량"} · {c.name}
                            {c.weight_g ? ` · ${fmtNumber(Number(c.weight_g))}g` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono text-xs">×</span>
                      <input
                        aria-label="개수"
                        type="number"
                        step="any"
                        min="0"
                        className={`${inputClass} !w-16`}
                        defaultValue={l.capacity_qty}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n > 0 && n !== Number(l.capacity_qty))
                            update.mutate({ id: l.id, patch: { capacity_qty: n } });
                        }}
                      />
                      <span className="font-mono text-xs">=</span>
                      <input
                        aria-label="목표 g"
                        type="number"
                        step="any"
                        min="0"
                        className={`${inputClass} !w-24`}
                        placeholder={target != null ? String(Math.round(target)) : "목표 g"}
                        defaultValue={l.target_g ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim() ? Number(e.target.value) : null;
                          if (v !== (l.target_g == null ? null : Number(l.target_g)))
                            update.mutate({ id: l.id, patch: { target_g: v } });
                        }}
                      />
                      <span className="font-mono text-[11px] text-muted-foreground">g</span>
                      <button
                        type="button"
                        className="ml-auto px-1 text-xs text-muted-foreground hover:text-destructive"
                        title="줄 삭제"
                        onClick={() => remove.mutate(l.id)}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-1 px-2 py-1">
                {SPEC_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`${buttonClass} !h-7 !min-h-0 px-2 text-[11px]`}
                    onClick={() => add.mutate({ sizeId: size.id, slot, sort: sizeLines.length })}
                  >
                    + {slot}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
