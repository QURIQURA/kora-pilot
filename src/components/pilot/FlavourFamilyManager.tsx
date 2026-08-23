import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { flavourFamiliesQuery, flavourFamilyUsageQuery } from "@/lib/queries";
import { FlavourFamilyCreateForm } from "./FlavourFamilyCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

/** SETTINGS의 FLAVOUR FAMILIES 관리 섹션 — 목록/수정/색상/정렬/삭제(사용 중 보호) */
export function FlavourFamilyManager() {
  const queryClient = useQueryClient();
  const families = useQuery(flavourFamiliesQuery());
  const usage = useQuery(flavourFamilyUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["flavour_families"] });
    await queryClient.invalidateQueries({
      queryKey: ["flavour_family_usage"],
    });
    await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        name_en?: string | null;
        color?: string;
        sort_order?: number;
      };
    }) => {
      const { error } = await supabase
        .from("flavour_families")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("flavour_families")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = families.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="FLAVOUR FAMILIES"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD FAMILY"}
        </button>
      }
    >
      {adding && (
        <div className="mb-4 border border-border p-4">
          <FlavourFamilyCreateForm
            onCancel={() => setAdding(false)}
            onCreated={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO FLAVOUR FAMILIES YET
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((family) => {
            const used = usageMap[family.id] ?? 0;
            return (
              <li
                key={family.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <input
                  type="color"
                  aria-label={`COLOR ${family.name}`}
                  className="h-11 w-11 shrink-0 border border-input bg-background p-1"
                  defaultValue={family.color}
                  key={`color-${family.id}-${family.color}`}
                  onBlur={(e) => {
                    const color = e.target.value.toUpperCase();
                    if (color !== family.color)
                      update.mutate({ id: family.id, patch: { color } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                  defaultValue={family.name}
                  key={`name-${family.id}-${family.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== family.name)
                      update.mutate({ id: family.id, patch: { name } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                  placeholder="ENGLISH NAME"
                  defaultValue={family.name_en ?? ""}
                  key={`en-${family.id}-${family.name_en ?? ""}`}
                  onBlur={(e) => {
                    const name_en = e.target.value.trim() || null;
                    if (name_en !== (family.name_en ?? null))
                      update.mutate({ id: family.id, patch: { name_en } });
                  }}
                />
                <input
                  type="number"
                  aria-label={`SORT ORDER ${family.name}`}
                  className={`${inputClass} w-20 border-transparent text-center hover:border-input`}
                  defaultValue={family.sort_order}
                  key={`sort-${family.id}-${family.sort_order}`}
                  onBlur={(e) => {
                    const sort_order = Number(e.target.value);
                    if (
                      Number.isFinite(sort_order) &&
                      sort_order !== family.sort_order
                    )
                      update.mutate({ id: family.id, patch: { sort_order } });
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
                        `재료 ${used}개가 이 계열을 사용 중입니다 — 해당 재료의 계열을 먼저 변경하세요.`
                      );
                      return;
                    }
                    if (confirm(`DELETE "${family.name}"?`))
                      remove.mutate(family.id);
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
