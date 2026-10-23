import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cakeSizesQuery, currentUserId, type CakeSize } from "@/lib/queries";
import { cmToMm, mmToCm } from "@/lib/product-size";
import { CAKE_SIZE_INCHES, CAKE_SIZE_SHAPES, buildCakeSizeName } from "@/lib/cake-size";
import { completeGeometry } from "@/lib/size-configuration";
import { MouldSelect } from "./MouldSelect";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

/**
 * SETTINGS > ORDERS > CAKE SIZES — 주문의 CAKE SIZE로 고를 전역 사이즈 목록.
 * 이름은 사이즈+모양+높이로 자동 구성된다(lib/cake-size.ts). ROUND/SQUARE는 4~12인치 드롭다운,
 * RECTANGLE은 가로·세로·높이를 cm로 직접 입력(저장 시 mm로 변환, DB canonical unit = mm). 시트 몰드를 지정해두면
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
      for (const r of data ?? [])
        if (r.cake_size_id) map[r.cake_size_id] = (map[r.cake_size_id] ?? 0) + 1;
      return map;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cake_sizes"] });
    await queryClient.invalidateQueries({ queryKey: ["cake_size_usage"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const base = {
        shape: "ROUND",
        size_inch: 8,
        length_mm: null,
        width_mm: null,
        height_mm: null,
      };
      const { error } = await supabase.from("cake_sizes").insert({
        ...base,
        name: buildCakeSizeName(base),
        user_id,
        sort_order: (sizes.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CakeSize> }) => {
      const current = (sizes.data ?? []).find((r) => r.id === id);
      if (!current) throw new Error("규격을 다시 불러오세요.");
      for (const key of ["diameter_mm", "length_mm", "width_mm", "height_mm"] as const) {
        const value = patch[key];
        if (value != null && (!Number.isFinite(value) || value <= 0))
          throw new Error("치수는 양수 cm로 입력하세요.");
      }
      const merged = { ...current, ...patch };
      // 사이즈/모양/치수가 바뀌면 이름을 자동으로 다시 만든다.
      const touchesName = ["shape", "size_inch", "length_mm", "width_mm", "height_mm"].some(
        (k) => k in patch,
      );
      const { error } = await supabase
        .from("cake_sizes")
        .update({
          ...patch,
          ...(touchesName ? { name: buildCakeSizeName(merged) } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // 2026-10-20 사용자 요청: 위/아래로 순서 조정 — 현재 순서를 0..n-1로 다시 매기며 두 칸을 맞바꾼다.
  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(sizes.data ?? [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return;
      const a = list[index];
      const b = list[target];
      if (!a || !b) return;
      list[index] = b;
      list[target] = a;
      const results = await Promise.all(
        list.map((r, i) =>
          r.sort_order === i
            ? Promise.resolve({ error: null })
            : supabase.from("cake_sizes").update({ sort_order: i }).eq("id", r.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const results = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("cake_size_id", id),
        supabase
          .from("work_sessions")
          .select("id", { count: "exact", head: true })
          .eq("cake_size_id", id),
        supabase
          .from("product_sizes")
          .select("id", { count: "exact", head: true })
          .eq("cake_size_id", id),
      ]);
      for (const result of results) {
        if (result.error) throw result.error;
      }
      if (results.some((result) => (result.count ?? 0) > 0))
        throw new Error("오더·세션·제품 사이즈에서 사용 중인 규격은 삭제할 수 없습니다.");
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
    <SectionCard title="공용 완성 규격">
      {(update.isError || remove.isError || create.isError) && (
        <p role="alert" className="text-xs text-destructive">
          {((update.error ?? remove.error ?? create.error) as Error).message}
        </p>
      )}
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        인치는 표시용 이름입니다. 실제 완성 지름 또는 가로·세로·높이(cm)를 별도로 확인하세요. 몰드
        치수를 완성 치수로 자동 복사하지 않습니다. CREAM g은 공용 참고값이며 제품별 목표량을
        대체하지 않습니다.
      </p>

      <div className="mb-3">
        <button
          type="button"
          className={buttonClass}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          + ADD SIZE
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">NO CAKE SIZES YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row, index) => {
            const used = usageMap[row.id] ?? 0;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="label-caps px-1 text-[10px] leading-none hover:bg-secondary disabled:opacity-30"
                    disabled={index === 0 || move.isPending}
                    onClick={() => move.mutate({ index, dir: -1 })}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="label-caps px-1 text-[10px] leading-none hover:bg-secondary disabled:opacity-30"
                    disabled={index === rows.length - 1 || move.isPending}
                    onClick={() => move.mutate({ index, dir: 1 })}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <span className="label-caps min-w-[9rem] flex-1 text-sm">{row.name}</span>
                <select
                  className={`${selectClass} !w-32`}
                  value={row.shape ?? ""}
                  onChange={(e) =>
                    update.mutate({ id: row.id, patch: { shape: e.target.value || null } })
                  }
                >
                  <option value="">— SHAPE —</option>
                  {CAKE_SIZE_SHAPES.map((sh) => (
                    <option key={sh} value={sh}>
                      {sh}
                    </option>
                  ))}
                </select>
                {row.shape === "RECTANGLE" ? (
                  <>
                    {dimInput(row, "length_mm", "L")}
                    {dimInput(row, "width_mm", "W")}
                  </>
                ) : (
                  <select
                    className={`${selectClass} !w-24`}
                    value={row.size_inch ?? ""}
                    onChange={(e) =>
                      update.mutate({
                        id: row.id,
                        patch: { size_inch: e.target.value ? Number(e.target.value) : null },
                      })
                    }
                  >
                    <option value="">— INCH —</option>
                    {CAKE_SIZE_INCHES.map((n) => (
                      <option key={n} value={n}>
                        {n}&quot;
                      </option>
                    ))}
                  </select>
                )}
                {row.shape === "ROUND" && dimInput(row, "diameter_mm", "Ø")}
                {row.shape === "SQUARE" && (
                  <>
                    {dimInput(row, "length_mm", "L")}
                    {dimInput(row, "width_mm", "W")}
                  </>
                )}
                {dimInput(row, "height_mm", "H")}
                {!completeGeometry(row) && (
                  <span className="text-xs text-destructive">실제 치수 확인 필요</span>
                )}
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
                      if (next !== (row.servings ?? null))
                        update.mutate({ id: row.id, patch: { servings: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">SERVINGS</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    className={`${inputClass} !w-20 border-transparent text-right hover:border-input`}
                    placeholder="cream"
                    defaultValue={row.cream_g ?? ""}
                    onBlur={(e) => {
                      const next = e.target.value.trim() ? Number(e.target.value) : null;
                      if (next !== (row.cream_g ?? null))
                        update.mutate({ id: row.id, patch: { cream_g: next } });
                    }}
                  />
                  <span className="label-caps text-[10px] text-muted-foreground">CREAM g</span>
                </div>
                <div className="w-56">
                  <MouldSelect
                    value={row.sheet_mould_id ?? ""}
                    onChange={(id) =>
                      update.mutate({ id: row.id, patch: { sheet_mould_id: id || null } })
                    }
                    emptyLabel="— SHEET MOULD —"
                  />
                </div>
                <span className="label-caps text-[10px] text-muted-foreground">{used} ORDERS</span>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={used > 0}
                  title={used > 0 ? "주문에 사용 중인 규격은 삭제할 수 없습니다." : undefined}
                  onClick={() => {
                    if (confirm("Delete this unused size?")) remove.mutate(row.id);
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
