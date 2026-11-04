import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { newPopupPlan, validatePopupPlan, readPopupPlan } = await loadTs("src/lib/popup.ts");
test("new popup has independent preparation checks and no fabricated production", () => {
  const a = newPopupPlan(),
    b = newPopupPlan();
  assert.equal(a.items.length, 0);
  assert.equal(a.checklist.length, 3);
  assert.ok(a.checklist.every((c) => !c.done));
  assert.notEqual(a.checklist[0].id, b.checklist[0].id);
  assert.equal(validatePopupPlan(a), null);
});
test("multiple production items preserve individual counts and units", () => {
  const p = newPopupPlan();
  p.items = [
    {
      id: "one",
      label: "Profiteroles",
      quantity: 200,
      ready_quantity: 150,
      unit: "個",
      product_id: "",
      standard_id: "",
      work_session_id: "",
    },
    {
      id: "two",
      label: "Weekly cake",
      quantity: 4,
      ready_quantity: 2,
      unit: "cakes",
      product_id: "p",
      standard_id: "s",
      work_session_id: "",
    },
  ];
  assert.equal(validatePopupPlan(p), null);
  assert.deepEqual(readPopupPlan(p), p);
  p.checklist[0].done = true;
  assert.equal(readPopupPlan(p).checklist.filter((c) => c.done).length, 1);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    p.items[0].quantity = quantity;
    assert.ok(validatePopupPlan(p));
  }
});
test("blank items, duplicate IDs and invalid checklist groups cannot be saved", () => {
  const p = newPopupPlan();
  p.checklist.push({ ...p.checklist[0] });
  assert.ok(validatePopupPlan(p));
  p.checklist.pop();
  p.checklist[0].label = " ";
  assert.ok(validatePopupPlan(p));
  assert.deepEqual(readPopupPlan(null).items, []);
});
