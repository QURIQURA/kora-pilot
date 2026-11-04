import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { flattenBlend, blendBaseWeight } = await loadTs("src/lib/component-blend.ts");

test("shared ingredients merge, kg converts, and target weights are conserved", () => {
  const result = flattenBlend([
    {
      amount_g: 300,
      ingredients: [
        { ingredient_id: "cream", amount: 0.1, unit: "kg" },
        { ingredient_id: "yogurt", amount: 100, unit: "g" },
      ],
    },
    {
      amount_g: 100,
      ingredients: [
        { ingredient_id: "cream", amount: 50, unit: "g" },
        { ingredient_id: "butter", amount: 50, unit: "g" },
      ],
    },
  ]);
  assert.equal(result.find((r) => r.ingredient_id === "cream").amount, 200);
  assert.equal(
    result.reduce((sum, r) => sum + r.amount, 0),
    400,
  );
});
test("cream cheese 250g recipe preserves 1:1:1 ganache and every ingredient", () => {
  const rows = flattenBlend([
    {
      amount_g: 1000,
      ingredients: ["yogurt", "chocolate", "cream"].map((ingredient_id) => ({
        ingredient_id,
        amount: 100,
        unit: "g",
      })),
    },
    {
      amount_g: 1540 / 3,
      ingredients: [
        ["cheese", 75],
        ["butter", 60],
        ["sugar", 15],
        ["milk", 3],
        ["meringue", 1],
      ].map(([ingredient_id, amount]) => ({ ingredient_id, amount, unit: "g" })),
    },
  ]);
  assert.ok(Math.abs(rows.find((r) => r.ingredient_id === "cheese").amount - 250) < 1e-9);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.amount, 0) - 4540 / 3) < 1e-9);
});
test("ambiguous volumes/counts and invalid weights are rejected", () => {
  for (const unit of ["ml", "l", "ea", "%"])
    assert.throws(() => blendBaseWeight([{ ingredient_id: "x", amount: 1, unit }]));
  for (const amount_g of [0, -1, NaN, Infinity])
    assert.throws(() =>
      flattenBlend([{ amount_g, ingredients: [{ ingredient_id: "x", amount: 10, unit: "g" }] }]),
    );
  assert.throws(() => flattenBlend([{ amount_g: 1, ingredients: [] }]));
});
