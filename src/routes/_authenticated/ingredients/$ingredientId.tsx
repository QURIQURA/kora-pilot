import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  categoriesQuery,
  currentUserId,
  ingredientFunctionsQuery,
  ingredientQuery,
} from "@/lib/queries";
import { categoryPath, flattenCategories } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { FunctionPicker } from "@/components/pilot/FunctionPicker";
import {
  Field,
  NextPhaseSection,
  SectionCard,
  buttonClass,
  inputClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/ingredients/$ingredientId")({
  head: () => ({
    meta: [
      { title: "PILOT — Ingredient Detail" },
      { name: "description", content: "Ingredient master data detail" },
      { property: "og:title", content: "PILOT — Ingredient Detail" },
      { property: "og:description", content: "Ingredient master data detail" },
    ],
  }),
  component: IngredientDetailPage,
});

function IngredientDetailPage() {
  const { ingredientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ingredient = useQuery(ingredientQuery(ingredientId));
  const categories = useQuery(categoriesQuery());
  const functions = useQuery(ingredientFunctionsQuery());

  const categoryList = categories.data ?? [];
  const path = categoryPath(categoryList, ingredient.data?.category_id ?? null);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "INGREDIENTS", path: "/ingredients" },
    ...path.map((c) => ({ label: c.name })),
    { label: (ingredient.data?.name ?? "…").toUpperCase() },
  ]);

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"ingredients">) => {
      const { error } = await supabase
        .from("ingredients")
        .update(patch)
        .eq("id", ingredientId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });

  const setFunctions = useMutation({
    mutationFn: async (names: string[]) => {
      const userId = await currentUserId();
      const existing = functions.data ?? [];
      const ids: string[] = [];
      for (const name of names) {
        let fn = existing.find((f) => f.name === name);
        if (!fn) {
          const { data, error } = await supabase
            .from("ingredient_functions")
            .insert({ user_id: userId, name })
            .select("*")
            .single();
          if (error) throw error;
          fn = data;
        }
        ids.push(fn.id);
      }
      const { error: delError } = await supabase
        .from("ingredient_function_links")
        .delete()
        .eq("ingredient_id", ingredientId);
      if (delError) throw delError;
      if (ids.length > 0) {
        const { error } = await supabase.from("ingredient_function_links").insert(
          ids.map((functionId) => ({
            user_id: userId,
            ingredient_id: ingredientId,
            function_id: functionId,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["ingredient_functions"] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", ingredientId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      void navigate({ to: "/ingredients" });
    },
  });

  if (!ingredient.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {ingredient.isLoading ? "LOADING…" : "INGREDIENT NOT FOUND"}
      </p>
    );
  }

  const data = ingredient.data;
  const selected = data.ingredient_function_links
    .map((l) => l.ingredient_functions?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineText
            value={data.name}
            className="text-lg"
            onSave={(name) => update.mutate({ name })}
          />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <CategorySelect
          className={selectClass + " w-auto"}
          value={data.category_id ?? ""}
          onChange={(id) => update.mutate({ category_id: id || null })}
          emptyLabel="NO CATEGORY"
        />
      </div>

      <SectionCard title="FUNCTIONS">
        <FunctionPicker
          options={(functions.data ?? []).map((f) => f.name)}
          selected={selected}
          onChange={(next) => setFunctions.mutate(next)}
        />
      </SectionCard>

      <SectionCard title="SOURCING">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="SUPPLIER">
            <InlineInput
              value={data.supplier ?? ""}
              onSave={(supplier) => update.mutate({ supplier })}
            />
          </Field>
          <Field label="BRAND">
            <InlineInput
              value={data.brand ?? ""}
              onSave={(brand) => update.mutate({ brand })}
            />
          </Field>
          <Field label="DEFAULT UNIT">
            <InlineInput
              value={data.default_unit}
              onSave={(unit) =>
                update.mutate({ default_unit: unit.trim() || "g" })
              }
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="NOTES">
        <TextArea
          value={data.notes ?? ""}
          onSave={(notes) => update.mutate({ notes })}
        />
      </SectionCard>

      <NextPhaseSection title="USED IN FORMULAS" />

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (confirm("DELETE THIS INGREDIENT?")) remove.mutate();
        }}
      >
        DELETE INGREDIENT
      </button>
    </div>
  );
}

function InlineText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-foreground outline-none hover:border-border focus:border-foreground ${className ?? ""}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
    />
  );
}

function InlineInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

function TextArea({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      rows={4}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}
