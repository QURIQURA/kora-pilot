import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  ingredientGroupUsageQuery,
  ingredientGroupsQuery,
  ingredientsQuery,
} from "@/lib/queries";
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

/**
 * SETTINGS의 INGREDIENT GROUPS 관리 섹션(2026-10-15 사용자 요청: "가루는 가루끼리 액체는
 * 액체끼리 뜨도록... technique category에서 기능을 업그레이드해서 공정별 재료구분해서
 * 묶어두고"). FORMULA에 재료를 추가/삭제할 때마다 이 그룹의 sort_order 순서 기준으로
 * `formula_version_ingredients.sort_order`가 자동 재정렬되고, WORK SESSION 계량 화면은
 * 그 순서를 그대로 물려받는다(lib/ingredient-group.ts). 여기서는 그룹 자체의
 * 생성/이름/색/순서/삭제만 다루고, 재료별 그룹 배정은 아래 IngredientGroupBulkAssign에서 한다.
 */
export function IngredientGroupManager() {
  const queryClient = useQueryClient();
  const groups = useQuery(ingredientGroupsQuery());
  const usage = useQuery(ingredientGroupUsageQuery());
  const [adding, setAdding] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ingredient_groups"] });
    await queryClient.invalidateQueries({ queryKey: ["ingredient_group_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
  };

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; name_en?: string | null; color?: string; sort_order?: number };
    }) => {
      const { error } = await supabase.from("ingredient_groups").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ id, used }: { id: string; used: number }) => {
      if (used > 0) {
        const { error } = await supabase
          .from("ingredients")
          .update({ group_id: null })
          .eq("group_id", id);
        if (error) throw error;
      }
      const { error } = await supabase.from("ingredient_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = groups.data ?? [];
  const usageMap = usage.data ?? {};

  return (
    <SectionCard
      title="INGREDIENT GROUPS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "CLOSE" : "+ ADD GROUP"}
        </button>
      }
    >
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        공정상 성질(가루류/액체류 등)로 재료를 묶어두는 기준입니다. 여기 순서대로 FORMULA에 재료를
        추가/삭제할 때마다 자동으로 재정렬되고, WORK SESSION도 같은 순서로 보여집니다. 재료별로 어느
        그룹에 속하는지는 아래 "재료별 그룹 배정"에서 한 번에 검토/수정하세요.
      </p>
      {adding && (
        <div className="mb-4 border border-border p-4">
          <GroupCreateForm nextSortOrder={rows.length + 1} onDone={() => setAdding(false)} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">NO GROUPS YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((g) => {
            const used = usageMap[g.id] ?? 0;
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input
                  type="color"
                  aria-label={`COLOR ${g.name}`}
                  className="h-11 w-11 shrink-0 border border-input bg-background p-1"
                  defaultValue={g.color}
                  key={`color-${g.id}-${g.color}`}
                  onBlur={(e) => {
                    const color = e.target.value.toUpperCase();
                    if (color !== g.color) update.mutate({ id: g.id, patch: { color } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent hover:border-input`}
                  placeholder="ENGLISH — PRIMARY"
                  aria-label={`ENGLISH NAME ${g.name}`}
                  defaultValue={g.name_en ?? ""}
                  key={`en-${g.id}-${g.name_en ?? ""}`}
                  onBlur={(e) => {
                    const name_en = e.target.value.trim() || null;
                    if (name_en !== (g.name_en ?? null))
                      update.mutate({ id: g.id, patch: { name_en } });
                  }}
                />
                <input
                  className={`${inputClass} min-w-[8rem] flex-1 border-transparent text-muted-foreground hover:border-input`}
                  placeholder="한글 — FALLBACK"
                  aria-label={`한글명 ${g.name_en ?? g.name}`}
                  defaultValue={g.name}
                  key={`name-${g.id}-${g.name}`}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== g.name) update.mutate({ id: g.id, patch: { name } });
                  }}
                />
                <input
                  type="number"
                  aria-label={`SORT ORDER ${g.name}`}
                  className={`${inputClass} !w-20 border-transparent text-center hover:border-input`}
                  defaultValue={g.sort_order}
                  key={`sort-${g.id}-${g.sort_order}`}
                  onBlur={(e) => {
                    const sort_order = Number(e.target.value);
                    if (Number.isFinite(sort_order) && sort_order !== g.sort_order)
                      update.mutate({ id: g.id, patch: { sort_order } });
                  }}
                />
                <span className="label-caps text-xs text-muted-foreground">
                  {used > 0 ? `${used} IN USE` : "UNUSED"}
                </span>
                <button
                  type="button"
                  className={`${buttonClass} px-3 text-xs`}
                  onClick={() => {
                    if (used > 0) {
                      if (
                        !confirm(
                          `재료 ${used}개가 이 그룹을 사용 중입니다 — 배정이 해제(미분류)됩니다. 삭제하시겠습니까?`,
                        )
                      )
                        return;
                    } else if (!confirm(`DELETE "${g.name}"?`)) {
                      return;
                    }
                    remove.mutate({ id: g.id, used });
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

function GroupCreateForm({ nextSortOrder, onDone }: { nextSortOrder: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [color, setColor] = useState("#D4D3CE");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("ingredient_groups").insert({
        user_id,
        name: name.trim(),
        name_en: nameEn.trim() || null,
        color,
        sort_order: nextSortOrder,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredient_groups"] });
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
      <Field label="NAME (ENGLISH) — PRIMARY DISPLAY">
        <input
          className={inputClass}
          autoFocus
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </Field>
      <Field label="NAME (한글) — FALLBACK · REQUIRED">
        <input
          className={inputClass}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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

/**
 * 재료별 그룹 배정을 한 번에 검토/수정하는 표(2026-10-15 사용자 요청: "AI가 이름 기준으로
 * 추천 배정 후, 한번에 검토/수정"). 123개 재료를 개별 상세 페이지로 들어가지 않고 이 표에서
 * 인라인 드롭다운으로 바로 고칠 수 있다. 검색/미분류만 보기로 좁혀서 점검할 수 있다.
 */
export function IngredientGroupBulkAssign() {
  const queryClient = useQueryClient();
  const groups = useQuery(ingredientGroupsQuery());
  const ingredients = useQuery(ingredientsQuery());
  const [search, setSearch] = useState("");
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);

  const setGroup = useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const { error } = await supabase
        .from("ingredients")
        .update({ group_id: groupId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["ingredient_group_usage"] });
    },
  });

  const groupRows = groups.data ?? [];
  const allIngredients = useMemo(() => ingredients.data ?? [], [ingredients.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allIngredients
      .filter((i) => !onlyUnclassified || !i.group_id)
      .filter(
        (i) =>
          !q || i.name.toLowerCase().includes(q) || (i.name_en ?? "").toLowerCase().includes(q),
      );
  }, [allIngredients, search, onlyUnclassified]);

  const unclassifiedCount = allIngredients.filter((i) => !i.group_id).length;

  return (
    <SectionCard
      title="재료별 그룹 배정"
      subtitle={
        <span>
          전체 {allIngredients.length}개 중 미분류 {unclassifiedCount}개
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          placeholder="재료 이름 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="label-caps flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyUnclassified}
            onChange={(e) => setOnlyUnclassified(e.target.checked)}
          />
          미분류만 보기
        </label>
      </div>
      {groupRows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          먼저 위에서 그룹을 만들어주세요.
        </p>
      ) : filtered.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          해당하는 재료가 없습니다
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto border border-border">
          <ul className="divide-y divide-border">
            {filtered.map((ing) => (
              <li key={ing.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-[10rem] flex-1 font-body text-sm">
                  {ing.name_en || ing.name}
                  {ing.name_en && ing.name_en !== ing.name && (
                    <span className="ml-1.5 text-xs text-muted-foreground">({ing.name})</span>
                  )}
                </span>
                <select
                  className={`${selectClass} !w-44`}
                  value={ing.group_id ?? ""}
                  onChange={(e) => setGroup.mutate({ id: ing.id, groupId: e.target.value || null })}
                >
                  <option value="">— 미분류 —</option>
                  {groupRows.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_en || g.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
