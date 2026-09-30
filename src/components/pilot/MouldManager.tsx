import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mouldUsageQuery, mouldsQuery } from "@/lib/queries";
import { cmToMm, mmToCm } from "@/lib/product-size";
import { MouldCreateForm } from "./MouldCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

/** SETTINGS의 MOULDS 관리 섹션 — 목록/수정/삭제(사용 중 보호) */
export function MouldManager() {
  const queryClient = useQueryClient();
  const moulds = useQuery(mouldsQuery());
  const usage = useQuery(mouldUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["moulds"] });
    await queryClient.invalidateQueries({ queryKey: ["mould_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        shape_size?: string | null;
        reference_weight_g?: number | null;
        diameter_mm?: number | null;
        height_mm?: number | null;
        notes?: string | null;
      };
    }) => {
      const { error } = await supabase.from("moulds").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("moulds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = moulds.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="MOULDS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD MOULD"}
        </button>
      }
    >
      {adding && (
        <div className="mb-4 border border-border p-4">
          <MouldCreateForm
            onCancel={() => setAdding(false)}
            onCreated={() => setAdding(false)}
          />
        </div>
      )}

      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        지름/높이는 몰드 자체의 실측 치수입니다(아이싱 전). PRODUCT의 SIZES에서 이 몰드를
        선택하면 시작값으로 채워지며, 아이싱 후 완성 사이즈는 SIZES 쪽에서 직접 조정하세요.
      </p>

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO MOULDS YET
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((mould) => {
            const used = usageMap[mould.id] ?? 0;
            return (
              <li
                key={mould.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <input
                  className={`${inputClass} flex-1 min-w-[10rem] border-transparent hover:border-input`}
                  defaultValue={mould.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== mould.name)
                      update.mutate({ id: mould.id, patch: { name } });
                  }}
                />
                <input
                  className={`${inputClass} flex-1 min-w-[10rem] border-transparent hover:border-input`}
                  placeholder="SHAPE / SIZE"
                  defaultValue={mould.shape_size ?? ""}
                  onBlur={(e) => {
                    const shape_size = e.target.value.trim() || null;
                    if (shape_size !== (mould.shape_size ?? null))
                      update.mutate({ id: mould.id, patch: { shape_size } });
                  }}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    className={`${inputClass} !w-24 border-transparent text-right hover:border-input`}
                    placeholder="기준(g)"
                    defaultValue={mould.reference_weight_g ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim() ? Number(e.target.value) : null;
                      if (next !== (mould.reference_weight_g ?? null))
                        update.mutate({ id: mould.id, patch: { reference_weight_g: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">G</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    className={`${inputClass} !w-20 border-transparent text-right hover:border-input`}
                    placeholder="지름"
                    defaultValue={mould.diameter_mm != null ? mmToCm(mould.diameter_mm) : ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim() ? cmToMm(Number(e.target.value)) : null;
                      if (next !== (mould.diameter_mm ?? null))
                        update.mutate({ id: mould.id, patch: { diameter_mm: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">CM ⌀</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    className={`${inputClass} !w-20 border-transparent text-right hover:border-input`}
                    placeholder="높이"
                    defaultValue={mould.height_mm != null ? mmToCm(mould.height_mm) : ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim() ? cmToMm(Number(e.target.value)) : null;
                      if (next !== (mould.height_mm ?? null))
                        update.mutate({ id: mould.id, patch: { height_mm: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">CM H</span>
                </div>
                <span className="label-caps text-xs text-muted-foreground">
                  {used > 0 ? `${used} IN USE` : "UNUSED"}
                </span>
                <button
                  type="button"
                  className={`${buttonClass} px-3 text-xs`}
                  onClick={() => {
                    if (used > 0) {
                      alert(
                        `${used}개 버전이 이 몰드를 사용 중입니다 — 해당 버전의 몰드를 먼저 변경하세요.`
                      );
                      return;
                    }
                    if (confirm(`DELETE "${mould.name}"?`)) remove.mutate(mould.id);
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
}
