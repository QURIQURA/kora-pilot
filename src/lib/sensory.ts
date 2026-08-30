/**
 * PILOT — SENSORY EVALUATION 도메인 헬퍼
 * sensory_attributes = Settings에서 관리하는 평가 속성 마스터 (Texture/Flavour/Appearance).
 * experiment_sensory_scores = 하나의 EXPERIMENT에 대한 속성별 점수.
 * Observation(자유 기록)과는 별개 — 이건 비교·집계를 위한 structured measurement (2026-08-30 P0 확정).
 */
import type { Tables } from "@/integrations/supabase/types";

export type SensoryAttribute = Tables<"sensory_attributes">;
export type SensoryScore = Tables<"experiment_sensory_scores">;

export const SENSORY_CATEGORIES = ["TEXTURE", "FLAVOUR", "APPEARANCE"] as const;
export type SensoryCategory = (typeof SENSORY_CATEGORIES)[number];

export const SENSORY_CATEGORY_LABELS: Record<SensoryCategory, string> = {
  TEXTURE: "TEXTURE — 조직감",
  FLAVOUR: "FLAVOUR — 풍미",
  APPEARANCE: "APPEARANCE — 외관",
};

export function isSensoryCategory(value: string): value is SensoryCategory {
  return (SENSORY_CATEGORIES as readonly string[]).includes(value);
}

export function attributeLabel(attribute: SensoryAttribute): string {
  return attribute.name_en ? `${attribute.name} (${attribute.name_en})` : attribute.name;
}

/** category별로 그룹핑, sort_order/name 순으로 정렬 */
export function groupAttributesByCategory(
  attributes: SensoryAttribute[],
): Map<SensoryCategory, SensoryAttribute[]> {
  const map = new Map<SensoryCategory, SensoryAttribute[]>();
  for (const category of SENSORY_CATEGORIES) map.set(category, []);
  for (const attribute of attributes) {
    const category = isSensoryCategory(attribute.category) ? attribute.category : null;
    if (!category) continue;
    map.get(category)!.push(attribute);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  return map;
}
