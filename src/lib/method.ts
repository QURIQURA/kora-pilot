/**
 * METHOD 공용 타입/헬퍼.
 * Technique Category = "무슨 기법군인가", Method = "그 기법을 어떤 방식/원리로 구현했는가".
 * Method는 특정 technique_category_id에 종속된다 (예: "공립법"은 Foam Cake 전용).
 */
import type { Tables } from "@/integrations/supabase/types";

export type Method = Tables<"methods">;

/** 표시 라벨 — 한글 우선, 영문은 보조 */
export function methodLabel(m: Method): string {
  return m.name_en ? `${m.name} (${m.name_en})` : m.name;
}

/** 특정 technique_category_id에 속한 Method만 필터링 (정렬 포함) */
export function methodsForTechnique(
  list: Method[],
  techniqueCategoryId: string | null | undefined,
): Method[] {
  if (!techniqueCategoryId) return [];
  return list
    .filter((m) => m.technique_category_id === techniqueCategoryId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
