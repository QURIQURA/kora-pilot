import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { newPopupPlan, readPopupPlan, validatePopupPlan, removePopupCategory } =
  await loadTs("src/lib/popup.ts");
const { readPopupStages, validatePopupStages, popupStageLabel } = await loadTs(
  "src/lib/popup-workflow.ts",
);
test("legacy popups receive display defaults without rewriting IDs or completion", () => {
  const check = { id: "checked", group: "PACKAGING", label: "Boxes", done: true };
  const old = { title: "Old", items: [], checklist: [check] };
  const p = readPopupPlan(old);
  assert.equal(p.check_categories.length, 4);
  assert.deepEqual(p.checklist, [check]);
  assert.equal(old.check_categories, undefined);
  assert.equal(popupStageLabel(p, "COMPLETED", readPopupStages(null)), "완료");
});
test("custom categories rename and remove by transferring items, preserving completion", () => {
  const p = newPopupPlan();
  p.check_categories.push({ id: "custom", label: "운반" });
  p.checklist.push({ id: "transport", group: "custom", label: "Cooler", done: true });
  assert.equal(validatePopupPlan(p), null);
  p.check_categories.find((c) => c.id === "custom").label = "운반 준비";
  assert.equal(p.checklist.at(-1).group, "custom");
  assert.throws(() => removePopupCategory(p, "custom"));
  assert.throws(() => removePopupCategory(p, "custom", "custom"));
  const moved = removePopupCategory(p, "custom", "PACKAGING");
  assert.deepEqual(moved.checklist.at(-1), {
    id: "transport",
    group: "PACKAGING",
    label: "Cooler",
    done: true,
  });
  assert.equal(p.checklist.at(-1).group, "custom");
  assert.equal(validatePopupPlan(moved), null);
});
test("category validation rejects duplicate labels and dangling items; explicit empty categories remain empty", () => {
  const p = newPopupPlan();
  p.check_categories.push({ id: "dupe", label: " 주문 확인 " });
  assert.ok(validatePopupPlan(p));
  p.check_categories.pop();
  p.checklist[0].group = "deleted";
  assert.ok(validatePopupPlan(p));
  const empty = readPopupPlan({ title: "Empty", items: [], checklist: [], check_categories: [] });
  assert.equal(empty.check_categories.length, 0);
  assert.equal(validatePopupPlan(empty), null);
});
test("SNL workflow accepts custom active steps and keeps a terminal completion step", () => {
  const steps = readPopupStages(null);
  steps.splice(1, 0, { id: "COOLING", label: "냉장 준비" });
  assert.equal(validatePopupStages(steps), null);
  assert.equal(popupStageLabel({ stage_id: "COOLING" }, "PRODUCTION", steps), "냉장 준비");
  steps[1].label = steps[0].label;
  assert.ok(validatePopupStages(steps));
  assert.ok(validatePopupStages(steps.filter((s) => s.id !== "COMPLETED")));
});
