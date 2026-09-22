import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * 공용 기준중량 프리셋 생성 폼 — MouldCreateForm과 대응.
 * 몰드가 아닌 제품군(가나슈/필링/크림 등)의 실측 배치 기준중량(g)을 등록한다.
 * SETTINGS의 BASE WEIGHTS 섹션과 기준중량 드롭다운("+ NEW BASE WEIGHT")이 공유한다.
 */
export function BaseWeightCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [weightG, setWeightG] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("base_weight_presets")
        .insert({
          user_id,
          name: name.trim(),
          weight_g: Number(weightG) || 0,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["base_weight_presets"] });
      setName("");
      setWeightG("");
      setNotes("");
      onCreated?.(id);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && weightG.trim()) create.mutate();
      }}
    >
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          required
          placeholder="가나슈 기본배치"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="기준중량 g — 이 배치 1회 분량의 실측 무게">
        <input
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          required
          className={inputClass}
          placeholder="예: 500"
          value={weightG}
          onChange={(e) => setWeightG(e.target.value)}
        />
      </Field>
      <Field label="NOTES (OPTIONAL)">
        <textarea
          rows={2}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {create.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(create.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
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
