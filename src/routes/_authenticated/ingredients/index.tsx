import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import {
  categoriesQuery,
  currentUserId,
  flavourFamiliesQuery,
  ingredientFunctionsQuery,
  ingredientsQuery,
  type IngredientRow,
} from "@/lib/queries";
import { categoryPathLabel, hasComposition } from "@/lib/pilot";
import { EmptyState } from "@/components/EmptyState";
import { FunctionPicker } from "@/components/pilot/FunctionPicker";
import { cn } from "@/lib/utils";
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

function rateLabel(row: IngredientRow): string {
  const min = row.typical_rate_min;
  const max = row.typical_rate_max;
  if (min != null && max != null) return `${min}–${max}%`;
  if (min != null) return `≥${min}%`;
  if (max != null) return `≤${max}%`;
  return "—";
}

function IngredientsPage() {
  const ingredients = useQuery(ingredientsQuery());
  const categories = useQuery(categoriesQuery());
  const families = useQuery(flavourFamiliesQuery());
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const [familyFilter, setFamilyFilter] = useState("");
  const [onlyFunctional, setOnlyFunctional] = useState(false);
  const [onlyNoComposition, setOnlyNoComposition] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"" | "standard" | "verified">(
    ""
  );
  const [onlyNoEnglish, setOnlyNoEnglish] = useState(false);

  const term = search.trim().toLowerCase();
  const rows = (ingredients.data ?? []).filter((ingredient) => {
    if (onlyFunctional && !ingredient.is_functional) return false;
    if (onlyNoComposition && hasComposition(ingredient)) return false;
    if (sourceFilter && ingredient.composition_source !== sourceFilter)
      return false;
    if (onlyNoEnglish && ingredient.name_en?.trim()) return false;
    if (familyFilter && ingredient.flavour_family_id !== familyFilter)
      return false;
    if (!term) return true;
    const functions = ingredient.ingredient_function_links
      .map((l) => l.ingredient_functions?.name ?? "")
      .join(" ")
      .toLowerCase();
    return (
      ingredient.name.toLowerCase().includes(term) ||
      (ingredient.name_en ?? "").toLowerCase().includes(term) ||
      functions.includes(term)
    );
  });

  const toggleFilters: {
    label: string;
    active: boolean;
    onToggle: () => void;
  }[] = [
    {
      label: "기능성 재료만",
      active: onlyFunctional,
      onToggle: () => setOnlyFunctional((v) => !v),
    },
    {
      label: "조성 미입력만",
      active: onlyNoComposition,
      onToggle: () => setOnlyNoComposition((v) => !v),
    },
    {
      label: "표준값만",
      active: sourceFilter === "standard",
      onToggle: () =>
        setSourceFilter((v) => (v === "standard" ? "" : "standard")),
    },
    {
      label: "확인됨만",
      active: sourceFilter === "verified",
      onToggle: () =>
        setSourceFilter((v) => (v === "verified" ? "" : "verified")),
    },
    {
      label: "영문명 미입력만",
      active: onlyNoEnglish,
      onToggle: () => setOnlyNoEnglish((v) => !v),
    },
  ];

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

      <div className="space-y-3 border border-border bg-card p-4">
        <Field label="SEARCH (한글 · ENGLISH · FUNCTION)">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          {toggleFilters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={filter.onToggle}
              className={cn(
                "label-caps min-h-[44px] border px-3 py-2 text-[11px]",
                filter.active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {filter.label}
            </button>
          ))}
          <select
            className={`${selectClass} w-auto min-w-[10rem]`}
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            aria-label="계열 필터"
          >
            <option value="">모든 계열</option>
            {(families.data ?? []).map((family) => (
              <option key={family.id} value={family.id}>
                {family.name_en
                  ? `${family.name} (${family.name_en})`
                  : family.name}
              </option>
            ))}
          </select>
        </div>
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
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              FUNCTIONS
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              기능성
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              BASIS
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              사용률
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              조성
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              계열
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
                  <span className="col-span-3 text-sm">
                    <span className="block md:inline">{ingredient.name}</span>{" "}
                    {ingredient.name_en ? (
                      <span className="block font-mono text-xs text-muted-foreground md:inline md:text-sm">
                        ({ingredient.name_en})
                      </span>
                    ) : (
                      <span className="block font-mono text-[10px] uppercase text-muted-foreground md:inline">
                        영문명 없음
                      </span>
                    )}
                  </span>
                  <span className="col-span-2 font-mono text-xs uppercase text-muted-foreground">
                    {categoryPathLabel(
                      categories.data ?? [],
                      ingredient.category_id
                    )}
                  </span>
                  <span className="col-span-2 flex flex-wrap gap-1">
                    {ingredient.ingredient_function_links.map((link) => (
                      <span
                        key={link.function_id}
                        className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background"
                      >
                        {link.ingredient_functions?.name}
                      </span>
                    ))}
                  </span>
                  <span className="col-span-1">
                    {ingredient.is_functional ? (
                      <span className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background">
                        기능성
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        —
                      </span>
                    )}
                  </span>
                  <span className="col-span-1 font-mono text-xs uppercase text-muted-foreground">
                    {ingredient.reference_basis ?? "—"}
                  </span>
                  <span className="col-span-1 font-mono text-xs tabular-nums text-muted-foreground">
                    {rateLabel(ingredient)}
                  </span>
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {hasComposition(ingredient)
                      ? ingredient.composition_source === "verified"
                        ? "확인됨"
                        : "표준값"
                      : "미입력"}
                  </span>
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {ingredient.flavour_families ? (
                      <span className="flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 shrink-0 border border-border"
                          style={{
                            backgroundColor: ingredient.flavour_families.color,
                          }}
                        />
                        {ingredient.flavour_families.name}
                      </span>
                    ) : (
                      "—"
                    )}
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
  const [nameEn, setNameEn] = useState("");
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
          name_en: nameEn.trim() || null,
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
          <Field label="NAME (한글)">
            <input
              className={inputClass}
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="NAME (ENGLISH)">
            <input
              className={inputClass}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
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
