import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, tagUsageQuery, tagsQuery } from "@/lib/queries";
import type { Tag } from "@/lib/pilot";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
} from "./ui";
import { DEFAULT_CATEGORY_COLOR } from "./CategoryCreateForm";

export function TagManager() {
  const queryClient = useQueryClient();
  const tags = useQuery(tagsQuery());
  const usage = useQuery(tagUsageQuery());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const usageMap = usage.data ?? {};

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
      queryClient.invalidateQueries({ queryKey: ["tag_usage"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
    ]);
  };

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("tags")
        .insert({ user_id, name: name.trim(), color });
      if (error) throw error;
    },
    onSuccess: async () => {
      setName("");
      setColor(DEFAULT_CATEGORY_COLOR);
      setAdding(false);
      await refresh();
    },
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("tags").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: linkError } = await supabase
        .from("product_tags")
        .delete()
        .eq("tag_id", id);
      if (linkError) throw linkError;
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
    },
  });

  return (
    <SectionCard
      title="TAGS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-muted-foreground hover:text-foreground"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD TAG"}
        </button>
      }
    >
      <div className="space-y-4">
        {adding && (
          <form
            className="space-y-4 border border-dashed border-border p-4"
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
            <div className="flex gap-2">
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={create.isPending}
              >
                CREATE
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setAdding(false)}
              >
                CANCEL
              </button>
            </div>
          </form>
        )}

        {(tags.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO TAGS YET
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(tags.data ?? []).map((tag) => (
              <li key={tag.id}>
                <TagRow
                  tag={tag}
                  count={usageMap[tag.id] ?? 0}
                  onRename={(next) => update.mutate({ id: tag.id, name: next })}
                  onColor={(next) => update.mutate({ id: tag.id, color: next })}
                  onDelete={() => {
                    if ((usageMap[tag.id] ?? 0) > 0) setPendingDelete(tag);
                    else remove.mutate(tag.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">DELETE {pendingDelete.name}</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setPendingDelete(null)}
              >
                CLOSE
              </button>
            </div>
            <div className="space-y-4 p-4">
              <p className="font-mono text-xs uppercase text-foreground">
                {usageMap[pendingDelete.id] ?? 0}개 항목이 사용 중
              </p>
              <p className="font-mono text-xs uppercase text-muted-foreground">
                삭제하면 해당 제품에서 이 태그가 제거됩니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(pendingDelete.id)}
                >
                  REMOVE &amp; DELETE
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setPendingDelete(null)}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function TagRow({
  tag,
  count,
  onRename,
  onColor,
  onDelete,
}: {
  tag: Tag;
  count: number;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tag.name);
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span
        aria-hidden
        className="inline-block h-4 w-4 border border-border"
        style={{ backgroundColor: tag.color }}
      />
      <input
        className={inputClass + " min-w-0 flex-1"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== tag.name) onRename(next);
          else setName(tag.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <input
        type="color"
        aria-label={`${tag.name} COLOR`}
        className="h-11 w-11 border border-input bg-background p-1"
        value={tag.color}
        onChange={(e) => onColor(e.target.value.toUpperCase())}
      />
      <span className="label-caps text-[11px] text-muted-foreground">
        {count} USED
      </span>
      <button type="button" className={buttonClass} onClick={onDelete}>
        DELETE
      </button>
    </div>
  );
}
