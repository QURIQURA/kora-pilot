/** Physical mould dimensions. DB: mm; input/display: cm. Never infer from a name. */
export interface MouldDimensions {
  diameter_mm?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
  height_mm?: number | null;
}

const positive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

export function mouldDimensionsMm(mould: MouldDimensions | null | undefined) {
  const diameter = positive(mould?.diameter_mm);
  return {
    width_mm: diameter ?? positive(mould?.width_mm),
    length_mm: diameter ?? positive(mould?.length_mm),
    height_mm: positive(mould?.height_mm),
  };
}

/** Outer footprint only. Does not subtract a centre tube or allow for tapered walls. */
export function mouldFootprintCm2(mould: MouldDimensions | null | undefined): number | null {
  const diameter = positive(mould?.diameter_mm);
  if (diameter != null) return Math.PI * (diameter / 20) ** 2;
  const { width_mm, length_mm } = mouldDimensionsMm(mould);
  return width_mm != null && length_mm != null ? (width_mm * length_mm) / 100 : null;
}

export function mmToCmInput(value: number | null | undefined): string {
  return value == null ? "" : String(value / 10);
}

/** Blank means unknown; an entered zero/negative/invalid value is an input error. */
export function cmInputToMm(value: string): number | null {
  if (!value.trim()) return null;
  const cm = Number(value);
  if (!Number.isFinite(cm) || cm <= 0) throw new Error("치수는 0보다 큰 cm 숫자로 입력하세요.");
  return Number((cm * 10).toFixed(6));
}

export function mouldDimensionInputs(mould: MouldDimensions | null | undefined) {
  const dims = mouldDimensionsMm(mould);
  return {
    width: mmToCmInput(dims.width_mm),
    length: mmToCmInput(dims.length_mm),
    height: mmToCmInput(dims.height_mm),
  };
}

export const MOULD_REFERENCE_SOURCE =
  "https://www.freee-foods.co.uk/gluten-free-baking-tips/conversion-tables/cake-tin-sizes/";

/** Common nominal metric sizes, not measurements of the user's pans. Height supplied by user. */
export const MOULD_REFERENCE_PRESETS = ([6, 8, 10] as const).flatMap((inch, index) => {
  const sideMm = [150, 200, 250][index]!;
  return (["ROUND", "SQUARE"] as const).map((shape) => ({
    key: `${shape}-${inch}`,
    inch,
    shape,
    name: `[참고] ${inch}" ${shape} · H10cm · 바닥분리형`,
    diameter_mm: shape === "ROUND" ? sideMm : null,
    width_mm: sideMm,
    length_mm: sideMm,
    height_mm: 100,
    notes: `명목 사이즈 참고값·실측 전. ${inch}인치≈${sideMm / 10}cm. 높이 10cm·바닥분리형은 사용자 지정. 외곽 면적이며 중앙 기둥·테이퍼 미반영. 반죽량·완성 케이크 치수로 자동 적용하지 않음. 출처: ${MOULD_REFERENCE_SOURCE}`,
  }));
});
