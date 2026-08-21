import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mouldUsageQuery, mouldsQuery } from "@/lib/queries";
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
      patch: { name?: string; shape_size?: string | null; notes?: string | null };
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
