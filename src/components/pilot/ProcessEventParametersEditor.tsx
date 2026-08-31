import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  processEventParametersQuery,
  processParameterDefinitionsQuery,
} from "@/lib/queries";
import { definitionsForCategory, type ProcessParameterDefinition } from "@/lib/process-parameters";
import { inputClass } from "./ui";

/**
 * PROCESS TIMELINE 이벤트별 구조화된 parameter 입력.
 * 해당 이벤트의 process_category(또는 공통 definition)에 맞는 parameter만 보여준다.
 * value_type에 따라 NUMERIC/TEXT/BOOLEAN 입력을 렌더링하고, 값이 비어 있으면 저장하지 않는다
 * (SensoryEvaluationSection과 동일한 upsert(process_event_id, definition_id) 패턴).
 */
export function ProcessEventParametersEditor({
  processEventId,
  categoryId,
}: {
  processEventId: string;
  categoryId: string | null;
}) {
  const queryClient = useQueryClient();
  const definitions = useQuery(processParameterDefinitionsQuery());
  const values = useQuery(processEventParametersQuery(processEventId));

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["process_event_parameters", processEventId],
    });
    await queryClient.invalidateQueries({ queryKey: ["process_parameter_definition_usage"] });
  };

  const upsert = useMutation({
    mutationFn: async ({
      definitionId,
      valueNumeric,
      valueText,
      valueBoolean,
    }: {
      definitionId: string;
      valueNumeric: number | null;
      valueText: string | null;
      valueBoolean: boolean | null;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("process_event_parameters").upsert(
        {
          user_id,
          process_event_id: processEventId,
          definition_id: definitionId,
          value_numeric: valueNumeric,
          value_text: valueText,
          value_boolean: valueBoolean,
        },
        { onConflict: "process_event_id,definition_id" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (definitionId: string) => {
      const { error } = await supabase
        .from("process_event_parameters")
        .delete()
        .eq("process_event_id", processEventId)
        .eq("definition_id", definitionId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const applicable = definitionsForCategory(definitions.data ?? [], categoryId);
  const valueByDefinition = new Map((values.data ?? []).map((v) => [v.definition_id, v]));

  if (applicable.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        SETTINGS → PROCESS PARAMETERS에서 이 카테고리에 맞는 parameter를 먼저 만드세요
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {applicable.map((def) => (
        <ParameterField
          key={def.id}
          definition={def}
          existing={valueByDefinition.get(def.id) ?? null}
          onSave={(v) => upsert.mutate({ definitionId: def.id, ...v })}
          onClear={() => remove.mutate(def.id)}
        />
      ))}
      {(upsert.isError || remove.isError) && (
        <p className="w-full font-mono text-xs uppercase text-destructive">
          {((upsert.error ?? remove.error) as Error).message}
        </p>
      )}
    </div>
  );
}

function ParameterField({
  definition,
  existing,
  onSave,
  onClear,
}: {
  definition: ProcessParameterDefinition;
  existing: {
    value_numeric: number | null;
    value_text: string | null;
    value_boolean: boolean | null;
  } | null;
  onSave: (v: {
    valueNumeric: number | null;
    valueText: string | null;
    valueBoolean: boolean | null;
  }) => void;
  onClear: () => void;
}) {
  const label = definition.unit ? `${definition.label} (${definition.unit})` : definition.label;

  if (definition.value_type === "BOOLEAN") {
    const checked = existing?.value_boolean ?? false;
    return (
      <label className="flex min-h-[44px] items-center gap-2 border border-border px-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            if (!e.target.checked && !existing) return; // 체크 안 된 값 없이 저장하지 않음
            onSave({ valueNumeric: null, valueText: null, valueBoolean: e.target.checked });
          }}
        />
        {label}
      </label>
    );
  }

  if (definition.value_type === "TEXT") {
    return (
      <div className="flex min-w-[9rem] flex-col gap-1">
        <span className="label-caps text-[11px] text-muted-foreground">{label}</span>
        <input
          className={`${inputClass} min-h-[40px]`}
          defaultValue={existing?.value_text ?? ""}
          key={`text-${definition.id}-${existing?.value_text ?? ""}`}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value === "") {
              if (existing) onClear();
              return;
            }
            if (value !== (existing?.value_text ?? ""))
              onSave({ valueNumeric: null, valueText: value, valueBoolean: null });
          }}
        />
      </div>
    );
  }

  // NUMERIC
  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      <span className="label-caps text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        className={`${inputClass} min-h-[40px] w-24`}
        defaultValue={existing?.value_numeric ?? ""}
        key={`numeric-${definition.id}-${existing?.value_numeric ?? ""}`}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") {
            if (existing) onClear();
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          if (num !== (existing?.value_numeric ?? null))
            onSave({ valueNumeric: num, valueText: null, valueBoolean: null });
        }}
      />
    </div>
  );
}
