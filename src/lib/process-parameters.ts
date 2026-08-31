/**
 * PILOT — PROCESS PARAMETERS 도메인 헬퍼
 * 마스터 데이터(process_parameter_definitions) + 링크 테이블(process_event_parameters) 패턴.
 * sensory.ts(SENSORY ATTRIBUTES)와 동일한 구조 — 자세한 설계 배경은 CHANGELOG 참고.
 * process_events(action/note/timeline)는 이 구조와 완전히 별개이며 변경되지 않는다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ProcessParameterDefinition = Tables<"process_parameter_definitions">;
export type ProcessEventParameter = Tables<"process_event_parameters">;

export const PROCESS_PARAMETER_VALUE_TYPES = ["NUMERIC", "TEXT", "BOOLEAN"] as const;
export type ProcessParameterValueType = (typeof PROCESS_PARAMETER_VALUE_TYPES)[number];

export function isProcessParameterValueType(value: string): value is ProcessParameterValueType {
  return (PROCESS_PARAMETER_VALUE_TYPES as readonly string[]).includes(value);
}

/** 입력 폼 등에 보여줄 라벨. unit이 있으면 괄호로 덧붙인다. */
export function definitionLabel(def: ProcessParameterDefinition): string {
  return def.unit ? `${def.label} (${def.unit})` : def.label;
}

/** 이 definition이 특정 process_category에서 선택 가능한지 — category_id가 null이면 모든 카테고리 공통 */
export function definitionAppliesToCategory(
  def: ProcessParameterDefinition,
  categoryId: string | null,
): boolean {
  if (def.process_category_id === null) return true;
  return def.process_category_id === categoryId;
}

/** category별로 그룹핑하지 않고, 특정 category(또는 공통)에 해당하는 definition만 정렬해서 반환 */
export function definitionsForCategory(
  definitions: ProcessParameterDefinition[],
  categoryId: string | null,
): ProcessParameterDefinition[] {
  return definitions
    .filter((d) => definitionAppliesToCategory(d, categoryId))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** process_event_parameters row에서 value_type에 맞는 값 하나만 꺼낸다 (없으면 null) */
export function parameterValue(
  row: Pick<ProcessEventParameter, "value_numeric" | "value_text" | "value_boolean">,
): number | string | boolean | null {
  if (row.value_numeric !== null) return row.value_numeric;
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean;
  return null;
}
