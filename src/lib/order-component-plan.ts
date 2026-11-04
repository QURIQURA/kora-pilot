export function parseComponentPlan(
  multiplier: string,
  target: string,
  existingMultiplier?: number,
) {
  const batches = Number(multiplier);
  const grams = target.trim() ? Number(target) : null;
  if (
    !Number.isFinite(batches) ||
    batches <= 0 ||
    ((!Number.isInteger(batches) || batches < 1) && batches !== existingMultiplier)
  )
    throw new Error("생산 배수는 1 이상의 정수로 입력하세요");
  if (grams !== null && (!Number.isFinite(grams) || grams < 0))
    throw new Error("사용 목표는 0 이상의 g 값으로 입력하세요");
  return { multiplier: batches, target_quantity_g: grams };
}

/** Missing demand is unknown, never silently zero. Merge changes production, not demand. */
export function productionDemandSummary(
  rows: { multiplier: number; target_quantity_g: number | null }[],
  baseGrams: number,
) {
  const production = baseGrams * rows.reduce((sum, row) => sum + Number(row.multiplier), 0);
  const known = rows.reduce((sum, row) => sum + (row.target_quantity_g ?? 0), 0);
  const complete =
    rows.length > 0 &&
    rows.every((row) => row.target_quantity_g !== null && row.target_quantity_g !== undefined);
  return {
    production,
    required: complete ? known : null,
    remaining: complete ? production - known : null,
  };
}
