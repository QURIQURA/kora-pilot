import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dietaryTagsQuery, orderDietaryTagLinksQuery } from "@/lib/queries";

/** 오더 제목 = "주문자 성함 - 제품명"(없는 쪽은 생략). 둘 다 없으면 fallback. */
export function orderTitle(
  customerName: string | null | undefined,
  productName: string | null | undefined,
  fallback = "",
): string {
  return [customerName, productName].filter(Boolean).join(" - ") || fallback;
}

/** 오더별 DIETARY 태그 이름 목록을 돌려주는 조회 함수(대시보드/ORDERS 탭 공용). */
export function useOrderDietaryNames(): (orderId: string) => string[] {
  const tags = useQuery(dietaryTagsQuery());
  const links = useQuery(orderDietaryTagLinksQuery());
  const byOrder = useMemo(() => {
    const names = new Map((tags.data ?? []).map((t) => [t.id, t.name]));
    const map = new Map<string, string[]>();
    for (const l of links.data ?? []) {
      const name = names.get(l.dietary_tag_id);
      if (!name) continue;
      map.set(l.order_id, [...(map.get(l.order_id) ?? []), name]);
    }
    return map;
  }, [tags.data, links.data]);
  return (orderId) => byOrder.get(orderId) ?? [];
}

export function DietaryChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <>
      {names.map((n) => (
        <span
          key={n}
          className="label-caps border border-border px-1 py-0 text-[10px] text-muted-foreground"
        >
          {n}
        </span>
      ))}
    </>
  );
}
