import { mmToCm } from "@/lib/product-size";

/** 라운드/스퀘어 사이즈 드롭다운: 4~12인치 */
export const CAKE_SIZE_INCHES = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const CAKE_SIZE_SHAPES = ["ROUND", "SQUARE", "RECTANGLE"] as const;
export type CakeSizeShape = (typeof CAKE_SIZE_SHAPES)[number];

const SHAPE_LABEL: Record<CakeSizeShape, string> = {
  ROUND: "Round",
  SQUARE: "Square",
  RECTANGLE: "Rectangle",
};

const fmtCm = (mm: number | string | null | undefined): string | null => {
  if (mm == null || mm === "") return null;
  const cm = Math.round(mmToCm(Number(mm)) * 10) / 10;
  return String(cm);
};

/**
 * 2026-10-20 사용자 요청: 이름은 "사이즈 + 모양 + 높이"로 자동 구성.
 * - ROUND/SQUARE: `8" Round 10cm`
 * - RECTANGLE: `Rectangle 20×30×8cm` (가로×세로×높이)
 */
export function buildCakeSizeName(row: {
  shape: string | null;
  size_inch: number | null;
  length_mm: number | string | null;
  width_mm: number | string | null;
  height_mm: number | string | null;
}): string {
  const shape = row.shape as CakeSizeShape | null;
  const h = fmtCm(row.height_mm);
  if (shape === "RECTANGLE") {
    const dims = [fmtCm(row.length_mm), fmtCm(row.width_mm), h].map((d) => d ?? "?").join("×");
    return `Rectangle ${dims}cm`;
  }
  const parts: string[] = [];
  if (row.size_inch != null) parts.push(`${row.size_inch}"`);
  if (shape) parts.push(SHAPE_LABEL[shape]);
  if (h) parts.push(`${h}cm`);
  return parts.join(" ") || "New size";
}
