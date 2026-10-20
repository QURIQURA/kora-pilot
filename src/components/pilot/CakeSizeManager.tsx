import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cakeSizesQuery, currentUserId, type CakeSize } from "@/lib/queries";
import { cmToMm, mmToCm } from "@/lib/product-size";
import { MouldSelect } from "./MouldSelect";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

const SHAPES = ["ROUND", "SQUARE", "RECTANGLE", "OTHER"] as const;

/**
 * SETTINGS > ORDERS > CAKE SIZES — 주문의 CAKE SIZE로 고를 전역 사이즈 목록.
 * 치수는 cm로 입력/표시하고 저장 시 mm로 변환(DB canonical unit = mm). 시트 몰드를 지정해두면
 * 주문에서 이 사이즈를 고를 때 WORK SESSION 배수 계산에 그 몰드가 쓰인다.
 */
export function CakeSizeManager() {
  const queryClient = useQueryClient();
  const sizes = useQuery(cakeSizesQuery());
  const usage = useQuery({
    queryKey: ["cake_size_usage"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("cake_size_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) if (r.cake_size_id) map[r.cake_size_id] = (map[r.cake_size_id] ?? 0) + 1;
      return map;
    },
  });
  const [newName, setNewName] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cake_sizes"] });
    await queryClient.invalidateQueries({ queryKey: ["cake_size_usage"] });
  };

  const create = useMutation({
    mutationFn: async (name: string) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("cake_sizes")
        .insert({ name, user_id, sort_order: (sizes.data?.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewName("");
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CakeSize> }) => {
      const { error } = await supabase
        .from("cake_sizes")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cake_sizes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = sizes.data ?? [];
  const usageMap = usage.data ?? {};

  const dimInput = (
    row: CakeSize,
    key: "diameter_mm" | "length_mm" | "width_mm" | "height_mm",
    label: string,
  ) => (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        className={`${inputClass} !w-20 border-transparent text-right hover:border-input`}
        placeholder={label}
        defaultValue={row[key] != null ? mmToCm(Number(row[key])) : ""}
        onBlur={(e) => {
          const next = e.target.value.trim() ? cmToMm(Number(e.target.value)) : null;
          if (next !== (row[key] != null ? Number(row[key]) : null))
            update.mutate({ id: row.id, patch: { [key]: next } });
        }}
      />
      <span className="label-caps text-[10px] text-muted-foreground">CM {label}</span>
    </div>
  );

  return (
    <SectionCard title="CAKE SIZES">
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        Sizes you can pick as an order&apos;s CAKE SIZE. Servings and the sheet mould are filled in
        from here when an order selects the size. Dimensions are finished (after icing) size in cm.
      </p>

      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name) create.mutate(name);
        }}
      >
        <input
          className={`${inputClass} flex-1`}
          placeholder='New size name (e.g. 8" Round)'
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className={buttonClass} disabled={!newName.trim() || create.isPending}>
          + ADD SIZE
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">NO CAKE SIZES YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row) => {
            const used = usageMap[row.id] ?? 0;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input
                  className={`${inputClass} min-w-[9rem] flex-1 border-transparent hover:border-input`}
                  defaultValue={row.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== row.name) update.mutate({ id: row.id, patch: { name } });
                  }}
                />
                <select
                  className={`${selectClass} !w-32`}
                  value={row.shape ?? ""}
                  onChange={(e) => update.mutate({ id: row.id, patch: { shape: e.target.value || null } })}
                >
                  <option value="">— SHAPE —</option>
                  {SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {row.shape === "RECTANGLE" ? (
                  <>
                    {dimInput(row, "length_mm", "L")}
                    {dimInput(row, "width_mm", "W")}
                  </>
                ) : (
                  dimInput(row, "diameter_mm", "⌀")
                )}
                {dimInput(row, "height_mm", "H")}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    className={`${inputClass} !w-20 border-transparent text-right hover:border-input`}
                    placeholder="servings"
                    defaultValue={row.servings ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim() ? Number(e.target.value) : null;
                      if (next !== (row.servings ?? null)) update.mutate({ id: row.id, patch: { servings: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">SERVINGS</span>
                </div>
                <div className="w-56">
                  <MouldSelect
                    value={row.sheet_mould_id ?? ""}
                    onChange={(id) => update.mutate({ id: row.id, patch: { sheet_mould_id: id || null } })}
                    emptyLabel="— SHEET MOULD —"
                  />
                </div>
                <span className="label-caps text-[10px] text-muted-foreground">{used} ORDERS</span>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    if (confirm(used > 0 ? `${used} order(s) use this size. Delete anyway?` : "Delete this size?"))
                      remove.mutate(row.id);
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
