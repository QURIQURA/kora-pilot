import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * 향미 계열 즉석 생성 폼 — Settings 관리 섹션과 선택 드롭다운이 공유한다.
 */
export function FlavourFamilyCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [color, setColor] = useState("#D4D3CE");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("flavour_families")
        .insert({
          user_id,
          name: name.trim(),
          name_en: nameEn.trim() || null,
          color,
          sort_order: 999,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["flavour_families"] });
      onCreated(data.id);
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Field label="NAME (한글)">
        <input
          className={inputClass}
          autoFocus
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="시트러스"
        />
      </Field>
      <Field label="NAME (ENGLISH)">
        <input
          className={inputClass}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          placeholder="Citrus"
        />
      </Field>
      <Field label="COLOR">
        <input
          type="color"
          aria-label="COLOR"
          className="h-11 w-11 border border-input bg-background p-1"
          value={color}
          onChange={(e) => setColor(e.target.value.toUpperCase())}
        />
      </Field>
      {create.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(create.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={create.isPending || !name.trim()}
        >
          CREATE
        </button>
        {onCancel && (
          <button type="button" className={buttonClass} onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>
    </form>
  );
}
