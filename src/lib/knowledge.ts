/**
 * PILOT — KNOWLEDGE 도메인 헬퍼
 * 실험 1건에 종속되지 않는 누적 원칙/노하우. product_id/component_id/ingredient_id/
 * technique_category_id는 전부 선택적이며 동시에 여러 개 채워질 수 있다.
 * 전부 null이면 "일반 원칙"으로 KNOWLEDGE 탭 전체 목록에서만 보인다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type KnowledgeEntry = Tables<"knowledge_entries">;

/** 연결된 엔티티가 하나도 없으면 "일반 원칙" */
export function isGeneralKnowledge(entry: KnowledgeEntry): boolean {
  return (
    !entry.product_id && !entry.component_id && !entry.ingredient_id && !entry.technique_category_id
  );
}

/** 연결된 엔티티 개수 (배지/필터 표시용) */
export function linkedEntityCount(entry: KnowledgeEntry): number {
  return [
    entry.product_id,
    entry.component_id,
    entry.ingredient_id,
    entry.technique_category_id,
  ].filter(Boolean).length;
}
