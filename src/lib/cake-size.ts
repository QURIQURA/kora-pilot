import { sizeAbbr } from "@/lib/size-label";

/** 라운드/스퀘어 사이즈 드롭다운: 4~12인치 */
export const CAKE_SIZE_INCHES = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const CAKE_SIZE_SHAPES = ["ROUND", "SQUARE", "RECTANGLE"] as const;
export type CakeSizeShape = (typeof CAKE_SIZE_SHAPES)[number];

/**
 * 사이즈 이름은 약어 체계(모양-사이즈-높이)로 자동 구성한다 — `Ø8″-H10`, `■6″-H5`, `▬30×20-H8`.
 * 자세한 규칙은 src/lib/size-label.ts.
 */
export function buildCakeSizeName(row: {
  shape: string | null;
  size_inch: number | null;
  length_mm: number | string | null;
  width_mm: number | string | null;
  height_mm: number | string | null;
}): string {
  if (!row.shape) return "New size";
  const n = (v: number | string | null) => (v == null || v === "" ? null : Number(v));
  return sizeAbbr({
    shape: row.shape,
    size_inch: row.size_inch,
    length_mm: n(row.length_mm),
    width_mm: n(row.width_mm),
    height_mm: n(row.height_mm),
  });
}
