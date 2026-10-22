import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mouldsQuery,
  stockCandidatesQuery,
  stockItemsQuery,
  type StockItemRow,
  type StockLine,
} from "@/lib/queries";
import { adjustStock } from "@/lib/stock";
import {
  Field,
  PageHeader,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "PILOT — Inventory" },
      { name: "description", content: "Frozen stock tracking (Product & Component)" },
      { property: "og:title", content: "PILOT — Inventory" },
      { property: "og:description", content: "Frozen stock tracking (Product & Component)" },
    ],
  }),
  component: InventoryPage,
});

type MouldLite = { id: string; name: string; diameter_mm: number | null };

/** 몰드 하나의 바닥 면적(cm²) — 지름(mm) 기준 원형. 지름이 없으면 null. */
function mouldAreaCm2(m: MouldLite | undefined | null): number | null {
  const d = m?.diameter_mm;
  return d ? Math.PI * (Number(d) / 20) ** 2 : null;
}

const numOrNull = (v: string): number | null =>
  v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

/** 가로×세로×높이(mm) 표시 — 입력된 값만 */
function dimText(l: Pick<StockLine, "width_mm" | "length_mm" | "height_mm">): string {
  const parts = [l.width_mm, l.length_mm, l.height_mm];
  if (parts.every((v) => v == null)) return "";
  return `${parts.map((v) => (v == null ? "–" : v)).join("×")}mm`;
}

function mouldText(
  l: Pick<StockLine, "width_mm" | "length_mm" | "mould_id" | "mould_qty">,
  moulds: MouldLite[],
): string {
  const mould = moulds.find((m) => m.id === l.mould_id);
  if (!mould) return "";
  const parts: string[] = [];
  if (l.mould_qty != null) parts.push(`${mould.name} ${l.mould_qty}개분`);
  const a = mouldAreaCm2(mould);
  if (a && l.width_mm && l.length_mm) {
    parts.push(`면적 기준 ≈ ${((l.width_mm * l.length_mm) / 100 / a).toFixed(1)}개분`);
  }
  return parts.length ? parts.join(" · ") : mould.name;
}

type SizeForm = {
  width: string;
  length: string;
  height: string;
  unit: string;
  qty: string;
  mouldId: string;
  mouldQty: string;
};

const emptyForm = (): SizeForm => ({
  width: "",
  length: "",
  height: "",
  unit: "개",
  qty: "0",
  mouldId: "",
  mouldQty: "",
});

const formFromLine = (l: StockLine): SizeForm => ({
  width: l.width_mm != null ? String(l.width_mm) : "",
  length: l.length_mm != null ? String(l.length_mm) : "",
  height: l.height_mm != null ? String(l.height_mm) : "",
  unit: l.unit_label,
  qty: String(l.quantity),
  mouldId: l.mould_id ?? "",
  mouldQty: l.mould_qty != null ? String(l.mould_qty) : "",
});

/** 가로·세로·높이 / 단위·수량 / 몰드 기준 입력 — 추가와 수정이 같이 쓴다 */
function LineFields({
  form,
  onChange,
}: {
  form: SizeForm;
  onChange: (patch: Partial<SizeForm>) => void;
}) {
  const moulds = useQuery(mouldsQuery());
  const mould = (moulds.data ?? []).find((m) => m.id === form.mouldId);
  const a = mouldAreaCm2(mould);
  const w = Number(form.width);
  const l = Number(form.length);
  const auto = a && w > 0 && l > 0 ? ((w * l) / 100 / a).toFixed(1) : null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="가로 (mm)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.width}
            onChange={(e) => onChange({ width: e.target.value })}
          />
        </Field>
        <Field label="세로 (mm)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.length}
            onChange={(e) => onChange({ length: e.target.value })}
          />
        </Field>
        <Field label="높이 (mm)">
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.height}
            onChange={(e) => onChange({ height: e.target.value })}
          />
        </Field>
        <Field label="수량">
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
          />
        </Field>
        <Field label="단위 (개, 장, g)">
          <input
            className={inputClass}
            value={form.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="케익 몰드 기준">
          <select
            className={selectClass}
            value={form.mouldId}
            onChange={(e) => onChange({ mouldId: e.target.value })}
          >
            <option value="">— 안 함 —</option>
            {(moulds.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="몰드 몇 개분">
          <input
            className={inputClass}
            inputMode="decimal"
            disabled={!form.mouldId}
            placeholder={auto ? `면적 기준 ≈ ${auto}` : ""}
            value={form.mouldQty}
            onChange={(e) => onChange({ mouldQty: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

const lineValues = (f: SizeForm) => ({
  width_mm: numOrNull(f.width),
  length_mm: numOrNull(f.length),
  height_mm: numOrNull(f.height),
  unit_label: f.unit.trim() || "개",
  mould_id: f.mouldId || null,
  mould_qty: f.mouldId ? numOrNull(f.mouldQty) : null,
});

/** 컴포넌트 stock_items.quantity를 줄 합계로 맞춘다 */
async function syncItemTotal(stockItemId: string) {
  const { data, error } = await supabase
    .from("stock_item_lines")
    .select("quantity")
    .eq("stock_item_id", stockItemId);
  if (error) throw error;
  const total = (data ?? []).reduce((s, l) => s + Number(l.quantity), 0);
  const { error: e2 } = await supabase
    .from("stock_items")
    .update({ quantity: total, updated_at: new Date().toISOString() })
    .eq("id", stockItemId);
  if (e2) throw e2;
}

function InventoryPage() {
  const items = useQuery(stockItemsQuery());
  const [adding, setAdding] = useState(false);

  const rows = items.data ?? [];
  const products = useMemo(() => {
    const map = new Map<string, StockItemRow[]>();
    for (const r of rows.filter((r) => r.item_type === "PRODUCT")) {
      const list = map.get(r.group_label) ?? [];
      list.push(r);
      map.set(r.group_label, list);
    }
    return [...map.entries()];
  }, [rows]);
  const components = rows.filter((r) => r.item_type === "COMPONENT");

  return (
    <div className="space-y-4">
      <PageHeader
        title="INVENTORY (냉동 재고)"
        action={
          <button type="button" className={primaryButtonClass} onClick={() => setAdding((v) => !v)}>
            {adding ? "닫기" : "+ 재고 항목 추가"}
          </button>
        }
      />
      <p className="font-mono text-xs uppercase text-muted-foreground">
        PRODUCT(완성 케익)와 COMPONENT(반제품/시트)를 각각 따로 추적합니다. 같은 품목은 한 박스에
        사이즈별로 수량을 적어요. PRODUCTION 작업 세션을 COMPLETED로 바꾸면 그 자리에서 바로
        반영하거나, 여기서 언제든 수정할 수 있습니다.
      </p>

      {adding && <AddStockForm onDone={() => setAdding(false)} />}

      <SectionCard title={`PRODUCT (${products.length})`}>
        {products.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">등록된 항목 없음</p>
        ) : (
          <ul className="divide-y divide-border">
            {products.map(([name, list]) => (
              <li key={name} className="space-y-1 px-3 py-3">
                <p className="text-sm">{name}</p>
                <ul className="divide-y divide-dashed divide-border">
                  {list.map((r) => (
                    <ProductSizeLine key={r.id} row={r} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`COMPONENT (${components.length})`}>
        {components.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">등록된 항목 없음</p>
        ) : (
          <ul className="divide-y divide-border">
            {components.map((row) => (
              <ComponentBox key={row.id} row={row} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function AddStockForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const candidates = useQuery(stockCandidatesQuery());
  const [itemType, setItemType] = useState<"PRODUCT" | "COMPONENT">("COMPONENT");
  const [targetId, setTargetId] = useState("");
  const [form, setForm] = useState<SizeForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const options =
    itemType === "PRODUCT" ? (candidates.data?.sizes ?? []) : (candidates.data?.components ?? []);

  const create = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("항목을 선택하세요");
      const qty = Number(form.qty || "0");
      if (!Number.isFinite(qty)) throw new Error("수량이 올바르지 않아요");
      const v = lineValues(form);
      await adjustStock({
        itemType,
        productSizeId: itemType === "PRODUCT" ? targetId : null,
        componentId: itemType === "COMPONENT" ? targetId : null,
        quantityDelta: qty,
        reason: "MANUAL_ADJUST",
        note: "재고 항목 등록",
        unitLabel: v.unit_label,
        line: { createNew: true, ...v },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["stock_items"] });
      await queryClient.invalidateQueries({ queryKey: ["stock_candidates"] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <SectionCard title="신규 재고 항목">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="유형">
          <select
            className={selectClass}
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value as "PRODUCT" | "COMPONENT");
              setTargetId("");
            }}
          >
            <option value="COMPONENT">COMPONENT (반제품)</option>
            <option value="PRODUCT">PRODUCT (완성 케익)</option>
          </select>
        </Field>
        <Field label="대상">
          <select
            className={selectClass}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">선택…</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3">
        {itemType === "COMPONENT" ? (
          <LineFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="수량">
              <input
                className={inputClass}
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </Field>
            <Field label="단위 (개, 조각)">
              <input
                className={inputClass}
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </div>
      {error && <p className="mt-2 font-mono text-xs text-destructive">{error}</p>}
      <div className="mt-3">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          추가
        </button>
      </div>
    </SectionCard>
  );
}

/** 컴포넌트 한 박스 — 사이즈별 줄이 모두 보인다(펼침 없음) */
function ComponentBox({ row }: { row: StockItemRow }) {
  const queryClient = useQueryClient();
  const moulds = useQuery(mouldsQuery());
  const [addingLine, setAddingLine] = useState(false);
  const [form, setForm] = useState<SizeForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const addLine = useMutation({
    mutationFn: async () => {
      const qty = Number(form.qty || "0");
      if (!Number.isFinite(qty)) throw new Error("수량이 올바르지 않아요");
      const v = lineValues(form);
      await adjustStock({
        itemType: "COMPONENT",
        componentId: row.component_id,
        quantityDelta: qty,
        reason: "MANUAL_ADJUST",
        note: "사이즈 추가",
        unitLabel: v.unit_label,
        line: { createNew: true, ...v },
      });
    },
    onSuccess: async () => {
      setAddingLine(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["stock_items"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <li className="space-y-1 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">{row.group_label}</p>
        <button type="button" className={buttonClass} onClick={() => setAddingLine((v) => !v)}>
          {addingLine ? "닫기" : "+ 사이즈 추가"}
        </button>
      </div>
      {row.lines.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          사이즈별 재고가 없어요 — “+ 사이즈 추가”로 입력하세요.
        </p>
      ) : (
        <ul className="divide-y divide-dashed divide-border">
          {row.lines.map((l) => (
            <ComponentLine key={l.id} line={l} stockItemId={row.id} moulds={moulds.data ?? []} />
          ))}
        </ul>
      )}
      {addingLine && (
        <div className="space-y-2 border border-dashed border-border p-2">
          <LineFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          <button
            type="button"
            className={primaryButtonClass}
            disabled={addLine.isPending}
            onClick={() => addLine.mutate()}
          >
            추가
          </button>
        </div>
      )}
    </li>
  );
}

function ComponentLine({
  line,
  stockItemId,
  moulds,
}: {
  line: StockLine;
  stockItemId: string;
  moulds: MouldLite[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<SizeForm>(formFromLine(line));
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["stock_items"] });

  const bump = useMutation({
    mutationFn: async (delta: number) => {
      const next = Math.max(0, line.quantity + delta);
      const { error: e } = await supabase
        .from("stock_item_lines")
        .update({ quantity: next, updated_at: new Date().toISOString() })
        .eq("id", line.id);
      if (e) throw e;
      await syncItemTotal(stockItemId);
      await supabase.from("stock_movements").insert({
        stock_item_id: stockItemId,
        quantity_delta: next - line.quantity,
        reason: "MANUAL_ADJUST",
        note: `${dimText(line) || "사이즈 미지정"} 수량 조정`,
      });
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const qty = Number(form.qty);
      if (!Number.isFinite(qty) || qty < 0) throw new Error("수량이 올바르지 않아요");
      const { error: e } = await supabase
        .from("stock_item_lines")
        .update({ ...lineValues(form), quantity: qty, updated_at: new Date().toISOString() })
        .eq("id", line.id);
      if (e) throw e;
      await syncItemTotal(stockItemId);
      if (qty !== line.quantity) {
        await supabase.from("stock_movements").insert({
          stock_item_id: stockItemId,
          quantity_delta: qty - line.quantity,
          reason: "MANUAL_ADJUST",
          note: "수정",
        });
      }
    },
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.from("stock_item_lines").delete().eq("id", line.id);
      if (e) throw e;
      await syncItemTotal(stockItemId);
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const mt = mouldText(line, moulds);

  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm">{dimText(line) || "사이즈 미입력"}</p>
          {mt && <p className="font-mono text-[11px] text-muted-foreground">{mt}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            disabled={bump.isPending || line.quantity <= 0}
            onClick={() => bump.mutate(-1)}
          >
            −
          </button>
          <span className="min-w-14 text-center font-mono text-sm">
            {line.quantity} {line.unit_label}
          </span>
          <button
            type="button"
            className={buttonClass}
            disabled={bump.isPending}
            onClick={() => bump.mutate(1)}
          >
            +
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setForm(formFromLine(line));
              setEditing((v) => !v);
            }}
          >
            {editing ? "닫기" : "수정"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="space-y-2 border border-dashed border-border p-2">
          <LineFields form={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
          <div className="flex gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              저장
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={remove.isPending}
              onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
            >
              {confirmDelete ? "정말 삭제" : "이 사이즈 삭제"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </li>
  );
}

/** PRODUCT는 사이즈별 항목이 이미 따로 있어, 같은 제품끼리 한 박스에 줄로 보여준다 */
function ProductSizeLine({ row }: { row: StockItemRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(row.quantity));
  const [unit, setUnit] = useState(row.unit_label);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["stock_items"] });

  const bump = useMutation({
    mutationFn: async (delta: number) => {
      await adjustStock({
        itemType: "PRODUCT",
        productSizeId: row.product_size_id,
        quantityDelta: delta,
        reason: "MANUAL_ADJUST",
      });
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });
  const save = useMutation({
    mutationFn: async () => {
      const n = Number(qty);
      if (!Number.isFinite(n) || n < 0) throw new Error("수량이 올바르지 않아요");
      const { error: e } = await supabase
        .from("stock_items")
        .update({
          quantity: n,
          unit_label: unit.trim() || "개",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (e) throw e;
      if (n !== row.quantity) {
        await supabase.from("stock_movements").insert({
          stock_item_id: row.id,
          quantity_delta: n - row.quantity,
          reason: "MANUAL_ADJUST",
          note: "수정",
        });
      }
    },
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm">{row.size_label || "사이즈 미지정"}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            disabled={bump.isPending || row.quantity <= 0}
            onClick={() => bump.mutate(-1)}
          >
            −
          </button>
          <span className="min-w-14 text-center font-mono text-sm">
            {row.quantity} {row.unit_label}
          </span>
          <button
            type="button"
            className={buttonClass}
            disabled={bump.isPending}
            onClick={() => bump.mutate(1)}
          >
            +
          </button>
          <button type="button" className={buttonClass} onClick={() => setEditing((v) => !v)}>
            {editing ? "닫기" : "수정"}
          </button>
        </div>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-2 border border-dashed border-border p-2">
          <Field label="수량">
            <input className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="단위">
            <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </div>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </li>
  );
}
