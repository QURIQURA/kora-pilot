import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, ingredientsQuery } from "@/lib/queries";
import { UNITS } from "@/lib/formula";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "./ui";

/**
 * 재료 master 검색 선택. 없으면 그 자리에서 생성한다.
 */
export function IngredientPicker({
  onPick,
  onCancel,
}: {
  onPick: (ingredientId: string, defaultUnit: string) => void;
  onCancel?: () => void;
}) {
  const ingredients = useQuery(ingredientsQuery());
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("g");

  const term = search.trim().toLowerCase();
  const rows = (ingredients.data ?? []).filter((row) =>
    term ? row.name.toLowerCase().includes(term) : true
  );
  const exact = rows.some((row) => row.name.toLowerCase() === term);

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("ingredients")
        .insert({ user_id, name: search.trim(), default_unit: unit })
        .select("id, default_unit")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      onPick(data.id, data.default_unit);
    },
  });

  return (
    <div className="space-y-3">
      <Field label="SEARCH INGREDIENT">
        <input
          className={inputClass}
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="FLOUR…"
        />
      </Field>

      <ul className="max-h-60 divide-y divide-border overflow-auto border border-border">
        {rows.length === 0 && (
          <li className="px-3 py-3 font-mono text-xs uppercase text-muted-foreground">
            NO MATCH
          </li>
        )}
        {rows.slice(0, 50).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="flex min-h-[48px] w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-secondary"
              onClick={() => onPick(row.id, row.default_unit)}
            >
              <span className="text-sm">{row.name}</span>
              <span className="label-caps text-xs text-muted-foreground">
                {row.default_unit}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {term && !exact && (
        <div className="space-y-2 border border-dashed border-border p-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NOT IN MASTER — CREATE IT
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <span className="text-sm">{search.trim()}</span>
            <select
              className={`${selectClass} w-24`}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              + CREATE & ADD
            </button>
          </div>
        </div>
      )}

      {onCancel && (
        <button type="button" className={buttonClass} onClick={onCancel}>
          CANCEL
        </button>
      )}
    </div>
  );
}
