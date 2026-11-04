/** Build from orders, so missing sessions/components can never silently remove an order card. */
export function buildProductionOrderCards<
  O extends {
    id: string;
    status: string;
    order_number: string;
    pickup_at: string | null;
    event_date: string | null;
  },
  R extends { order: { id: string } },
  S extends { id: string; order_id: string | null; status: string },
>(orders: O[], components: R[], sessions: S[], completed: boolean) {
  return orders
    .filter((o) => (o.status === "COMPLETED") === completed)
    .map((order) => {
      const linked = sessions.filter((s) => s.order_id === order.id && s.status !== "CANCELLED");
      return {
        order,
        rows: components.filter((r) => r.order.id === order.id),
        session: linked.length === 1 ? linked[0]! : null,
        ambiguousSession: linked.length > 1,
      };
    })
    .sort((a, b) =>
      completed
        ? (b.order.pickup_at ?? b.order.event_date ?? "").localeCompare(
            a.order.pickup_at ?? a.order.event_date ?? "",
          )
        : Number(a.rows.length > 0) - Number(b.rows.length > 0) ||
          a.order.order_number.localeCompare(b.order.order_number),
    );
}
