import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { canonicalProfile, sharedStandardOptions } = await loadTs("src/lib/shared-standard.ts");
const standard = {
  id: "shared",
  user_id: "owner",
  shape: "ROUND",
  diameter_mm: 203.2,
  height_mm: 100,
  width_mm: null,
  length_mm: null,
  created_at: "t",
  updated_at: "t",
};
const old = {
  id: "profile",
  product_id: "cake",
  cake_size_id: "shared",
  shape: "ROUND",
  diameter_mm: 220,
  height_mm: 150,
  selling_price: 240,
};
test("all displays use shared dimensions while preserving product price and historical profile IDs", () => {
  const result = canonicalProfile(old, standard);
  assert.equal(result.id, "profile");
  assert.equal(result.diameter_mm, 203.2);
  assert.equal(result.height_mm, 100);
  assert.equal(result.selling_price, 240);
  assert.equal(old.diameter_mm, 220);
});
test("every product offers the same standards without creating or guessing links", () => {
  const a = sharedStandardOptions([standard], [old], "cake");
  const b = sharedStandardOptions([standard], [old], "other");
  assert.equal(a[0].cake_size_id, b[0].cake_size_id);
  assert.equal(a[0].id, "profile");
  assert.equal(b[0].id, "shared");
  assert.equal(b[0].selling_price, null);
  assert.equal(
    sharedStandardOptions([standard], [{ ...old, cake_size_id: null }], "cake")[0].id,
    "shared",
  );
  assert.throws(() =>
    sharedStandardOptions([standard], [old, { ...old, id: "duplicate" }], "cake"),
  );
});
test("catalog edits and missing measurements remain authoritative without fallback estimates", () => {
  assert.equal(canonicalProfile(old, { ...standard, diameter_mm: null }).diameter_mm, null);
  assert.equal(
    canonicalProfile(old, {
      ...standard,
      shape: "SQUARE",
      diameter_mm: null,
      width_mm: 200,
      length_mm: 200,
    }).shape,
    "RECTANGLE",
  );
});
