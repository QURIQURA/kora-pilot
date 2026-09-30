import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  taskTypeColorsQuery,
  taskTypeDefinitionsQuery,
  type TaskTypeDefinitionRow,
} from "@/lib/queries";
import {
  OBSERVATION_TASK_TYPES,
  TASK_TYPE_COLOR_CLASSES,
  TASK_TYPE_SUGGESTIONS,
  taskTypeColorClass,
  taskTypeColorKey,
} from "@/lib/workflow";
import { SectionCard, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * SETTINGS — TASK TYPE 관리(2026-09-30).
 * 예전엔 TASK_TYPE_SUGGESTIONS(코드에 하드코딩)가 전부였고, 색상만 task_type_colors에 사용자가
 * 고를 수 있었다. 이제 이름 자체도 task_type_definitions에 저장해 추가/이름변경/삭제가 가능하고,
 * TASK TYPE마다 "관찰값(높이/온도 등) 입력칸을 보여줄지"도 여기서 켜고 끌 수 있다.
 *
 * 주의: TASK의 task_type은 자유 텍스트라(참조 무결성 없음), 이름을 바꿔도 이미 만들어진 TASK들은
 * 예전 이름 그대로 남는다 — 새로 TASK를 만들 때 쓰는 "제안 이름"만 바뀐다. 색상/관찰값 설정도
 * TASK에 저장된 실제 문자열(소문자 기준)로 매칭되므로, 이름을 바꾸면 이미 만들어진 TASK는 새
 * 색상/관찰값 설정을 못 받고 기본값으로 보일 수 있다.
 */
export function TaskTypeManager() {
  const queryClient = useQueryClient();
  const definitions = useQuery(taskTypeDefinitionsQuery());
  const colors = useQuery(taskTypeColorsQuery());
  const [newName, setNewName] = useState("");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task_type_definitions"] }),
      queryClient.invalidateQueries({ queryKey: ["task_type_colors"] }),
    ]);
  };

  // 처음 열었는데 아직 한 번도 저장한 적이 없으면(테이블이 비어있으면) 기존 기본 제안 목록으로
  // 한 번만 시드(seed)해서, 사용자가 "0부터 새로 만들기"가 아니라 "기존 목록을 고쳐쓰기" 하게 한다.
  const seed = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const rows = TASK_TYPE_SUGGESTIONS.map((name, i) => ({
        user_id,
        key: taskTypeColorKey(name),
        name,
        has_observation_fields: OBSERVATION_TASK_TYPES.has(taskTypeColorKey(name)),
        sort_order: i,
      }));
      const { error } = await supabase.from("task_type_definitions").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const seeded = definitions.isSuccess;
  const rows = definitions.data ?? [];
  useEffect(() => {
    if (seeded && rows.length === 0 && !seed.isPending && !seed.isSuccess) {
      seed.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, rows.length]);

  const colorOverrides: Record<string, string> = {};
  for (const row of colors.data ?? []) colorOverrides[taskTypeColorKey(row.task_type)] = row.color_class;

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("task_type_definitions")
        .update({ name, key: taskTypeColorKey(name) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleObservation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("task_type_definitions")
        .update({ has_observation_fields: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setColor = useMutation({
    mutationFn: async ({ name, colorClass }: { name: string; colorClass: string }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("task_type_colors")
        .upsert(
          { user_id, task_type: taskTypeColorKey(name), color_class: colorClass },
          { onConflict: "user_id,task_type" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (row: TaskTypeDefinitionRow) => {
      const { error } = await supabase.from("task_type_definitions").delete().eq("id", row.id);
      if (error) throw error;
      await supabase.from("task_type_colors").delete().eq("task_type", row.key);
    },
    onSuccess: invalidate,
  });

  const add = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const user_id = await currentUserId();
      const maxSort = rows.reduce((acc, r) => Math.max(acc, r.sort_order), -1);
      const { error } = await supabase.from("task_type_definitions").insert({
        user_id,
        key: taskTypeColorKey(trimmed),
        name: trimmed,
        has_observation_fields: false,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewName("");
      await invalidate();
    },
  });

  return (
    <SectionCard title="TASK TYPES">
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        PRODUCTION TASK LIST/WORKFLOW TEMPLATE에서 고를 수 있는 TASK TYPE 이름·색상·"관찰값 입력칸
        보이기" 여부입니다 — 전역 설정이라 모든 Component/세션에서 동일하게 적용됩니다. 이름을
        바꿔도 이미 만들어진 TASK는 예전 이름 그대로 남습니다.
      </p>
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row) => (
            <TaskTypeRow
              key={row.id}
              row={row}
              currentColor={colorOverrides[row.key] ?? taskTypeColorClass(row.name)}
              onRename={(name) => rename.mutate({ id: row.id, name })}
              onToggleObservation={(value) => toggleObservation.mutate({ id: row.id, value })}
              onColor={(colorClass) => setColor.mutate({ name: row.name, colorClass })}
              onDelete={() => {
                if (confirm(`"${row.name}" TASK TYPE을 삭제할까요? 이미 만들어진 TASK에는 영향이 없습니다.`))
                  remove.mutate(row);
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className={`${inputClass} md:w-48`}
          placeholder="새 TASK TYPE 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add.mutate();
          }}
        />
        <button type="button" className={primaryButtonClass} disabled={add.isPending} onClick={() => add.mutate()}>
          + ADD
        </button>
      </div>
    </SectionCard>
  );
}

function TaskTypeRow({
  row,
  currentColor,
  onRename,
  onToggleObservation,
  onColor,
  onDelete,
}: {
  row: TaskTypeDefinitionRow;
  currentColor: string;
  onRename: (name: string) => void;
  onToggleObservation: (value: boolean) => void;
  onColor: (colorClass: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  useEffect(() => setName(row.name), [row.name]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        className={inputClass + " min-w-0 md:w-40"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== row.name) onRename(next);
          else setName(row.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <div className="flex flex-wrap gap-1">
        {TASK_TYPE_COLOR_CLASSES.map((cls) => (
          <button
            key={cls}
            type="button"
            title={cls}
            className={`h-5 w-5 rounded-sm border ${cls} ${
              currentColor === cls ? "ring-2 ring-foreground ring-offset-1" : ""
            }`}
            onClick={() => onColor(cls)}
          />
        ))}
      </div>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={row.has_observation_fields}
          onChange={(e) => onToggleObservation(e.target.checked)}
        />
        관찰값 입력칸 보이기
      </label>
      <button type="button" className={buttonClass + " ml-auto"} onClick={onDelete}>
        DELETE
      </button>
    </div>
  );
}
