export interface BlendIngredient {
  ingredient_id: string;
  amount: number;
  unit: string;
}

export interface BlendSource {
  component_id: string;
  component_name: string;
  formula_id: string;
  version_id: string;
  version_number: number;
  amount_g: number;
  base_weight_g: number;
  notes?: string | null;
}

/** Deliberately reject volume/count units: ml is not necessarily one gram. */
export function blendBaseWeight(rows: BlendIngredient[]): number {
  if (!rows.length) throw new Error("원본에 재료가 없습니다");
  return rows.reduce((sum, row) => {
    if (!["g", "kg"].includes(row.unit)) throw new Error("원본 재료를 g/kg으로 입력하세요");
    if (!Number.isFinite(row.amount) || row.amount < 0) throw new Error("원본 중량을 확인하세요");
    return sum + row.amount * (row.unit === "kg" ? 1000 : 1);
  }, 0);
}

export function flattenBlend(sources: { amount_g: number; ingredients: BlendIngredient[] }[]) {
  const totals = new Map<string, number>();
  for (const source of sources) {
    if (!Number.isFinite(source.amount_g) || source.amount_g <= 0)
      throw new Error("사용량은 0보다 큰 g 값이어야 합니다");
    const base = blendBaseWeight(source.ingredients);
    if (base <= 0) throw new Error("원본 총중량이 0입니다");
    for (const row of source.ingredients) {
      const grams = row.amount * (row.unit === "kg" ? 1000 : 1);
      totals.set(
        row.ingredient_id,
        (totals.get(row.ingredient_id) ?? 0) + (grams * source.amount_g) / base,
      );
    }
  }
  return [...totals].map(([ingredient_id, amount]) => ({ ingredient_id, amount, unit: "g" }));
}

export function readBlendSources(value: unknown): BlendSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is BlendSource =>
      s &&
      typeof s.component_name === "string" &&
      typeof s.formula_id === "string" &&
      typeof s.version_id === "string" &&
      Number.isFinite(s.amount_g) &&
      Number.isFinite(s.base_weight_g) &&
      s.amount_g > 0 &&
      s.base_weight_g > 0,
  );
}
