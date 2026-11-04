import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { parseComponentPlan, productionDemandSummary } = await loadTs(
  "src/lib/order-component-plan.ts",
);

test("order demand and production batches remain independent", () => {
  const row = parseComponentPlan("2", "500");
  assert.deepEqual(productionDemandSummary([row], 342.5), {
    production: 685,
    required: 500,
    remaining: 185,
  });
  assert.deepEqual(productionDemandSummary([{ ...row, multiplier: 4 }], 342.5), {
    production: 1370,
    required: 500,
    remaining: 870,
  });
});
test("merged orders sum demand without treating unknown as zero", () => {
  assert.deepEqual(
    productionDemandSummary(
      [
        { multiplier: 2, target_quantity_g: 500 },
        { multiplier: 2, target_quantity_g: 600 },
      ],
      342.5,
    ),
    { production: 1370, required: 1100, remaining: 270 },
  );
  assert.equal(
    productionDemandSummary([{ multiplier: 2, target_quantity_g: null }], 342.5).remaining,
    null,
  );
  assert.equal(
    productionDemandSummary([{ multiplier: 1, target_quantity_g: 500 }], 342.5).remaining,
    -157.5,
  );
});
test("positive integer entry, blank demand, zero demand, and legacy merge allocations", () => {
  assert.deepEqual(parseComponentPlan("1", ""), { multiplier: 1, target_quantity_g: null });
  assert.equal(parseComponentPlan("1", "0").target_quantity_g, 0);
  for (const n of ["0", "-1", "1.5", "Infinity", "NaN", ""])
    assert.throws(() => parseComponentPlan(n, "100"));
  for (const n of ["-1", "Infinity", "NaN"]) assert.throws(() => parseComponentPlan("1", n));
  assert.equal(parseComponentPlan("0.5", "100", 0.5).multiplier, 0.5);
  assert.throws(() => parseComponentPlan("0.75", "100", 0.5));
});
