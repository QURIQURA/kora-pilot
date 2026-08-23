import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { DEFAULT_CATEGORY_COLOR } from "./CategoryCreateForm";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * 공용 프로세스 카테고리 생성 폼.
 * SETTINGS의 PROCESS CATEGORIES 섹션과 ProcessCategorySelect("+ NEW …")가 공유한다.
 */
export function ProcessCategoryCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("process_categories")
        .insert({ user_id, name: name.trim().toUpperCase(), color })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["process_categories"] });
      setName("");
      setColor(DEFAULT_CATEGORY_COLOR);
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
          placeholder="BAKING"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="COLOR">
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="COLOR PICKER"
            className="h-11 w-11 border border-input bg-background p-1"
            value={color}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
          />
          <input
            className={inputClass}
            value={color}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
          />
        </div>
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
