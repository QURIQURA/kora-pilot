/** Shared scope rule for costing, production targets and efficiency. No writes. */
export interface UsageScope {
  id?: string;
  component_id?: string | null;
  ingredient_id?: string | null;
  formula_version_id?: string | null;
  product_size_id: string | null;
  quantity_g: number | null;
}

const keyFor = (row: UsageScope, index: number) =>
  row.component_id
    ? `component:${row.component_id}`
    : row.ingredient_id
      ? `ingredient:${row.ingredient_id}`
      : row.formula_version_id
        ? `formula:${row.formula_version_id}`
        : `row:${row.id ?? index}`;

/** A scoped group replaces the common group. Sum all rows inside the chosen group. */
export function resolveProductUsage<T extends UsageScope>(rows: T[], sizeId: string | null): T[] {
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const key = keyFor(row, index);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].flatMap((group) => {
    const scoped = sizeId ? group.filter((r) => r.product_size_id === sizeId) : [];
    return scoped.length ? scoped : group.filter((r) => r.product_size_id == null);
  });
}

export function summarizeUsage<T extends UsageScope>(
  rows: T[],
  sizeId: string | null,
  rowCost: (row: T) => number | null,
) {
  const selected = resolveProductUsage(rows, sizeId);
  const gramsKnown = selected.reduce((n, r) => n + (r.quantity_g ?? 0), 0);
  const costs = selected.map(rowCost);
  const weightComplete =
    selected.length > 0 &&
    selected.every(
      (r) => r.quantity_g != null && Number.isFinite(r.quantity_g) && r.quantity_g >= 0,
    );
  const costComplete = weightComplete && costs.every((c) => c != null && Number.isFinite(c));
  return {
    rows: selected,
    grams: weightComplete ? gramsKnown : null,
    knownCost: costs.reduce<number>((sum, c) => sum + (c ?? 0), 0),
    cost: costComplete ? costs.reduce<number>((sum, c) => sum + (c ?? 0), 0) : null,
    complete: costComplete,
  };
}

export function gramsByFormula(rows: UsageScope[], sizeId: string | null): Record<string, number> {
  const map: Record<string, number> = {};
  const unknown = new Set<string>();
  for (const row of resolveProductUsage(rows, sizeId)) {
    if (!row.formula_version_id) continue;
    if (row.quantity_g == null || !Number.isFinite(row.quantity_g) || row.quantity_g < 0) {
      unknown.add(row.formula_version_id);
      continue;
    }
    map[row.formula_version_id] = (map[row.formula_version_id] ?? 0) + row.quantity_g;
  }
  for (const id of unknown) delete map[id];
  return map;
}

/** Normalize weight units. ml/l retain the existing approximate conversion; no conversion for ea/%. */
export function sumInputGrams(rows: { amount: number; unit: string }[]): number | null {
  let total = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.amount) || row.amount < 0) return null;
    const factor =
      row.unit === "g" || row.unit === "ml"
        ? 1
        : row.unit === "kg" || row.unit === "l"
          ? 1000
          : null;
    if (factor == null && row.amount > 0) return null;
    total += row.amount * (factor ?? 0);
  }
  return total;
}
