import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  processCategoriesQuery,
  processCategoryUsageQuery,
} from "@/lib/queries";
import { ProcessCategoryCreateForm } from "./ProcessCategoryCreateForm";
import { SectionCard, buttonClass, inputClass } from "./ui";

/** SETTINGS의 PROCESS CATEGORIES 관리 섹션 — 목록/수정/색상/삭제(사용 중 보호) */
export function ProcessCategoryManager() {
  const queryClient = useQueryClient();
  const categories = useQuery(processCategoriesQuery());
  const usage = useQuery(processCategoryUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["process_categories"] });
    await queryClient.invalidateQueries({
      queryKey: ["process_category_usage"],
    });
    await queryClient.invalidateQueries({ queryKey: ["process_events"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; color?: string };
    }) => {
      const { error } = await supabase
        .from("process_categories")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("process_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = categories.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="PROCESS CATEGORIES"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD CATEGORY"}
        </button>
      }
    >
      {adding && (
        <div className="mb-4 border border-border p-4">
          <ProcessCategoryCreateForm
            onCancel={() => setAdding(false)}
            onCreated={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO PROCESS CATEGORIES YET
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((category) => {
            const used = usageMap[category.id] ?? 0;
            return (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <input
                  type="color"
                  aria-label={`COLOR ${category.name}`}
                  className="h-11 w-11 shrink-0 border border-input bg-background p-1"
                  defaultValue={category.color}
                  key={`color-${category.id}-${category.color}`}
                  onBlur={(e) => {
                    const color = e.target.value.toUpperCase();
                    if (color !== category.color)
                      update.mutate({ id: category.id, patch: { color } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[10rem] flex-1 border-transparent uppercase hover:border-input`}
                  defaultValue={category.name}
                  key={`name-${category.id}-${category.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim().toUpperCase();
                    if (name && name !== category.name)
                      update.mutate({ id: category.id, patch: { name } });
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
                        `${used}개 공정 이벤트가 이 카테고리를 사용 중입니다 — 이벤트의 카테고리를 먼저 변경하세요.`
                      );
                      return;
                    }
                    if (confirm(`DELETE "${category.name}"?`))
                      remove.mutate(category.id);
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
