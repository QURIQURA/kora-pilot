import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  methodsQuery,
  methodUsageQuery,
  techniqueCategoriesQuery,
} from "@/lib/queries";
import { leafTechniques, techniquePathLabel } from "@/lib/technique";
import type { Method } from "@/lib/method";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

/**
 * SETTINGS의 METHODS 관리 섹션.
 * Method는 특정 TECHNIQUE CATEGORY(리프)에 종속 — 그 기법 밑에 그룹핑해서 보여준다.
 * 사용 중(FORMULA에서 참조 중)인 Method는 삭제할 수 없다 (FlavourFamilyManager와 동일 패턴).
 */
export function MethodManager() {
  const queryClient = useQueryClient();
  const methods = useQuery(methodsQuery());
  const usage = useQuery(methodUsageQuery());
  const techniques = useQuery(techniqueCategoriesQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["methods"] });
    await queryClient.invalidateQueries({ queryKey: ["method_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["methods_by_technique_category"] });
  };

  const create = useMutation({
    mutationFn: async ({
      name,
      nameEn,
      techniqueCategoryId,
      sortOrder,
    }: {
      name: string;
      nameEn: string;
      techniqueCategoryId: string;
      sortOrder: number;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("methods").insert({
        user_id,
        name,
        name_en: nameEn || null,
        technique_category_id: techniqueCategoryId,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Method> }) => {
      const { error } = await supabase.from("methods").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = methods.data ?? [];
  const techniqueList = techniques.data ?? [];
  const usageMap = usage.data ?? {};
  const leaves = leafTechniques(techniqueList);

  const grouped = new Map<string, Method[]>();
  for (const m of rows) {
    const key = m.technique_category_id ?? "";
    grouped.set(key, [...(grouped.get(key) ?? []), m]);
  }

  const nextSort = (techniqueCategoryId: string) =>
    (grouped.get(techniqueCategoryId)?.length ?? 0) + 1;

  return (
    <SectionCard
      title="METHODS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD METHOD"}
        </button>
      }
    >
      <div className="space-y-3">
        {adding && (
          <MethodCreateForm
            leaves={leaves}
            onCancel={() => setAdding(false)}
            onCreate={(name, nameEn, techniqueCategoryId) => {
              create.mutate({
                name,
                nameEn,
                techniqueCategoryId,
                sortOrder: nextSort(techniqueCategoryId),
              });
              setAdding(false);
            }}
          />
        )}

        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO METHODS YET</p>
        ) : (
          <ul className="space-y-3">
            {leaves
              .filter(({ category }) => (grouped.get(category.id)?.length ?? 0) > 0)
              .map(({ category }) => (
                <li key={category.id} className="border border-border">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <span className="label-caps text-xs text-muted-foreground">
                      {techniquePathLabel(techniqueList, category.id)}
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {(grouped.get(category.id) ?? []).map((method) => {
                      const used = usageMap[method.id] ?? 0;
                      return (
                        <li key={method.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <input
                            className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                            defaultValue={method.name}
                            key={`name-${method.id}-${method.name}`}
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== method.name)
                                update.mutate({ id: method.id, patch: { name } });
                            }}
                          />
                          <input
                            className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                            placeholder="ENGLISH NAME"
                            defaultValue={method.name_en ?? ""}
                            key={`en-${method.id}-${method.name_en ?? ""}`}
                            onBlur={(e) => {
                              const name_en = e.target.value.trim() || null;
                              if (name_en !== (method.name_en ?? null))
                                update.mutate({ id: method.id, patch: { name_en } });
                            }}
                          />
                          <input
                            type="number"
                            aria-label={`SORT ORDER ${method.name}`}
                            className={`${inputClass} w-20 border-transparent text-center hover:border-input`}
                            defaultValue={method.sort_order}
                            key={`sort-${method.id}-${method.sort_order}`}
                            onBlur={(e) => {
                              const sort_order = Number(e.target.value);
                              if (Number.isFinite(sort_order) && sort_order !== method.sort_order)
                                update.mutate({ id: method.id, patch: { sort_order } });
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
                                  `This method is currently used by ${used} formula${used > 1 ? "s" : ""} and cannot be deleted.`,
                                );
                                return;
                              }
                              if (confirm(`DELETE "${method.name}"?`)) remove.mutate(method.id);
                            }}
                          >
                            DELETE
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
          </ul>
        )}

        {(create.isError || update.isError || remove.isError) && (
          <p className="font-mono text-xs uppercase text-destructive">
            {((create.error ?? update.error ?? remove.error) as Error).message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function MethodCreateForm({
  leaves,
  onCreate,
  onCancel,
}: {
  leaves: ReturnType<typeof leafTechniques>;
  onCreate: (name: string, nameEn: string, techniqueCategoryId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [techniqueCategoryId, setTechniqueCategoryId] = useState("");

  return (
    <form
      className="space-y-2 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && techniqueCategoryId)
          onCreate(name.trim(), nameEn.trim(), techniqueCategoryId);
      }}
    >
      <select
        className={selectClass}
        required
        value={techniqueCategoryId}
        onChange={(e) => setTechniqueCategoryId(e.target.value)}
      >
        <option value="">TECHNIQUE CATEGORY 선택 (필수)</option>
        {leaves.map(({ category }) => (
          <option key={category.id} value={category.id}>
            {category.name}
            {category.name_en ? ` (${category.name_en})` : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          autoFocus
          placeholder="이름 (예: 오일 유화법)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          placeholder="ENGLISH (예: Oil Emulsion)"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass} text-xs`}>
          추가
        </button>
        <button type="button" className={`${buttonClass} text-xs`} onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  );
}
