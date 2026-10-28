import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { groupProductionSelections, rescaleProductionSelections } = await loadTs(
  "src/lib/production-quantity.ts",
);
const rows = [
  {
    id: "sandwich",
    formula_version_id: "cream-v1",
    multiplier: 2,
    slot: "CREAM",
    sessionId: "order-a",
  },
  {
    id: "sheet",
    formula_version_id: "sheet-v1",
    multiplier: 1,
    slot: "SHEET",
    sessionId: "order-a",
  },
  {
    id: "icing",
    formula_version_id: "cream-v1",
    multiplier: 1,
    slot: "FILLING",
    sessionId: "order-b",
  },
  {
    id: "new-recipe",
    formula_version_id: "cream-v2",
    multiplier: 4,
    slot: "CREAM",
    sessionId: "order-c",
  },
];
test("separate by selection until explicitly merged", () => {
  assert.deepEqual(
    groupProductionSelections(rows, new Set()).map((g) => g.multiplier),
    [2, 1, 1, 4],
  );
});
test("same version across orders/slots merges in first-occurrence order, preserving source IDs", () => {
  const before = structuredClone(rows);
  const groups = groupProductionSelections(rows, new Set(["cream-v1"]));
  assert.deepEqual(
    groups.map((g) => g.multiplier),
    [3, 1, 4],
  );
  assert.deepEqual(
    groups[0].members.map((m) => m.id),
    ["sandwich", "icing"],
  );
  assert.deepEqual(rows, before);
});
test("split timeline blocks cannot double quantity", () => {
  const groups = groupProductionSelections([...rows, rows[0]], new Set(["cream-v1"]));
  assert.equal(groups[0].multiplier, 3);
});
test("UNMERGE restores the individual selections with no recipe/progress mutations", () => {
  groupProductionSelections(rows, new Set(["cream-v1"]));
  assert.equal(groupProductionSelections(rows, new Set()).length, 4);
});
test("aggregate target scales original order allocations proportionally", () => {
  const plan = rescaleProductionSelections([rows[0], rows[2]], 6);
  assert.deepEqual(
    plan.map((p) => p.multiplier),
    [4, 2],
  );
  assert.equal(rows[0].multiplier, 2);
});
test("fractional target is conserved", () => {
  const plan = rescaleProductionSelections([rows[0], rows[2]], 1.23456789);
  assert.equal(
    plan.reduce((n, p) => n + p.multiplier, 0),
    1.23456789,
  );
});
test("reject invalid quantities and different versions", () => {
  for (const n of [0, -1, NaN, Infinity])
    assert.throws(() => rescaleProductionSelections([rows[0]], n));
  assert.throws(() => rescaleProductionSelections([rows[0], rows[3]], 1));
  assert.throws(() => rescaleProductionSelections([rows[0], rows[0]], 1));
  assert.throws(() => rescaleProductionSelections([], 1));
});
