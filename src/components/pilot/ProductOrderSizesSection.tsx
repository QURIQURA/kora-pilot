import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cakeSizesQuery } from "@/lib/queries";
import { SectionCard } from "./ui";

type OrderRow = {
  id: string;
  order_number: string;
  recipient: string | null;
  event_date: string | null;
  pickup_at: string | null;
  servings: number | null;
  cake_size: string | null;
  custom_size: string | null;
  cake_size_id: string | null;
};

/**
 * PRODUCT 상세 SIZES — 2026-10-20 사용자 요청: 사이즈는 SETTINGS > CAKE SIZES에서 정하고 주문이 고른다.
 * 여기서는 "이 제품을 어떤 사이즈로 만들어왔는지"를 주문 단위 리스트(주문 + 그 주문에서 쓴 사이즈)로 보여준다.
 */
export function ProductOrderSizesSection({ orders }: { orders: OrderRow[] }) {
  const sizes = useQuery(cakeSizesQuery());
  const nameById = new Map((sizes.data ?? []).map((s) => [s.id, s.name]));

  const sizeLabel = (o: OrderRow) =>
    (o.cake_size_id && nameById.get(o.cake_size_id)) ||
    (o.cake_size === "Custom" ? (o.custom_size ? `Custom — ${o.custom_size}` : "Custom") : o.cake_size) ||
    null;

  const counts = new Map<string, number>();
  for (const o of orders) {
    const label = sizeLabel(o);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return (
    <SectionCard
      title="SIZES"
      subtitle={
        counts.size > 0 ? (
          <>
            {[...counts.entries()].map(([label, n]) => `${label} ×${n}`).join(" · ")}
          </>
        ) : undefined
      }
    >
      {orders.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">NO ORDERS LINKED YET</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {orders.map((o) => {
            const label = sizeLabel(o);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="label-caps text-xs underline-offset-2 hover:underline"
                >
                  {o.order_number}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">
                  {o.recipient || "—"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {(o.pickup_at ?? o.event_date ?? "").slice(0, 10) || "—"}
                </span>
                <span className="label-caps ml-auto text-xs">{label ?? "SIZE NOT SET"}</span>
                {o.servings != null && (
                  <span className="font-mono text-xs text-muted-foreground">{o.servings} servings</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
