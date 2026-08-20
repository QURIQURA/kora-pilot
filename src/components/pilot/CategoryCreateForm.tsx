import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { categoriesQuery, currentUserId } from "@/lib/queries";
import { flattenCategories } from "@/lib/pilot";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "./ui";

export const DEFAULT_CATEGORY_COLOR = "#D4D3CE";

/**
 * 공용 카테고리 생성 폼.
 * SETTINGS의 CATEGORIES 섹션과 각 화면의 카테고리 드롭다운이 공유한다.
 */
export function CategoryCreateForm({
  defaultParentId = "",
  onCreated,
  onCancel,
}: {
  defaultParentId?: string;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery());
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(defaultParentId);
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("categories")
        .insert({
          user_id,
          name: name.trim(),
          parent_id: parentId || null,
          color,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
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
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="PARENT CATEGORY (OPTIONAL)">
        <select
          className={selectClass}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">NO PARENT</option>
          {flattenCategories(categories.data ?? []).map(
            ({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {`${"— ".repeat(depth)}${category.name}`}
              </option>
            )
          )}
        </select>
      </Field>
      <Field label="COLOR">
        <div className="flex items-center gap-2">
          <input
            type="color"
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
