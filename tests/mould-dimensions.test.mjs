import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/mould-dimensions.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const lib = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("round selection uses the diameter, preserves tool height and displays cm", () => {
  assert.deepEqual(lib.mouldDimensionInputs({ diameter_mm: 200, height_mm: 100 }), {
    width: "20",
    length: "20",
    height: "10",
  });
  assert.ok(Math.abs(lib.mouldFootprintCm2({ diameter_mm: 200 }) - Math.PI * 100) < 1e-9);
});

test("rectangle selection and area use both dimensions", () => {
  const m = { width_mm: 270, length_mm: 320, height_mm: 30 };
  assert.deepEqual(lib.mouldDimensionInputs(m), { width: "27", length: "32", height: "3" });
  assert.equal(lib.mouldFootprintCm2(m), 864);
});

test("partial or missing dimensions clear stale form fields without parsing the name", () => {
  const old = { width: "27", length: "32", height: "3" };
  assert.deepEqual(
    { ...old, ...lib.mouldDimensionInputs({ height_mm: 100, shape_size: "25*25*10" }) },
    { width: "", length: "", height: "10" },
  );
  assert.deepEqual(lib.mouldDimensionInputs(null), { width: "", length: "", height: "" });
  assert.equal(lib.mouldFootprintCm2({ width_mm: 200 }), null);
});

test("existing mm dimensions survive cm edit/save unchanged, including fractional values", () => {
  for (const mm of [25, 150, 152.4, 200, 271, 320])
    assert.equal(lib.cmInputToMm(lib.mmToCmInput(mm)), mm);
  assert.equal(lib.cmInputToMm(""), null);
  for (const invalid of ["0", "-2", "NaN", "Infinity", "abc"])
    assert.throws(() => lib.cmInputToMm(invalid));
});

test("six reference presets have numeric dimensions and unknown batter quantities", () => {
  assert.equal(lib.MOULD_REFERENCE_PRESETS.length, 6);
  assert.equal(new Set(lib.MOULD_REFERENCE_PRESETS.map((p) => p.key)).size, 6);
  for (const p of lib.MOULD_REFERENCE_PRESETS) {
    assert.equal(p.height_mm, 100);
    assert.equal(p.width_mm, p.length_mm);
    assert.ok(p.notes.includes("실측 전"));
    assert.equal(p.reference_weight_g, undefined);
    const sideCm = p.width_mm / 10;
    const expected = p.shape === "ROUND" ? Math.PI * (sideCm / 2) ** 2 : sideCm ** 2;
    assert.equal(lib.mouldFootprintCm2(p), expected);
  }
});

test("invalid dimensions never produce usable areas or fabricated fields", () => {
  assert.equal(lib.mouldFootprintCm2({ diameter_mm: -200 }), null);
  assert.deepEqual(lib.mouldDimensionInputs({ width_mm: 0, length_mm: Infinity, height_mm: NaN }), {
    width: "",
    length: "",
    height: "",
  });
});
