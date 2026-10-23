import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";

export type PackagingKind = "CAKE_BOARD" | "CAKE_BOX";
type PackagingRow = Tables<"packaging_items">;

const packagingQuery = (kind: PackagingKind) =>
  queryOptions({
    queryKey: ["packaging_items", kind],
    queryFn: async (): Promise<PackagingRow[]> => {
      const { data, error } = await supabase
        .from("packaging_items")
        .select("*")
        .eq("kind", kind)
        .order("width_mm")
        .order("length_mm")
        .order("height_mm");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        width_mm: Number(r.width_mm),
        length_mm: Number(r.length_mm),
        height_mm: r.height_mm == null ? null : Number(r.height_mm),
        quantity: Number(r.quantity),
      }));
    },
  });

const num = (v: string): number | null =>
  v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

const th = "border border-border bg-secondary px-3 py-2 text-left label-caps text-xs";
const td = "border border-border px-3 py-1.5 font-mono text-sm tabular-nums";

/**
 * CAKE BOARD(가로×세로) / CAKE BOX PKG(가로×세로×높이) 재고 — 엑셀 같은 표.
 * 같은 사이즈는 한 행으로 합쳐지고 개수만 늘고 줄어든다(추가할 때 같은 사이즈가 있으면 개수를 더함).
 */
export function PackagingInventory({ kind }: { kind: PackagingKind }) {
  const isBox = kind === "CAKE_BOX";
  const queryClient = useQueryClient();
  const rows = useQuery(packagingQuery(kind));
  const [draft, setDraft] = useState({ w: "", l: "", h: "", q: "1" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ w: "", l: "", h: "", q: "" });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["packaging_items", kind] });
  const list = rows.data ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const w = num(draft.w);
      const l = num(draft.l);
      const h = num(draft.h);
      const q = num(draft.q) ?? 0;
      if (!w || !l) throw new Error("가로·세로를 입력하세요");
      if (isBox && !h) throw new Error("높이를 입력하세요");
      const same = list.find(
        (r) => r.width_mm === w && r.length_mm === l && (isBox ? r.height_mm === h : true),
      );
      if (same) {
        const { error: e } = await supabase
          .from("packaging_items")
          .update({ quantity: same.quantity + q, updated_at: new Date().toISOString() })
          .eq("id", same.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("packaging_items").insert({
          kind,
          width_mm: w,
          length_mm: l,
          height_mm: isBox ? h : null,
          quantity: q,
        });
        if (e) throw e;
      }
    },
    onSuccess: async () => {
      setDraft((d) => ({ ...d, q: "1" }));
      setError(null);
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const bump = useMutation({
    mutationFn: async ({ row, delta }: { row: PackagingRow; delta: number }) => {
      const { error: e } = await supabase
        .from("packaging_items")
        .update({
          quantity: Math.max(0, row.quantity + delta),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (e) throw e;
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const save = useMutation({
    mutationFn: async (id: string) => {
      const w = num(edit.w);
      const l = num(edit.l);
      const h = num(edit.h);
      const q = num(edit.q);
      if (!w || !l || q == null || q < 0) throw new Error("값이 올바르지 않아요");
      if (isBox && !h) throw new Error("높이를 입력하세요");
      const { error: e } = await supabase
        .from("packaging_items")
        .update({
          width_mm: w,
          length_mm: l,
          height_mm: isBox ? h : null,
          quantity: q,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (e) throw e;
    },
    onSuccess: async () => {
      setEditId(null);
      setError(null);
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("packaging_items").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: async () => {
      setEditId(null);
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const cell = "w-full border border-border bg-background px-2 py-1 font-mono text-sm";
  const total = list.reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>가로 (mm)</th>
              <th className={th}>세로 (mm)</th>
              {isBox && <th className={th}>높이 (mm)</th>}
              <th className={th}>수량 (개)</th>
              <th className={th + " w-48"} />
            </tr>
          </thead>
          <tbody>
            {list.map((r) =>
              editId === r.id ? (
                <tr key={r.id} className="bg-muted/40">
                  <td className={td}>
                    <input
                      className={cell}
                      value={edit.w}
                      onChange={(e) => setEdit({ ...edit, w: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <input
                      className={cell}
                      value={edit.l}
                      onChange={(e) => setEdit({ ...edit, l: e.target.value })}
                    />
                  </td>
                  {isBox && (
                    <td className={td}>
                      <input
                        className={cell}
                        value={edit.h}
                        onChange={(e) => setEdit({ ...edit, h: e.target.value })}
                      />
                    </td>
                  )}
                  <td className={td}>
                    <input
                      className={cell}
                      value={edit.q}
                      onChange={(e) => setEdit({ ...edit, q: e.target.value })}
                    />
                  </td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={primaryButtonClass}
                        onClick={() => save.mutate(r.id)}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => remove.mutate(r.id)}
                      >
                        삭제
                      </button>
                      <button type="button" className={buttonClass} onClick={() => setEditId(null)}>
                        취소
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className={td}>{r.width_mm}</td>
                  <td className={td}>{r.length_mm}</td>
                  {isBox && <td className={td}>{r.height_mm}</td>}
                  <td className={td + " font-semibold"}>{r.quantity}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={bump.isPending || r.quantity <= 0}
                        onClick={() => bump.mutate({ row: r, delta: -1 })}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={bump.isPending}
                        onClick={() => bump.mutate({ row: r, delta: 1 })}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          setEditId(r.id);
                          setEdit({
                            w: String(r.width_mm),
                            l: String(r.length_mm),
                            h: r.height_mm != null ? String(r.height_mm) : "",
                            q: String(r.quantity),
                          });
                        }}
                      >
                        수정
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {/* 맨 아래 입력 행 — 같은 사이즈를 넣으면 그 행의 수량이 늘어난다 */}
            <tr className="bg-secondary/50">
              <td className={td}>
                <input
                  className={cell}
                  placeholder="가로"
                  inputMode="decimal"
                  value={draft.w}
                  onChange={(e) => setDraft({ ...draft, w: e.target.value })}
                />
              </td>
              <td className={td}>
                <input
                  className={cell}
                  placeholder="세로"
                  inputMode="decimal"
                  value={draft.l}
                  onChange={(e) => setDraft({ ...draft, l: e.target.value })}
                />
              </td>
              {isBox && (
                <td className={td}>
                  <input
                    className={cell}
                    placeholder="높이"
                    inputMode="decimal"
                    value={draft.h}
                    onChange={(e) => setDraft({ ...draft, h: e.target.value })}
                  />
                </td>
              )}
              <td className={td}>
                <input
                  className={cell}
                  placeholder="수량"
                  inputMode="decimal"
                  value={draft.q}
                  onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                />
              </td>
              <td className={td}>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={add.isPending}
                  onClick={() => add.mutate()}
                >
                  + 추가
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className={th} colSpan={isBox ? 3 : 2}>
                TOTAL
              </td>
              <td className={th}>{total}</td>
              <td className={th} />
            </tr>
          </tfoot>
        </table>
      </div>
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      <p className="font-mono text-[11px] text-muted-foreground">
        같은 사이즈를 다시 입력하면 새 행이 생기지 않고 그 행의 수량이 늘어나요.
      </p>
    </div>
  );
}
