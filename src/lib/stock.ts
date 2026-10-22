import { supabase } from "@/integrations/supabase/client";

export type StockReason =
  "PRODUCTION_FREEZE" | "PRODUCTION_SALE" | "MANUAL_ADJUST" | "SALE" | "WASTE" | "OTHER";

export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  PRODUCTION_FREEZE: "생산 → 냉동 재고",
  PRODUCTION_SALE: "생산 → 즉시 판매전환",
  MANUAL_ADJUST: "수동 조정",
  SALE: "판매 출고",
  WASTE: "폐기/손실",
  OTHER: "기타",
};

interface AdjustStockArgs {
  itemType: "PRODUCT" | "COMPONENT";
  productSizeId?: string | null;
  componentId?: string | null;
  quantityDelta: number;
  reason: StockReason;
  workSessionId?: string | null;
  note?: string | null;
  unitLabel?: string;
  /** COMPONENT 전용 — 사이즈별 줄. id가 있으면 그 줄을, createNew면 새 줄을, 둘 다 없으면 첫 줄(없으면 새 줄)을 조정 */
  line?: {
    id?: string;
    createNew?: boolean;
    width_mm?: number | null;
    length_mm?: number | null;
    height_mm?: number | null;
    mould_id?: string | null;
    mould_qty?: number | null;
  };
}

/**
 * 재고 항목을 찾거나 새로 만들고, 수량을 조정한 뒤 변동 이력을 남긴다.
 * PRODUCTION 세션 종료 시 즉시반영 플로우와 재고관리 탭 수동조정 플로우가 이 함수 하나를 공유한다.
 */
export async function adjustStock(args: AdjustStockArgs): Promise<void> {
  const { itemType, productSizeId, componentId, quantityDelta, reason, workSessionId, note } = args;

  const matchColumn = itemType === "PRODUCT" ? "product_size_id" : "component_id";
  const matchValue = itemType === "PRODUCT" ? productSizeId : componentId;
  if (!matchValue) throw new Error("STOCK ITEM TARGET MISSING");

  const { data: existing, error: findError } = await supabase
    .from("stock_items")
    .select("id, quantity")
    .eq("item_type", itemType)
    .eq(matchColumn, matchValue)
    .maybeSingle();
  if (findError) throw findError;

  let stockItemId: string;
  let currentQty = 0;
  if (existing) {
    stockItemId = existing.id;
    currentQty = Number(existing.quantity);
  } else {
    const { data: created, error: createError } = await supabase
      .from("stock_items")
      .insert({
        item_type: itemType,
        product_size_id: itemType === "PRODUCT" ? (productSizeId ?? null) : null,
        component_id: itemType === "COMPONENT" ? (componentId ?? null) : null,
        unit_label: args.unitLabel ?? "개",
        quantity: 0,
      })
      .select("id")
      .single();
    if (createError) throw createError;
    stockItemId = created.id;
  }

  let newTotal = currentQty + quantityDelta;
  if (itemType === "COMPONENT") {
    const { data: lines, error: linesError } = await supabase
      .from("stock_item_lines")
      .select("id, quantity, created_at")
      .eq("stock_item_id", stockItemId)
      .order("created_at");
    if (linesError) throw linesError;
    const all = lines ?? [];
    const target = args.line?.id
      ? all.find((l) => l.id === args.line?.id)
      : args.line?.createNew
        ? undefined
        : all[0];
    if (target) {
      const { error: lineErr } = await supabase
        .from("stock_item_lines")
        .update({
          quantity: Number(target.quantity) + quantityDelta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);
      if (lineErr) throw lineErr;
    } else {
      const { error: lineErr } = await supabase.from("stock_item_lines").insert({
        stock_item_id: stockItemId,
        quantity: quantityDelta,
        unit_label: args.unitLabel ?? "개",
        width_mm: args.line?.width_mm ?? null,
        length_mm: args.line?.length_mm ?? null,
        height_mm: args.line?.height_mm ?? null,
        mould_id: args.line?.mould_id ?? null,
        mould_qty: args.line?.mould_qty ?? null,
      });
      if (lineErr) throw lineErr;
    }
    newTotal = all.reduce((sum, l) => sum + Number(l.quantity), 0) + quantityDelta;
  }

  const { error: updateError } = await supabase
    .from("stock_items")
    .update({ quantity: newTotal, updated_at: new Date().toISOString() })
    .eq("id", stockItemId);
  if (updateError) throw updateError;

  const { error: movementError } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItemId,
    quantity_delta: quantityDelta,
    reason,
    work_session_id: workSessionId ?? null,
    note: note ?? null,
  });
  if (movementError) throw movementError;
}
