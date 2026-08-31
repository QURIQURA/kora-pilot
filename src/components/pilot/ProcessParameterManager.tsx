import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  processCategoriesQuery,
  processParameterDefinitionsQuery,
  processParameterDefinitionUsageQuery,
} from "@/lib/queries";
import {
  PROCESS_PARAMETER_VALUE_TYPES,
  type ProcessParameterDefinition,
  type ProcessParameterValueType,
} from "@/lib/process-parameters";
import type { ProcessCategory } from "@/lib/process";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

const COMMON_GROUP_KEY = "__common__";

/**
 * SETTINGS의 PROCESS PARAMETERS 관리 섹션.
 * process_category_id가 null인 definition은 "COMMON"(모든 카테고리 공통)으로 묶어서 보여준다.
 * 사용 중(process_event_parameters에 값이 기록된)인 definition은 삭제할 수 없다
 * (SensoryAttributeManager/MethodManager와 동일한 usage-protected delete 패턴).
 */
export function ProcessParameterManager() {
  const queryClient = useQueryClient();
  const definitions = useQuery(processParameterDefinitionsQuery());
  const usage = useQuery(processParameterDefinitionUsageQuery());
  const categories = useQuery(processCategoriesQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["process_parameter_definitions"] });
    await queryClient.invalidateQueries({ queryKey: ["process_parameter_definition_usage"] });
  };

  const create = useMutation({
    mutationFn: async ({
      categoryId,
      key,
      label,
      labelEn,
      valueType,
      unit,
      sortOrder,
    }: {
      categoryId: string | null;
      key: string;
      label: string;
      labelEn: string;
      valueType: ProcessParameterValueType;
      unit: string;
      sortOrder: number;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("process_parameter_definitions").insert({
        user_id,
        process_category_id: categoryId,
        key,
        label,
        label_en: labelEn || null,
        value_type: valueType,
        unit: unit || null,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<ProcessParameterDefinition>;
    }) => {
      const { error } = await supabase
        .from("process_parameter_definitions")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_parameter_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = definitions.data ?? [];
  const usageMap = usage.data ?? {};
  const categoryList = categories.data ?? [];
  const categoryById = new Map(categoryList.map((c) => [c.id, c]));

  const grouped = new Map<string, ProcessParameterDefinition[]>();
  for (const def of rows) {
    const groupKey = def.process_category_id ?? COMMON_GROUP_KEY;
    const list = grouped.get(groupKey) ?? [];
    list.push(def);
    grouped.set(groupKey, list);
  }

  const groupOrder = [
    COMMON_GROUP_KEY,
    ...categoryList.map((c) => c.id).filter((id) => grouped.has(id)),
  ];

  const nextSort = (groupKey: string) => (grouped.get(groupKey)?.length ?? 0) + 1;

  return (
    <SectionCard
      title="PROCESS PARAMETERS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD PARAMETER"}
        </button>
      }
    >
      <div className="space-y-3">
        {adding && (
          <ParameterCreateForm
            categories={categoryList}
            onCancel={() => setAdding(false)}
            onCreate={(categoryId, key, label, labelEn, valueType, unit) => {
              create.mutate({
                categoryId,
                key,
                label,
                labelEn,
                valueType,
                unit,
                sortOrder: nextSort(categoryId ?? COMMON_GROUP_KEY),
              });
              setAdding(false);
            }}
          />
        )}

        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO PROCESS PARAMETERS YET
          </p>
        ) : (
          <ul className="space-y-3">
            {groupOrder.map((groupKey) => {
              const groupLabel =
                groupKey === COMMON_GROUP_KEY
                  ? "COMMON (모든 카테고리)"
                  : (categoryById.get(groupKey)?.name ?? groupKey);
              return (
                <li key={groupKey} className="border border-border">
                  <div className="border-b border-border bg-secondary/40 px-3 py-2">
                    <span className="label-caps text-xs text-muted-foreground">{groupLabel}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {(grouped.get(groupKey) ?? []).map((def) => {
                      const used = usageMap[def.id] ?? 0;
                      return (
                        <li key={def.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <input
                            className={`${inputClass} min-w-[7rem] flex-1 border-transparent hover:border-input`}
                            defaultValue={def.label}
                            key={`label-${def.id}-${def.label}`}
                            onBlur={(e) => {
                              const label = e.target.value.trim();
                              if (label && label !== def.label)
                                update.mutate({ id: def.id, patch: { label } });
                            }}
                          />
                          <input
                            className={`${inputClass} min-w-[7rem] flex-1 border-transparent font-mono text-xs hover:border-input`}
                            placeholder="KEY"
                            defaultValue={def.key}
                            key={`key-${def.id}-${def.key}`}
                            onBlur={(e) => {
                              const key = e.target.value.trim();
                              if (key && key !== def.key)
                                update.mutate({ id: def.id, patch: { key } });
                            }}
                          />
                          <span className="label-caps text-xs text-muted-foreground">
                            {def.value_type}
                          </span>
                          <input
                            className={`${inputClass} w-24 border-transparent text-center hover:border-input`}
                            placeholder="UNIT"
                            defaultValue={def.unit ?? ""}
                            key={`unit-${def.id}-${def.unit ?? ""}`}
                            onBlur={(e) => {
                              const unit = e.target.value.trim() || null;
                              if (unit !== (def.unit ?? null))
                                update.mutate({ id: def.id, patch: { unit } });
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
                                  `This parameter is currently used by ${used} process event${used > 1 ? "s" : ""} and cannot be deleted.`,
                                );
                                return;
                              }
                              if (confirm(`DELETE "${def.label}"?`)) remove.mutate(def.id);
                            }}
                          >
                            DELETE
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
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

function ParameterCreateForm({
  categories,
  onCreate,
  onCancel,
}: {
  categories: ProcessCategory[];
  onCreate: (
    categoryId: string | null,
    key: string,
    label: string,
    labelEn: string,
    valueType: ProcessParameterValueType,
    unit: string,
  ) => void;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [valueType, setValueType] = useState<ProcessParameterValueType>("NUMERIC");
  const [unit, setUnit] = useState("");

  return (
    <form
      className="space-y-2 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim() && label.trim())
          onCreate(
            categoryId || null,
            key.trim(),
            label.trim(),
            labelEn.trim(),
            valueType,
            unit.trim(),
          );
      }}
    >
      <select
        className={selectClass}
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">COMMON (모든 카테고리)</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          autoFocus
          placeholder="라벨 (예: 온도)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className={`${inputClass} min-w-[8rem] flex-1 font-mono text-xs`}
          placeholder="KEY (예: temperature_c)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-[10rem] flex-1`}
          placeholder="ENGLISH LABEL (선택)"
          value={labelEn}
          onChange={(e) => setLabelEn(e.target.value)}
        />
        <select
          className={selectClass}
          value={valueType}
          onChange={(e) => setValueType(e.target.value as ProcessParameterValueType)}
        >
          {PROCESS_PARAMETER_VALUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} w-24`}
          placeholder="UNIT"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
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
