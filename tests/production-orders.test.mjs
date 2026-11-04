import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { buildProductionOrderCards } = await loadTs("src/lib/production-orders.ts");
const order = (id, status = "INTAKE") => ({
  id,
  order_number: id,
  status,
  pickup_at: null,
  event_date: null,
});
test("new orders remain visible without sessions or components", () => {
  const rows = buildProductionOrderCards(
    [order("new"), order("ready"), order("done", "COMPLETED")],
    [{ order: { id: "ready" } }],
    [{ id: "s", order_id: "ready", status: "PLANNED" }],
    false,
  );
  assert.deepEqual(
    rows.map((r) => r.order.id),
    ["new", "ready"],
  );
  assert.equal(rows[0].session, null);
  assert.deepEqual(rows[0].rows, []);
});
test("missing supporting data cannot turn real orders into an empty list", () => {
  assert.equal(buildProductionOrderCards([order("a"), order("b")], [], [], false).length, 2);
});
test("ambiguous sessions are visible and never arbitrarily selected", () => {
  const rows = buildProductionOrderCards(
    [order("a")],
    [],
    [
      { id: "s1", order_id: "a", status: "PLANNED" },
      { id: "s2", order_id: "a", status: "IN_PROGRESS" },
    ],
    false,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session, null);
  assert.equal(rows[0].ambiguousSession, true);
});
test("completed history stays separate and cancelled sessions cannot hijack a live order", () => {
  assert.deepEqual(
    buildProductionOrderCards([order("a"), order("b", "COMPLETED")], [], [], true).map(
      (r) => r.order.id,
    ),
    ["b"],
  );
  const row = buildProductionOrderCards(
    [order("a")],
    [],
    [
      { id: "cancelled", order_id: "a", status: "CANCELLED" },
      { id: "active", order_id: "a", status: "PLANNED" },
    ],
    false,
  )[0];
  assert.equal(row.session.id, "active");
});
