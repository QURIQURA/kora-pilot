import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { baseWeightUsageQuery, baseWeightsQuery } from "@/lib/queries";
import { BaseWeightCreateForm } from "./BaseWeightCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

/** SETTINGS의 BASE WEIGHTS 관리 섹션 — MouldManager와 대응. 목록/수정/삭제(사용 중 보호) */
export function BaseWeightManager() {
  const queryClient = useQueryClient();
  const baseWeights = useQuery(baseWeightsQuery());
  const usage = useQuery(baseWeightUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["base_weight_presets"] });
    await queryClient.invalidateQueries({ queryKey: ["base_weight_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; weight_g?: number; notes?: string | null };
    }) => {
      const { error } = await supabase.from("base_weight_presets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("base_weight_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = baseWeights.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="BASE WEIGHTS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD BASE WEIGHT"}
        </button>
      }
    >
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        몰드가 아닌 제품군(가나슈/필링/크림 등)의 배치 기준중량 — 실제 작업으로 정한 값을 등록해두면
        PRODUCTION에서 배수를 자동 계산하는 데 쓰입니다.
      </p>
      {adding && (
        <div className="mb-4 border border-border p-4">
          <BaseWeightCreateForm
            onCancel={() => setAdding(false)}
            onCreated={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">NO BASE WEIGHTS YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((bw) => {
            const used = usageMap[bw.id] ?? 0;
            return (
              <li key={bw.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input
                  className={`${inputClass} flex-1 min-w-[10rem] border-transparent hover:border-input`}
                  defaultValue={bw.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== bw.name) update.mutate({ id: bw.id, patch: { name } });
                  }}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    className={`${inputClass} w-24 border-transparent text-right hover:border-input`}
                    placeholder="기준(g)"
                    defaultValue={bw.weight_g}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next) && next !== Number(bw.weight_g))
                        update.mutate({ id: bw.id, patch: { weight_g: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">G</span>
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
                        `${used}개 버전이 이 기준중량을 사용 중입니다 — 해당 버전의 기준중량을 먼저 변경하세요.`,
                      );
                      return;
                    }
                    if (confirm(`DELETE "${bw.name}"?`)) remove.mutate(bw.id);
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
