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

/** "Floral, Spice; Mint" 같은 자유 텍스트를 항목으로 나눈다 */
export function splitFlavours(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[,;\n、]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** 정보별 영역 구분 — DIETARY(초록 상자) / LEAST LIKED(빨강 상자). 오더 카드·대시보드 공용. */
export const dietaryBoxClass =
  "border-emerald-600/60 bg-emerald-50 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-950/40 dark:text-emerald-100";
export const leastLikedBoxClass =
  "border-rose-600/60 bg-rose-50 text-rose-900 dark:border-rose-400/50 dark:bg-rose-950/40 dark:text-rose-100";

export function OrderFlagBoxes({
  dietary,
  leastLiked,
}: {
  dietary: string[];
  leastLiked: string | null | undefined;
}) {
  const disliked = splitFlavours(leastLiked);
  if (dietary.length === 0 && disliked.length === 0) return null;
  const box = (label: string, items: string[], cls: string) => (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border px-1.5 py-0.5 ${cls}`}
    >
      <span className="label-caps text-[9px] font-semibold opacity-70">{label}</span>
      {items.map((n) => (
        <span key={n} className="text-[11px]">
          {n}
        </span>
      ))}
    </span>
  );
  return (
    <>
      {dietary.length > 0 && box("DIETARY", dietary, dietaryBoxClass)}
      {disliked.length > 0 && box("LEAST LIKED", disliked, leastLikedBoxClass)}
    </>
  );
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

/** 복사만 하고 레시피를 아직 수정하지 않은 컴포넌트 경고 — 레시피 수정 우선 */
export function CopyWarning({ formulaId }: { formulaId?: string | null }) {
  const badge = (
    <span
      title="복사만 한 컴포넌트예요 — 레시피를 먼저 수정하세요"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-destructive font-mono text-[11px] font-bold leading-none text-white"
    >
      !
    </span>
  );
  if (!formulaId) return badge;
  return (
    <a
      href={`/formulas/${formulaId}`}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0"
      title="복사만 한 컴포넌트예요 — 눌러서 레시피를 수정하세요"
    >
      {badge}
    </a>
  );
}
