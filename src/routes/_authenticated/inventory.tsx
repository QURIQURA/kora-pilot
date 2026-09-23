import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  stockCandidatesQuery,
  stockItemsQuery,
  stockMovementsQuery,
  type StockItemRow,
} from "@/lib/queries";
import { adjustStock, STOCK_REASON_LABEL, type StockReason } from "@/lib/stock";
import { formatDateTime } from "@/lib/datetime";
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

function InventoryPage() {
  const items = useQuery(stockItemsQuery());
  const [adding, setAdding] = useState(false);

  const rows = items.data ?? [];
  const productRows = rows.filter((r) => r.item_type === "PRODUCT");
  const componentRows = rows.filter((r) => r.item_type === "COMPONENT");

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
        PRODUCT(완성 케익)와 COMPONENT(반제품/시트)를 각각 따로 추적합니다. PRODUCTION 작업 세션을
        COMPLETED로 바꾸면 그 자리에서 바로 반영하거나, 여기서 언제든 수동으로 조정할 수 있습니다.
      </p>

      {adding && <AddStockItemForm onDone={() => setAdding(false)} />}

      <SectionCard title={`PRODUCT (${productRows.length})`}>
        {productRows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">등록된 항목 없음</p>
        ) : (
          <ul className="divide-y divide-border">
            {productRows.map((row) => (
              <StockItemRowView key={row.id} row={row} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`COMPONENT (${componentRows.length})`}>
        {componentRows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">등록된 항목 없음</p>
        ) : (
          <ul className="divide-y divide-border">
            {componentRows.map((row) => (
              <StockItemRowView key={row.id} row={row} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function AddStockItemForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const candidates = useQuery(stockCandidatesQuery());
  const [itemType, setItemType] = useState<"PRODUCT" | "COMPONENT">("PRODUCT");
  const [targetId, setTargetId] = useState("");
  const [unitLabel, setUnitLabel] = useState("개");
  const [error, setError] = useState<string | null>(null);

  const options =
    itemType === "PRODUCT" ? (candidates.data?.sizes ?? []) : (candidates.data?.components ?? []);

  const create = useMutation({
    mutationFn: async () => {
      if (!targetId) throw new Error("항목을 선택하세요");
      await adjustStock({
        itemType,
        productSizeId: itemType === "PRODUCT" ? targetId : null,
        componentId: itemType === "COMPONENT" ? targetId : null,
        quantityDelta: 0,
        reason: "MANUAL_ADJUST",
        note: "재고 항목 신규 등록",
        unitLabel,
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="유형">
          <select
            className={selectClass}
            value={itemType}
            onChange={(e) => {
              setItemType(e.target.value as "PRODUCT" | "COMPONENT");
              setTargetId("");
            }}
          >
            <option value="PRODUCT">PRODUCT (완성 케익)</option>
            <option value="COMPONENT">COMPONENT (반제품)</option>
          </select>
        </Field>
        <Field label="대상">
          <select className={selectClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">선택…</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="단위 (예: 개, 장, g)">
          <input className={inputClass} value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} />
        </Field>
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

function StockItemRowView({ row }: { row: StockItemRow }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<StockReason>("MANUAL_ADJUST");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const movements = useQuery({ ...stockMovementsQuery(row.id), enabled: open });

  const adjust = useMutation({
    mutationFn: async () => {
      const n = Number(delta);
      if (!Number.isFinite(n) || n === 0) throw new Error("숫자를 입력하세요 (0 제외)");
      await adjustStock({
        itemType: row.item_type,
        productSizeId: row.product_size_id,
        componentId: row.component_id,
        quantityDelta: n,
        reason,
        note: note.trim() || null,
      });
    },
    onSuccess: async () => {
      setDelta("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["stock_items"] });
      await queryClient.invalidateQueries({ queryKey: ["stock_movements", row.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-left text-sm hover:underline" onClick={() => setOpen((v) => !v)}>
          {row.label}
        </button>
        <span className="font-mono text-sm">
          {row.quantity} {row.unit_label}
        </span>
      </div>

      {open && (
        <div className="space-y-3 border-t border-dashed border-border pt-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <input
              className={inputClass}
              placeholder="+3 / -2"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <select
              className={selectClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as StockReason)}
            >
              {(Object.keys(STOCK_REASON_LABEL) as StockReason[]).map((r) => (
                <option key={r} value={r}>
                  {STOCK_REASON_LABEL[r]}
                </option>
              ))}
            </select>
            <input
              className={inputClass + " sm:col-span-1"}
              placeholder="메모 (선택)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className={buttonClass} disabled={adjust.isPending} onClick={() => adjust.mutate()}>
              반영
            </button>
          </div>
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          <div className="space-y-1">
            {(movements.data ?? []).length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground">변동 이력 없음</p>
            ) : (
              (movements.data ?? []).map((m) => (
                <p key={m.id} className="font-mono text-[11px] text-muted-foreground">
                  {formatDateTime(m.created_at)} · {m.quantity_delta > 0 ? "+" : ""}
                  {m.quantity_delta} · {STOCK_REASON_LABEL[m.reason as StockReason] ?? m.reason}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </li>
  );
}
