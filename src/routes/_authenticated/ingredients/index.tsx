import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import {
  categoriesQuery,
  currentUserId,
  ingredientFunctionsQuery,
  ingredientsQuery,
} from "@/lib/queries";
import { categoryPathLabel } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { FunctionPicker } from "@/components/pilot/FunctionPicker";
import {
  Field,
  PageHeader,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/ingredients/")({
  head: () => ({
    meta: [
      { title: "PILOT — Ingredients" },
      { name: "description", content: "Ingredient master data" },
      { property: "og:title", content: "PILOT — Ingredients" },
      { property: "og:description", content: "Ingredient master data" },
    ],
  }),
  component: IngredientsPage,
});

function IngredientsPage() {
  const ingredients = useQuery(ingredientsQuery());
  const categories = useQuery(categoriesQuery());
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const term = search.trim().toLowerCase();
  const rows = (ingredients.data ?? []).filter((ingredient) => {
    if (!term) return true;
    const functions = ingredient.ingredient_function_links
      .map((l) => l.ingredient_functions?.name ?? "")
      .join(" ")
      .toLowerCase();
    return (
      ingredient.name.toLowerCase().includes(term) || functions.includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="INGREDIENTS"
        action={
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setCreating(true)}
          >
            + ADD INGREDIENT
          </button>
        }
      />

      <div className="border border-border bg-card p-4">
        <Field label="SEARCH (NAME OR FUNCTION)">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message={
            (ingredients.data ?? []).length === 0
              ? "NO INGREDIENTS YET"
              : "NO INGREDIENTS MATCH THIS SEARCH"
          }
          actionLabel="+ ADD INGREDIENT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="border border-border bg-card">
          <div className="hidden grid-cols-12 gap-2 border-b border-border px-4 py-2 md:grid">
            <span className="label-caps col-span-3 text-xs text-muted-foreground">
              NAME
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              CATEGORY
            </span>
            <span className="label-caps col-span-3 text-xs text-muted-foreground">
              FUNCTIONS
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              SUPPLIER / BRAND
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              UNIT
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              UPDATED
            </span>
          </div>
          <ul>
            {rows.map((ingredient) => (
              <li
                key={ingredient.id}
                className="border-b border-border last:border-b-0"
              >
                <Link
                  to="/ingredients/$ingredientId"
                  params={{ ingredientId: ingredient.id }}
                  className="grid grid-cols-1 gap-1 px-4 py-3 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2"
                >
                  <span className="col-span-3 text-sm">{ingredient.name}</span>
                  <span className="col-span-2 font-mono text-xs uppercase text-muted-foreground">
                    {categoryPathLabel(
                      categories.data ?? [],
                      ingredient.category_id
                    )}
                  </span>
                  <span className="col-span-3 flex flex-wrap gap-1">
                    {ingredient.ingredient_function_links.map((link) => (
                      <span
                        key={link.function_id}
                        className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background"
                      >
                        {link.ingredient_functions?.name}
                      </span>
                    ))}
                  </span>
                  <span className="col-span-2 font-mono text-xs uppercase text-muted-foreground">
                    {[ingredient.supplier, ingredient.brand]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </span>
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {ingredient.default_unit}
                  </span>
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {formatDateTime(ingredient.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && <CreateIngredientDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateIngredientDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery());
  const functions = useQuery(ingredientFunctionsQuery());

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("g");
  const [categoryId, setCategoryId] = useState("");
  const [functionNames, setFunctionNames] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("ingredients")
        .insert({
          user_id: userId,
          name: name.trim(),
          default_unit: unit.trim() || "g",
          category_id: categoryId || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const existing = functions.data ?? [];
      for (const fnName of functionNames) {
        let fn = existing.find((f) => f.name === fnName);
        if (!fn) {
          const { data: created, error: fnError } = await supabase
            .from("ingredient_functions")
            .insert({ user_id: userId, name: fnName })
            .select("*")
            .single();
          if (fnError) throw fnError;
          fn = created;
        }
        const { error: linkError } = await supabase
          .from("ingredient_function_links")
          .insert({
            user_id: userId,
            ingredient_id: data.id,
            function_id: fn.id,
          });
        if (linkError && linkError.code !== "23505") throw linkError;
      }
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["ingredient_functions"] });
      onClose();
      void navigate({
        to: "/ingredients/$ingredientId",
        params: { ingredientId: id },
      });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW INGREDIENT</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
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
          <Field label="DEFAULT UNIT">
            <input
              className={inputClass}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
          <Field label="CATEGORY">
            <CategorySelect
              className={selectClass}
              value={categoryId}
              onChange={setCategoryId}
              emptyLabel="—"
            />
          </Field>
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              FUNCTIONS
            </span>
            <FunctionPicker
              options={(functions.data ?? []).map((f) => f.name)}
              selected={functionNames}
              onChange={setFunctionNames}
            />
          </div>
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
            <button type="button" className={buttonClass} onClick={onClose}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
