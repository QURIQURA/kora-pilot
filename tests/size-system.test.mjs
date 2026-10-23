import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./load-ts.mjs";
const usage = await loadTs("src/lib/product-usage.ts");
const sizes = await loadTs("src/lib/size-configuration.ts");
const cost = await loadTs("src/lib/cost.ts");
const efficiency = await loadTs("src/lib/production-efficiency.ts");
const round = { shape: "ROUND", diameter_mm: 200, width_mm: null, length_mm: null, height_mm: 100 };
const standard = { ...round, id: "standard-a", name: "8 inch" };
const productSize = { ...round, id: "size-a", product_id: "product-a", cake_size_id: standard.id };
const row = (extra = {}) => ({
  component_id: "cream",
  formula_version_id: "v1",
  ingredient_id: null,
  product_size_id: null,
  quantity_g: 800,
  ingredients: null,
  ...extra,
});

test("specific component group replaces common usage while other components inherit", () => {
  const rows = [
    row(),
    row({ product_size_id: "size-a", formula_version_id: "v2", quantity_g: 450 }),
    row({ component_id: "sheet", quantity_g: 680 }),
    row({ product_size_id: "other", quantity_g: 1250 }),
  ];
  assert.deepEqual(
    usage.resolveProductUsage(rows, "size-a").map((r) => r.quantity_g),
    [450, 680],
  );
  assert.deepEqual(
    usage.resolveProductUsage(rows, "unknown").map((r) => r.quantity_g),
    [800, 680],
  );
});
test("filling and icing rows sharing a version sum consistently for cost and production", () => {
  const rows = [row({ quantity_g: 800 }), row({ quantity_g: 350 })];
  const summary = usage.summarizeUsage(rows, "size-a", (r) => r.quantity_g * 0.01);
  assert.equal(summary.grams, 1150);
  assert.equal(summary.cost, 11.5);
  assert.deepEqual(efficiency.buildGramsPerUnitMap(rows, "size-a"), { v1: 1150 });
});
test("unknown override quantity stays unknown and never falls back to common weight", () => {
  const rows = [row(), row({ product_size_id: "size-a", quantity_g: null })];
  assert.equal(usage.summarizeUsage(rows, "size-a", () => null).cost, null);
  assert.equal(usage.summarizeUsage(rows, "size-a", () => null).grams, null);
  assert.deepEqual(usage.gramsByFormula(rows, "size-a"), {});
  assert.equal(usage.summarizeUsage([], "size-a", () => 0).complete, false);
});
test("cost uses the pinned version and rejects missing prices or a foreign component", () => {
  const versions = {
    v1: { componentId: "cream", costPerGram: 0.01, hasMissingPrice: false },
    v2: { componentId: "cream", costPerGram: 0.02, hasMissingPrice: false },
  };
  assert.equal(cost.productUsageCost(row(), versions), 8);
  assert.equal(cost.productUsageCost(row({ formula_version_id: "missing" }), versions), null);
  assert.equal(cost.productUsageCost(row({ component_id: "foreign" }), versions), null);
  assert.equal(
    cost.productUsageCost(row(), { v1: { ...versions.v1, hasMissingPrice: true } }),
    null,
  );
  assert.equal(cost.productUsageCost(row({ quantity_g: null }), versions), null);
  assert.equal(
    cost.productUsageCost(
      row({
        component_id: null,
        ingredients: { purchase_price: 10, purchase_qty: 1, purchase_unit: "kg" },
        quantity_g: 100,
      }),
      versions,
    ),
    1,
  );
});
test("input grams normalize kg and refuse unknown count conversions", () => {
  assert.equal(
    usage.sumInputGrams([
      { amount: 1, unit: "kg" },
      { amount: 500, unit: "g" },
    ]),
    1500,
  );
  assert.equal(usage.sumInputGrams([{ amount: 2, unit: "ea" }]), null);
  assert.equal(usage.sumInputGrams([{ amount: -1, unit: "g" }]), null);
});
test("links use IDs and actual dimensions, never matching names or inch labels", () => {
  assert.equal(
    sizes.selectionIssue("product-a", "size-a", "standard-a", productSize, standard),
    null,
  );
  assert.ok(
    sizes.selectionIssue("product-a", "size-a", "same-name-other-id", productSize, {
      ...standard,
      id: "same-name-other-id",
    }),
  );
  assert.ok(sizes.selectionIssue("foreign", "size-a", "standard-a", productSize, standard));
  assert.ok(
    sizes.selectionIssue("product-a", "size-a", "standard-a", productSize, {
      ...standard,
      diameter_mm: 250,
    }),
  );
  assert.equal(sizes.completeGeometry({ ...round, shape: "SQUARE", diameter_mm: 250 }), null);
  assert.equal(
    sizes.sameGeometry(
      { ...round, shape: "SQUARE", width_mm: 200, length_mm: 200 },
      { ...round, shape: "RECTANGLE", width_mm: 200, length_mm: 200 },
    ),
    true,
  );
  assert.equal(
    sizes.selectionIssue(
      "product-a",
      "size-a",
      null,
      { ...productSize, cake_size_id: null },
      undefined,
    ),
    null,
  );
  assert.equal(
    sizes.selectionIssue("legacy-cacao", null, "legacy-standard", undefined, undefined),
    null,
  );
});

// Exercise the real session creation function with a strict, in-memory Supabase boundary.
const state = { existing: [], order: null, size: productSize, standard, inserted: [], calls: [] };
globalThis.__sizeSystemDb = state;
const work = await loadTs("src/lib/work-session.ts", {
  "@/integrations/supabase/client": `export const supabase = { from(table) { const state = globalThis.__sizeSystemDb; state.calls.push(table); let inserted = false; const q = { select() {return q}, eq() {return q}, order() {return q}, limit() {return q}, insert(payload) {state.inserted.push(payload); inserted=true; return q}, single() {return q}, then(resolve) { const data = inserted ? {id:'new-session'} : table==='work_sessions' ? state.existing : table==='orders' ? state.order : table==='product_sizes' ? state.size : state.standard; return Promise.resolve({data,error:null}).then(resolve); } }; return q; } };`,
  "@/lib/datetime": "export const generateTitle = name => name;",
  "@/lib/pilot": "export const ingredientDisplayName = item => item?.name ?? '';",
});
function reset() {
  state.existing = [];
  state.inserted = [];
  state.calls = [];
  state.size = productSize;
  state.order = {
    id: "order-a",
    user_id: "fixture-user",
    product_id: "product-a",
    product_size_id: "size-a",
    cake_size_id: "standard-a",
    quantity: 3,
    products: { name: "Fixture" },
  };
}
test("existing session IDs return without writes or remapping legacy data", async () => {
  reset();
  state.existing = [{ id: "existing-session" }];
  assert.equal(await work.ensureWorkSessionForOrder("order-a"), "existing-session");
  assert.deepEqual(state.calls, ["work_sessions"]);
  assert.equal(state.inserted.length, 0);
});
test("new session preserves exact order links and carries the ordered quantity", async () => {
  reset();
  assert.equal(await work.ensureWorkSessionForOrder("order-a"), "new-session");
  assert.equal(state.inserted[0].product_size_id, "size-a");
  assert.equal(state.inserted[0].cake_size_id, "standard-a");
  assert.equal(state.inserted[0].target_unit_count, 3);
});
test("legacy Cacao without product size stays unmapped when creating a session", async () => {
  reset();
  state.order.product_id = "legacy-cacao";
  state.order.product_size_id = null;
  await work.ensureWorkSessionForOrder("order-a");
  assert.equal(state.inserted[0].product_size_id, null);
  assert.ok(!state.calls.includes("product_sizes"));
});
test("mismatched geometry blocks a new session without writing", async () => {
  reset();
  state.size = { ...productSize, diameter_mm: 250 };
  await assert.rejects(work.ensureWorkSessionForOrder("order-a"));
  assert.equal(state.inserted.length, 0);
});
test("production target converts a gram total into a fractional recipe multiplier", () => {
  assert.equal(work.suggestedMultiplierFromTarget(800, 3, 1500), 1.6);
  assert.equal(
    work.sumBaseGrams([
      { amount: 1, unit: "kg" },
      { amount: 500, unit: "g" },
    ]),
    1500,
  );
  assert.equal(work.sumBaseGrams([{ amount: 2, unit: "ea" }]), 0);
});
