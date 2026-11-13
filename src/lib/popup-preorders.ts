import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, localDateTimeToISO, toLocalDateString } from "@/lib/datetime";
import type { PopupItem } from "@/lib/popup";

/**
 * 팝업 프리오더(2026-11-13, 연) — 새 테이블/레코드 없이 기존 ORDERS 행을 그대로 보여준다.
 * 팝업에 연결되는 오더 = 팝업이 아닌 오더 중
 *   (a) 오더 번호가 "<팝업 번호>." 로 시작하거나 (예: SND-001.1), 또는
 *   (b) 픽업 시각이 팝업 날짜(시작일 ~ 종료일, 시드니 기준 하루 전체) 안에 있는 오더.
 * 그중 제품이 팝업 품목과 같은 오더만 해당 품목 행 옆에 표시한다.
 */
export interface PopupPreorder {
  id: string;
  order_number: string | null;
  pickup_at: string | null;
  quantity: number | null;
  payment_status: string | null;
  product_id: string | null;
  products: { name: string } | null;
  customers: { name: string | null; phone: string | null } | null;
}

const SELECT =
  "id, order_number, pickup_at, quantity, payment_status, product_id, products(name), customers(name, phone)";

export const popupPreordersQuery = (popup: {
  id: string;
  order_number: string | null;
  pickup_at: string | null;
  ends_at: string;
}) =>
  queryOptions({
    queryKey: [
      "orders",
      "popup-preorders",
      popup.id,
      popup.order_number,
      popup.pickup_at,
      popup.ends_at,
    ],
    queryFn: async (): Promise<PopupPreorder[]> => {
      const found = new Map<string, PopupPreorder>();
      const number = popup.order_number?.trim();
      if (number) {
        const { data, error } = await supabase
          .from("orders")
          .select(SELECT)
          .neq("order_kind", "POPUP")
          .like("order_number", `${number.replace(/[\\%_]/g, (c) => `\\${c}`)}.%`);
        if (error) throw error;
        for (const row of (data ?? []) as unknown as PopupPreorder[]) found.set(row.id, row);
      }
      if (popup.pickup_at) {
        const day = toLocalDateString(new Date(popup.pickup_at));
        const lastDay = popup.ends_at ? toLocalDateString(new Date(popup.ends_at)) : day;
        const { data, error } = await supabase
          .from("orders")
          .select(SELECT)
          .neq("order_kind", "POPUP")
          .gte("pickup_at", localDateTimeToISO(day, "00:00"))
          .lt("pickup_at", localDateTimeToISO(addDays(lastDay < day ? day : lastDay, 1), "00:00"));
        if (error) throw error;
        for (const row of (data ?? []) as unknown as PopupPreorder[]) found.set(row.id, row);
      }
      return [...found.values()].sort(
        (a, b) =>
          (a.pickup_at ?? "").localeCompare(b.pickup_at ?? "") ||
          (a.order_number ?? "").localeCompare(b.order_number ?? ""),
      );
    },
  });

/** 품목 하나에 해당하는 프리오더 — 제품이 같거나, 제품이 없으면 이름이 같은 오더. */
export function preordersForItem(item: PopupItem, preorders: PopupPreorder[]): PopupPreorder[] {
  const label = item.label.trim().toLowerCase();
  return preorders.filter((o) =>
    item.product_id && o.product_id
      ? o.product_id === item.product_id
      : !!label && (o.products?.name ?? "").trim().toLowerCase() === label,
  );
}

export function paymentLabel(status: string | null): string {
  if (status === "Paid in Full") return "PAID";
  if (status === "Deposit Paid") return "DEPOSIT";
  return "UNPAID";
}
