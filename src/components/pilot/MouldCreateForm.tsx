import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * 공용 몰드 생성 폼.
 * SETTINGS의 MOULDS 섹션과 몰드 드롭다운("+ NEW MOULD")이 공유한다.
 */
export function MouldCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shapeSize, setShapeSize] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("moulds")
        .insert({
          user_id,
          name: name.trim(),
          shape_size: shapeSize.trim() || null,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["moulds"] });
      setName("");
      setShapeSize("");
      setNotes("");
      onCreated?.(id);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          required
          placeholder="시폰틀 15cm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="SHAPE / SIZE (OPTIONAL)">
        <input
          className={inputClass}
          placeholder="ROUND · Ø15 × H8"
          value={shapeSize}
          onChange={(e) => setShapeSize(e.target.value)}
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
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={create.isPending}
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
