/**
 * PILOT — REFERENCES 도메인 헬퍼
 * 책/영상/아티클/웹사이트 등 외부 참고자료. 연결 패턴은 KNOWLEDGE(@/lib/knowledge)와 동일.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ReferenceEntry = Tables<"reference_entries">;

export const REFERENCE_SOURCE_TYPES = ["BOOK", "VIDEO", "ARTICLE", "WEBSITE", "OTHER"] as const;

export type ReferenceSourceType = (typeof REFERENCE_SOURCE_TYPES)[number];

/** 연결된 엔티티가 하나도 없으면 "일반 참고자료" */
export function isGeneralReference(entry: ReferenceEntry): boolean {
  return (
    !entry.product_id && !entry.component_id && !entry.ingredient_id && !entry.technique_category_id
  );
}
