import type { Tables } from "@/integrations/supabase/types";

/**
 * PRODUCT SIZE / DIMENSION SYSTEM — 순수 계산/표시 헬퍼.
 * DB canonical unit은 mm, UI 기본 표시 단위는 cm.
 * Area/Volume은 DB에 저장하지 않고 read-time에 이 파일의 함수로 계산한다.
 */

export type ProductSizeShape = "ROUND" | "RECTANGLE";

export const PRODUCT_SIZE_SHAPES: ProductSizeShape[] = ["ROUND", "RECTANGLE"];

export type ProductSize = Tables<"product_sizes">;

/** mm → cm */
export function mmToCm(mm: number): number {
  return mm / 10;
}

/** cm → mm */
export function cmToMm(cm: number): number {
  return cm * 10;
}

/**
 * 원형 단면적 (cm²) = π × (지름cm/2)²
 */
export function areaCm2ForRound(diameterMm: number): number {
  const diameterCm = mmToCm(diameterMm);
  const radiusCm = diameterCm / 2;
  return Math.PI * radiusCm * radiusCm;
}

/**
 * 직사각형 단면적 (cm²) = 가로cm × 세로cm
 */
export function areaCm2ForRectangle(lengthMm: number, widthMm: number): number {
  return mmToCm(lengthMm) * mmToCm(widthMm);
}

/** 단면적(cm²) × 높이(cm) = 부피(cm³) */
export function volumeCm3FromArea(areaCm2: number, heightMm: number): number {
  return areaCm2 * mmToCm(heightMm);
}

export interface ProductSizeCalc {
  areaCm2: number;
  volumeCm3: number;
}

/**
 * shape + mm 치수로부터 Area(cm²)/Volume(cm³)를 계산한다.
 * shape에 필요한 치수가 없으면 null을 반환한다 (DB validate trigger가 보장하지만 UI 방어용).
 */
export function calcProductSize(size: {
  shape: string;
  diameter_mm: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
}): ProductSizeCalc | null {
  if (size.shape === "ROUND") {
    if (size.diameter_mm == null || size.height_mm == null) return null;
    const areaCm2 = areaCm2ForRound(size.diameter_mm);
    return { areaCm2, volumeCm3: volumeCm3FromArea(areaCm2, size.height_mm) };
  }
  if (size.shape === "RECTANGLE") {
    if (size.length_mm == null || size.width_mm == null || size.height_mm == null) return null;
    const areaCm2 = areaCm2ForRectangle(size.length_mm, size.width_mm);
    return { areaCm2, volumeCm3: volumeCm3FromArea(areaCm2, size.height_mm) };
  }
  return null;
}

/** 소수점 표시용 — 불필요한 trailing zero 제거, 최대 1자리 */
function formatNum(n: number): string {
  return Number(n.toFixed(1)).toString();
}

/**
 * 사람이 읽을 수 있는 사이즈 표기.
 * ROUND → "Ø15 × H3 cm"
 * RECTANGLE → "32 × 24 × H3 cm"
 */
export function formatProductSizeLabel(size: {
  shape: string;
  diameter_mm: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
}): string {
  if (size.shape === "ROUND") {
    const d = size.diameter_mm != null ? formatNum(mmToCm(size.diameter_mm)) : "?";
    const h = size.height_mm != null ? formatNum(mmToCm(size.height_mm)) : "?";
    return `Ø${d} × H${h} cm`;
  }
  if (size.shape === "RECTANGLE") {
    const l = size.length_mm != null ? formatNum(mmToCm(size.length_mm)) : "?";
    const w = size.width_mm != null ? formatNum(mmToCm(size.width_mm)) : "?";
    const h = size.height_mm != null ? formatNum(mmToCm(size.height_mm)) : "?";
    return `${l} × ${w} × H${h} cm`;
  }
  return size.shape;
}

export function formatAreaCm2(areaCm2: number): string {
  return `${formatNum(areaCm2)} cm²`;
}

export function formatVolumeCm3(volumeCm3: number): string {
  return `${formatNum(volumeCm3)} cm³`;
}
