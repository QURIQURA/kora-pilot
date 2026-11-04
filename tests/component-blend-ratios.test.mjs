import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { adjustBlendPercentages, readBlendSources } = await loadTs("src/lib/component-blend.ts");
test("two-source decimal input preserves the edited value and complements to 100", () => {
  assert.deepEqual(adjustBlendPercentages([200 / 7, 500 / 7], 0, 37.125), [37.125, 62.875]);
  assert.deepEqual(adjustBlendPercentages([30, 70], 1, 100), [0, 100]);
});
test("multiple-source edits preserve other ratios, including recovery from zero", () => {
  assert.deepEqual(adjustBlendPercentages([20, 30, 50], 0, 60), [60, 15, 25]);
  assert.deepEqual(adjustBlendPercentages([100, 0, 0], 0, 40), [40, 30, 30]);
  for (let i = 0; i < 20; i++) {
    const result = adjustBlendPercentages(Array(20).fill(5), i, 33.3333);
    assert.ok(Math.abs(result.reduce((s, n) => s + n, 0) - 100) < 1e-10);
    assert.equal(result[i], 33.3333);
    assert.ok(result.every((n) => n >= 0));
  }
});
test("invalid percentages are rejected and zero-weight sources remain adjustable", () => {
  for (const value of [-1, 101, NaN, Infinity])
    assert.throws(() => adjustBlendPercentages([30, 70], 0, value));
  assert.throws(() => adjustBlendPercentages([30, 70], 2, 50));
  const source = {
    component_name: "A",
    formula_id: "f",
    version_id: "v",
    amount_g: 0,
    base_weight_g: 100,
  };
  assert.equal(readBlendSources([source]).length, 1);
});
