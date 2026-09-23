import { supabase } from "@/integrations/supabase/client";

export type StockReason =
  | "PRODUCTION_FREEZE"
  | "PRODUCTION_SALE"
  | "MANUAL_ADJUST"
  | "SALE"
  | "WASTE"
  | "OTHER";

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
}

/**
 * 재고 항목을 찾거나 새로 만들고, 수량을 조정한 뒤 변동 이력을 남긴다.
 * PRODUCTION 세션 종료 시 즉시반영 플로우와 재고관리 탭 수동조정 플로우가 이 함수 하나를 공유한다.
 */
export async function adjustStock(args: AdjustStockArgs): Promise<void> {
  const { itemType, productSizeId, componentId, quantityDelta, reason, workSessionId, note } =
    args;

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

  const { error: updateError } = await supabase
    .from("stock_items")
    .update({ quantity: currentQty + quantityDelta, updated_at: new Date().toISOString() })
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
