import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  ingredientFunctionUsageQuery,
  ingredientFunctionsQuery,
} from "@/lib/queries";
import { SYSTEM_FUNCTION_KEYS } from "@/lib/pilot";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
} from "./ui";

/**
 * SETTINGS의 INGREDIENT FUNCTIONS 관리 섹션.
 * 계산에 쓰이는 기능(STRUCTURE/STARCH/WATER/FAT/SWEETENER)은 내부 키를 유지하고
 * 표시 이름만 바뀐다. 삭제 시 더 강하게 경고한다.
 */
export function IngredientFunctionManager() {
  const queryClient = useQueryClient();
  const functions = useQuery(ingredientFunctionsQuery());
  const usage = useQuery(ingredientFunctionUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ingredient_functions"] });
    await queryClient.invalidateQueries({
      queryKey: ["ingredient_function_usage"],
    });
    await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        name_en?: string | null;
        color?: string;
        sort_order?: number;
      };
    }) => {
      const { error } = await supabase
        .from("ingredient_functions")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ id, used }: { id: string; used: number }) => {
      if (used > 0) {
        const { error } = await supabase
          .from("ingredient_function_links")
          .delete()
          .eq("function_id", id);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("ingredient_functions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = functions.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="INGREDIENT FUNCTIONS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD FUNCTION"}
        </button>
      }
    >
      {adding && (
        <div className="mb-4 border border-border p-4">
          <FunctionCreateForm
            nextSortOrder={rows.length + 1}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO FUNCTIONS YET
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((fn) => {
            const used = usageMap[fn.id] ?? 0;
            const isSystem = Boolean(
              fn.key &&
                (SYSTEM_FUNCTION_KEYS as readonly string[]).includes(fn.key)
            );
            return (
              <li
                key={fn.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <input
                  type="color"
                  aria-label={`COLOR ${fn.name}`}
                  className="h-11 w-11 shrink-0 border border-input bg-background p-1"
                  defaultValue={fn.color}
                  key={`color-${fn.id}-${fn.color}`}
                  onBlur={(e) => {
                    const color = e.target.value.toUpperCase();
                    if (color !== fn.color)
                      update.mutate({ id: fn.id, patch: { color } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                  defaultValue={fn.name}
                  key={`name-${fn.id}-${fn.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== fn.name)
                      update.mutate({ id: fn.id, patch: { name } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                  placeholder="ENGLISH NAME"
                  defaultValue={fn.name_en ?? ""}
                  key={`en-${fn.id}-${fn.name_en ?? ""}`}
                  onBlur={(e) => {
                    const name_en = e.target.value.trim() || null;
                    if (name_en !== (fn.name_en ?? null))
                      update.mutate({ id: fn.id, patch: { name_en } });
                  }}
                />
                <input
                  type="number"
                  aria-label={`SORT ORDER ${fn.name}`}
                  className={`${inputClass} w-20 border-transparent text-center hover:border-input`}
                  defaultValue={fn.sort_order}
                  key={`sort-${fn.id}-${fn.sort_order}`}
                  onBlur={(e) => {
                    const sort_order = Number(e.target.value);
                    if (
                      Number.isFinite(sort_order) &&
                      sort_order !== fn.sort_order
                    )
                      update.mutate({ id: fn.id, patch: { sort_order } });
                  }}
                />
                {isSystem && (
                  <span className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background">
                    계산에 사용됨
                  </span>
                )}
                <span className="label-caps text-xs text-muted-foreground">
                  {used > 0 ? `${used} IN USE` : "UNUSED"}
                </span>
                <button
                  type="button"
                  className={`${buttonClass} px-3 text-xs`}
                  onClick={() => {
                    if (isSystem) {
                      if (
                        !confirm(
                          `"${fn.name}"은(는) 기준량 자동 집계에 사용되는 시스템 기능입니다.\n삭제하면 배합 계산이 정확하지 않을 수 있습니다.${
                            used > 0
                              ? `\n재료 ${used}개의 연결도 함께 삭제됩니다.`
                              : ""
                          }\n정말 삭제하시겠습니까?`
                        )
                      )
                        return;
                    } else if (used > 0) {
                      if (
                        !confirm(
                          `재료 ${used}개가 이 기능을 사용 중입니다 — 연결도 함께 삭제됩니다. 삭제하시겠습니까?`
                        )
                      )
                        return;
                    } else if (!confirm(`DELETE "${fn.name}"?`)) {
                      return;
                    }
                    remove.mutate({ id: fn.id, used });
                  }}
                >
                  DELETE
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function FunctionCreateForm({
  nextSortOrder,
  onDone,
}: {
  nextSortOrder: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [color, setColor] = useState("#D4D3CE");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("ingredient_functions").insert({
        user_id,
        name: name.trim(),
        name_en: nameEn.trim() || null,
        color,
        sort_order: nextSortOrder,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["ingredient_functions"],
      });
      onDone();
    },
  });

  return (
    <form
      className="space-y-3"
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
      <Field label="COLOR">
        <input
          type="color"
          aria-label="COLOR"
          className="h-11 w-11 border border-input bg-background p-1"
          value={color}
          onChange={(e) => setColor(e.target.value.toUpperCase())}
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
          disabled={create.isPending || !name.trim()}
        >
          CREATE
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
