import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  categoriesQuery,
  categoryUsageQuery,
  type CategoryUsage,
} from "@/lib/queries";
import { flattenCategories, type Category } from "@/lib/pilot";
import {
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "./ui";
import { CategoryCreateForm } from "./CategoryCreateForm";

export function CategoryManager() {
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery());
  const usage = useQuery(categoryUsageQuery());
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const list = categories.data ?? [];
  const usageMap = usage.data ?? {};

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["category_usage"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["components"] }),
      queryClient.invalidateQueries({ queryKey: ["ingredients"] }),
    ]);
  };

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      color?: string;
    }) => {
      const { id, ...patch } = input;
      const { error } = await supabase
        .from("categories")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async ({
      id,
      moveTo,
    }: {
      id: string;
      moveTo: string | null;
    }) => {
      for (const table of ["products", "components", "ingredients"] as const) {
        const { error } = await supabase
          .from(table)
          .update({ category_id: moveTo })
          .eq("category_id", id);
        if (error) throw error;
      }
      const { error: childError } = await supabase
        .from("categories")
        .update({ parent_id: moveTo })
        .eq("parent_id", id);
      if (childError) throw childError;
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
    },
  });

  return (
    <SectionCard
      title="CATEGORIES"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-muted-foreground hover:text-foreground"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD CATEGORY"}
        </button>
      }
    >
      <div className="space-y-4">
        {adding && (
          <div className="border border-dashed border-border p-4">
            <CategoryCreateForm
              onCancel={() => setAdding(false)}
              onCreated={() => setAdding(false)}
            />
          </div>
        )}

        {list.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO CATEGORIES YET
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {flattenCategories(list).map(({ category, depth }) => (
              <li key={category.id}>
                <CategoryRow
                  category={category}
                  depth={depth}
                  usage={usageMap[category.id]}
                  onRename={(name) => update.mutate({ id: category.id, name })}
                  onColor={(color) => update.mutate({ id: category.id, color })}
                  onDelete={() => {
                    const count = usageMap[category.id]?.total ?? 0;
                    if (count > 0) {
                      setPendingDelete(category);
                    } else {
                      remove.mutate({ id: category.id, moveTo: null });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {remove.isError && (
          <p className="font-mono text-xs uppercase text-destructive">
            {(remove.error as Error).message}
          </p>
        )}
      </div>

      {pendingDelete && (
        <DeleteCategoryDialog
          category={pendingDelete}
          usage={usageMap[pendingDelete.id]}
          categories={list}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={(moveTo) =>
            remove.mutate({ id: pendingDelete.id, moveTo })
          }
        />
      )}
    </SectionCard>
  );
}

function CategoryRow({
  category,
  depth,
  usage,
  onRename,
  onColor,
  onDelete,
}: {
  category: Category;
  depth: number;
  usage?: CategoryUsage;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2"
      style={{ paddingLeft: `${12 + depth * 20}px` }}
    >
      <span
        aria-hidden
        className="inline-block h-4 w-4 border border-border"
        style={{ backgroundColor: category.color }}
      />
      <input
        className={inputClass + " min-w-0 flex-1"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== category.name) onRename(next);
          else setName(category.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <input
        type="color"
        aria-label={`${category.name} COLOR`}
        className="h-11 w-11 border border-input bg-background p-1"
        value={category.color}
        onChange={(e) => onColor(e.target.value.toUpperCase())}
      />
      <span className="label-caps text-[11px] text-muted-foreground">
        {usage?.total ?? 0} USED
      </span>
      <button type="button" className={buttonClass} onClick={onDelete}>
        DELETE
      </button>
    </div>
  );
}

function DeleteCategoryDialog({
  category,
  usage,
  categories,
  pending,
  onCancel,
  onConfirm,
}: {
  category: Category;
  usage?: CategoryUsage;
  categories: Category[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (moveTo: string | null) => void;
}) {
  const [moveTo, setMoveTo] = useState("");
  const options = flattenCategories(categories).filter(
    ({ category: c }) => c.id !== category.id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">DELETE {category.name}</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="font-mono text-xs uppercase text-foreground">
            {usage?.total ?? 0}개 항목이 사용 중
          </p>
          <ul className="font-mono text-xs uppercase text-muted-foreground">
            <li>PRODUCTS {usage?.products ?? 0}</li>
            <li>COMPONENTS {usage?.components ?? 0}</li>
            <li>INGREDIENTS {usage?.ingredients ?? 0}</li>
            <li>SUB CATEGORIES {usage?.children ?? 0}</li>
          </ul>
          <label className="block space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              MOVE TO
            </span>
            <select
              className={selectClass}
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              <option value="">NO CATEGORY</option>
              {options.map(({ category: c, depth }) => (
                <option key={c.id} value={c.id}>
                  {`${"— ".repeat(depth)}${c.name}`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={pending}
              onClick={() => onConfirm(moveTo || null)}
            >
              MOVE &amp; DELETE
            </button>
            <button type="button" className={buttonClass} onClick={onCancel}>
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
