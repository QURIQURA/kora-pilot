import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, sensoryAttributesQuery, sensoryAttributeUsageQuery } from "@/lib/queries";
import {
  SENSORY_CATEGORIES,
  SENSORY_CATEGORY_LABELS,
  groupAttributesByCategory,
  type SensoryAttribute,
  type SensoryCategory,
} from "@/lib/sensory";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

/**
 * SETTINGS의 SENSORY ATTRIBUTES 관리 섹션.
 * Texture/Flavour/Appearance 3개 카테고리로 그룹핑해서 보여준다.
 * 사용 중(EXPERIMENT에서 점수가 기록된)인 attribute는 삭제할 수 없다
 * (MethodManager/FlavourFamilyManager와 동일한 usage-protected delete 패턴).
 */
export function SensoryAttributeManager() {
  const queryClient = useQueryClient();
  const attributes = useQuery(sensoryAttributesQuery());
  const usage = useQuery(sensoryAttributeUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sensory_attributes"] });
    await queryClient.invalidateQueries({ queryKey: ["sensory_attribute_usage"] });
  };

  const create = useMutation({
    mutationFn: async ({
      name,
      nameEn,
      category,
      scaleMin,
      scaleMax,
      sortOrder,
    }: {
      name: string;
      nameEn: string;
      category: SensoryCategory;
      scaleMin: number;
      scaleMax: number;
      sortOrder: number;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("sensory_attributes").insert({
        user_id,
        name,
        name_en: nameEn || null,
        category,
        scale_min: scaleMin,
        scale_max: scaleMax,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SensoryAttribute> }) => {
      const { error } = await supabase.from("sensory_attributes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sensory_attributes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = attributes.data ?? [];
  const usageMap = usage.data ?? {};
  const grouped = groupAttributesByCategory(rows);

  const nextSort = (category: SensoryCategory) => (grouped.get(category)?.length ?? 0) + 1;

  return (
    <SectionCard
      title="SENSORY ATTRIBUTES"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD ATTRIBUTE"}
        </button>
      }
    >
      <div className="space-y-3">
        {adding && (
          <AttributeCreateForm
            onCancel={() => setAdding(false)}
            onCreate={(name, nameEn, category, scaleMin, scaleMax) => {
              create.mutate({
                name,
                nameEn,
                category,
                scaleMin,
                scaleMax,
                sortOrder: nextSort(category),
              });
              setAdding(false);
            }}
          />
        )}

        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO SENSORY ATTRIBUTES YET
          </p>
        ) : (
          <ul className="space-y-3">
            {SENSORY_CATEGORIES.filter((category) => (grouped.get(category)?.length ?? 0) > 0).map(
              (category) => (
                <li key={category} className="border border-border">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <span className="label-caps text-xs text-muted-foreground">
                      {SENSORY_CATEGORY_LABELS[category]}
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {(grouped.get(category) ?? []).map((attribute) => {
                      const used = usageMap[attribute.id] ?? 0;
                      return (
                        <li
                          key={attribute.id}
                          className="flex flex-wrap items-center gap-2 px-3 py-2"
                        >
                          <input
                            className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                            defaultValue={attribute.name}
                            key={`name-${attribute.id}-${attribute.name}`}
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== attribute.name)
                                update.mutate({ id: attribute.id, patch: { name } });
                            }}
                          />
                          <input
                            className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                            placeholder="ENGLISH NAME"
                            defaultValue={attribute.name_en ?? ""}
                            key={`en-${attribute.id}-${attribute.name_en ?? ""}`}
                            onBlur={(e) => {
                              const name_en = e.target.value.trim() || null;
                              if (name_en !== (attribute.name_en ?? null))
                                update.mutate({ id: attribute.id, patch: { name_en } });
                            }}
                          />
                          <input
                            type="number"
                            aria-label={`SCALE MIN ${attribute.name}`}
                            className={`${inputClass} w-16 border-transparent text-center hover:border-input`}
                            defaultValue={attribute.scale_min}
                            key={`min-${attribute.id}-${attribute.scale_min}`}
                            onBlur={(e) => {
                              const scale_min = Number(e.target.value);
                              if (Number.isFinite(scale_min) && scale_min !== attribute.scale_min)
                                update.mutate({ id: attribute.id, patch: { scale_min } });
                            }}
                          />
                          <span className="font-mono text-xs text-muted-foreground">–</span>
                          <input
                            type="number"
                            aria-label={`SCALE MAX ${attribute.name}`}
                            className={`${inputClass} w-16 border-transparent text-center hover:border-input`}
                            defaultValue={attribute.scale_max}
                            key={`max-${attribute.id}-${attribute.scale_max}`}
                            onBlur={(e) => {
                              const scale_max = Number(e.target.value);
                              if (Number.isFinite(scale_max) && scale_max !== attribute.scale_max)
                                update.mutate({ id: attribute.id, patch: { scale_max } });
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
                                  `This attribute is currently used by ${used} experiment${used > 1 ? "s" : ""} and cannot be deleted.`,
                                );
                                return;
                              }
                              if (confirm(`DELETE "${attribute.name}"?`))
                                remove.mutate(attribute.id);
                            }}
                          >
                            DELETE
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ),
            )}
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

function AttributeCreateForm({
  onCreate,
  onCancel,
}: {
  onCreate: (
    name: string,
    nameEn: string,
    category: SensoryCategory,
    scaleMin: number,
    scaleMax: number,
  ) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [category, setCategory] = useState<SensoryCategory>("TEXTURE");
  const [scaleMin, setScaleMin] = useState(1);
  const [scaleMax, setScaleMax] = useState(5);

  return (
    <form
      className="space-y-2 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim(), nameEn.trim(), category, scaleMin, scaleMax);
      }}
    >
      <select
        className={selectClass}
        required
        value={category}
        onChange={(e) => setCategory(e.target.value as SensoryCategory)}
      >
        {SENSORY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {SENSORY_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          autoFocus
          placeholder="이름 (예: 촉촉함)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          placeholder="ENGLISH (예: Moistness)"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="label-caps text-xs text-muted-foreground">SCALE</span>
        <input
          type="number"
          aria-label="SCALE MIN"
          className={`${inputClass} w-20`}
          value={scaleMin}
          onChange={(e) => setScaleMin(Number(e.target.value))}
        />
        <span className="font-mono text-xs text-muted-foreground">–</span>
        <input
          type="number"
          aria-label="SCALE MAX"
          className={`${inputClass} w-20`}
          value={scaleMax}
          onChange={(e) => setScaleMax(Number(e.target.value))}
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
