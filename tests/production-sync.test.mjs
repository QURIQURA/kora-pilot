import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { shouldHydrateDraftField, PRODUCTION_SYNC_QUERY_KEYS } = await loadTs(
  "src/lib/production-sync.ts",
);
test("remote formula change can hydrate an unchanged dropdown", () => {
  assert.equal(shouldHydrateDraftField("old-formula", "old-formula"), true);
});
test("remote notifications never overwrite a locally edited field", () => {
  assert.equal(shouldHydrateDraftField("saved note", "typing a new note"), false);
  assert.equal(shouldHydrateDraftField("old-formula", "locally selected formula"), false);
});
test("all affected cached views, including ingredient totals, are refreshed", () => {
  for (const key of [
    "orders",
    "work_sessions",
    "work_session_formula_versions",
    "work_session_tasks",
    "dashboard_components",
    "work_blocks",
    "formula_version_ingredients_bulk",
  ])
    assert.ok(PRODUCTION_SYNC_QUERY_KEYS.includes(key));
});
