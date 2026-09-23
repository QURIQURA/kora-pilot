/**
 * PILOT — FORMULA 도메인 헬퍼
 * 배합 데이터는 formulas가 아니라 formula_versions에 속한다.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Mould = Tables<"moulds">;
export type Formula = Tables<"formulas">;
export type FormulaVersion = Tables<"formula_versions">;
export type FormulaVersionIngredient = Tables<"formula_version_ingredients">;
export type FormulaVersionBatch = Tables<"formula_version_batches">;

export const FORMULA_STATUSES = [
  "DRAFT",
  "TESTING",
  "CURRENT",
  "SUPERSEDED",
  "ARCHIVED",
] as const;

export type FormulaStatus = (typeof FORMULA_STATUSES)[number];

/** DRAFT 외의 상태는 기본 잠금(읽기 전용) */
export function isLockedStatus(status: FormulaStatus | string): boolean {
  return status !== "DRAFT";
}

export function versionLabel(versionNumber: number): string {
  return `V${versionNumber}`;
}

/**
 * 원가 계산용 "적용 버전" 선택 규칙 (2026-09-24, 사용자 확정): CURRENT가 있으면 그걸 쓰고,
 * 없으면(개발 중이라 아직 CURRENT로 승격 안 한 경우) ARCHIVED/SUPERSEDED를 제외한 버전 중
 * version_number가 가장 높은 것(최신 DRAFT/TESTING)을 대신 쓴다.
 */
export function pickEffectiveFormulaVersion<T extends { status: string; version_number: number }>(
  versions: T[],
): T | null {
  if (versions.length === 0) return null;
  const current = versions.find((v) => v.status === "CURRENT");
  if (current) return current;
  const usable = versions.filter((v) => v.status !== "ARCHIVED" && v.status !== "SUPERSEDED");
  if (usable.length === 0) return null;
  return usable.reduce((best, v) => (v.version_number > best.version_number ? v : best));
}

export const UNITS = ["g", "kg", "ml", "l", "ea", "%"] as const;

/** 숫자 포맷 — 불필요한 소수점 제거 */
export function fmtNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function parseNumber(input: string): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

/** 그램 환산 (무게 단위만 합산 대상) */
export function toGrams(amount: number, unit: string): number | null {
  switch (unit) {
    case "g":
      return amount;
    case "kg":
      return amount * 1000;
    case "ml":
      return amount; // 1ml ≈ 1g 근사
    case "l":
      return amount * 1000;
    default:
      return null;
  }
}

export interface DiffRow {
  name: string;
  from: string | null;
  to: string | null;
}

/** 두 버전의 배합 차이 */
export function diffIngredients(
  a: { name: string; amount: number; unit: string }[],
  b: { name: string; amount: number; unit: string }[]
): DiffRow[] {
  const keys = Array.from(
    new Set([...a.map((r) => r.name), ...b.map((r) => r.name)])
  ).sort();
  const rows: DiffRow[] = [];
  for (const name of keys) {
    const left = a.find((r) => r.name === name);
    const right = b.find((r) => r.name === name);
    const from = left ? `${fmtNumber(left.amount, 2)}${left.unit}` : null;
    const to = right ? `${fmtNumber(right.amount, 2)}${right.unit}` : null;
    if (from !== to) rows.push({ name, from, to });
  }
  return rows;
}
