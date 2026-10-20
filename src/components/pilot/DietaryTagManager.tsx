import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dietaryTagsQuery, orderDietaryTagLinksQuery, currentUserId } from "@/lib/queries";
import { SectionCard, buttonClass, inputClass } from "./ui";

export const DEFAULT_DIETARY_TAGS = [
  "Lactose free",
  "Gluten free",
  "Egg free",
  "Nut free",
  "Vegan",
  "Halal friendly",
];

/**
 * SETTINGS > ORDERS > DIETARY TAGS — 주문의 DIETARY REQUIREMENTS에서 복수 선택하는 전역 식이 분류.
 * 이름 변경은 모든 주문에 반영되고, 삭제하면 주문에서 연결만 사라진다(주문 자체는 그대로).
 */
export function DietaryTagManager() {
  const queryClient = useQueryClient();
  const tags = useQuery(dietaryTagsQuery());
  const links = useQuery(orderDietaryTagLinksQuery());

  const usage: Record<string, number> = {};
  for (const l of links.data ?? []) usage[l.dietary_tag_id] = (usage[l.dietary_tag_id] ?? 0) + 1;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["dietary_tags"] });
    await queryClient.invalidateQueries({ queryKey: ["order_dietary_tags"] });
  };

  const create = useMutation({
    mutationFn: async (names: string[]) => {
      const user_id = await currentUserId();
      const existing = new Set((tags.data ?? []).map((t) => t.name.toLowerCase()));
      const fresh = names.filter((n) => n.trim() && !existing.has(n.trim().toLowerCase()));
      if (fresh.length === 0) return;
      const base = tags.data?.length ?? 0;
      const { error } = await supabase.from("dietary_tags").insert(
        fresh.map((name, i) => ({ name: name.trim(), user_id, sort_order: base + i + 1 })),
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("dietary_tags")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(tags.data ?? [])];
      const target = index + dir;
      const a = list[index];
      const b = list[target];
      if (!a || !b) return;
      list[index] = b;
      list[target] = a;
      const results = await Promise.all(
        list.map((r, i) =>
          r.sort_order === i
            ? Promise.resolve({ error: null })
            : supabase.from("dietary_tags").update({ sort_order: i }).eq("id", r.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dietary_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = tags.data ?? [];

  return (
    <SectionCard title="DIETARY TAGS">
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        Dietary categories you can pick (several at once) in an order&apos;s DIETARY REQUIREMENTS.
        Renaming applies to every order; deleting only removes the tag from orders.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={create.isPending}
          onClick={() => create.mutate(["New tag"])}
        >
          + ADD TAG
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={create.isPending}
          onClick={() => create.mutate(DEFAULT_DIETARY_TAGS)}
        >
          ADD DEFAULT TAGS
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">NO TAGS YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  className="label-caps text-[10px] leading-none disabled:opacity-30"
                  disabled={i === 0 || move.isPending}
                  onClick={() => move.mutate({ index: i, dir: -1 })}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  className="label-caps text-[10px] leading-none disabled:opacity-30"
                  disabled={i === rows.length - 1 || move.isPending}
                  onClick={() => move.mutate({ index: i, dir: 1 })}
                >
                  ▼
                </button>
              </div>
              <input
                className={`${inputClass} flex-1 border-transparent hover:border-input`}
                defaultValue={t.name}
                key={t.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) rename.mutate({ id: t.id, name: v });
                  else e.target.value = t.name;
                }}
              />
              <span className="label-caps text-[10px] text-muted-foreground">
                {usage[t.id] ?? 0} ORDERS
              </span>
              <button
                type="button"
                className={buttonClass}
                disabled={remove.isPending}
                onClick={() => {
                  const n = usage[t.id] ?? 0;
                  if (n === 0 || window.confirm(`Remove "${t.name}" from ${n} order(s)?`))
                    remove.mutate(t.id);
                }}
              >
                DELETE
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
