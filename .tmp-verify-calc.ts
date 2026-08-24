import {
  computeBases,
  functionalRowCalc,
  compositionTotals,
  balanceTotals,
  scaledAmount,
  gelatinConvert,
} from "@/lib/formula-calc";

type Row = any;
const mk = (over: Partial<Row>): Row => ({
  id: Math.random().toString(36).slice(2),
  amount: 0,
  unit: "g",
  sort_order: 0,
  note: null,
  amount_source: "manual",
  ingredient_id: Math.random().toString(36).slice(2),
  ...over,
});
const ing = (over: Partial<Row>): Row => ({
  name: "?", name_en: null, is_functional: false,
  reference_basis: null, typical_rate_min: null, typical_rate_max: null,
  bloom: null, scaling_mode: "linear", scaling_exponent: 1, process_note: null,
  comp_water: null, comp_fat: null, comp_protein: null, comp_sugar: null,
  comp_other_solids: null, comp_alcohol: null,
  role_toughener: false, role_tenderizer: false, role_moistener: false, role_drier: false,
  ingredient_function_links: [],
  ...over,
});
const keys = (...ks: string[]) =>
  ks.map((k) => ({ function_id: k, ingredient_functions: { key: k, name: k.toUpperCase() } }));

const rows: Row[] = [
  mk({ amount: 500, ingredients: ing({ name: "강력분", name_en: "Bread flour", comp_water: 13, comp_fat: 1.5, comp_protein: 13, comp_sugar: 0, comp_other_solids: 72.5, role_toughener: true, role_drier: true, ingredient_function_links: keys("structure", "starch") }) }),
  mk({ amount: 100, ingredients: ing({ name: "무염 버터", name_en: "Butter", comp_water: 16, comp_fat: 82, comp_protein: 1, comp_sugar: 0.5, comp_other_solids: 0.5, role_tenderizer: true, role_moistener: true, ingredient_function_links: keys("fat") }) }),
  mk({ amount: 80, ingredients: ing({ name: "백설탕", name_en: "Sugar", comp_water: 0, comp_fat: 0, comp_protein: 0, comp_sugar: 100, comp_other_solids: 0, role_tenderizer: true, ingredient_function_links: keys("sweetener") }) }),
  mk({ amount: 300, ingredients: ing({ name: "우유", name_en: "Milk", comp_water: 88, comp_fat: 3.5, comp_protein: 3.3, comp_sugar: 4.8, comp_other_solids: 0.4, role_moistener: true, ingredient_function_links: keys("water") }) }),
  mk({ amount: 50, ingredients: ing({ name: "물(조성없음)", name_en: "Water no comp", role_moistener: true, ingredient_function_links: keys("water") }) }),
  mk({ amount: 8, ingredients: ing({ name: "젤라틴", name_en: "Gelatin", is_functional: true, reference_basis: "liquid", typical_rate_min: 1.5, typical_rate_max: 3, bloom: 200 }) }),
  mk({ amount: 10, ingredients: ing({ name: "베이킹파우더", name_en: "Baking powder", is_functional: true, reference_basis: "flour", typical_rate_min: 1, typical_rate_max: 3, scaling_mode: "sub_linear", scaling_exponent: 0.85, process_note: "1작은술 ≈ 4~5g" }) }),
];

const bases = computeBases(rows, {}, null);
for (const k of Object.keys(bases) as (keyof typeof bases)[]) {
  const b = bases[k];
  console.log(`BASIS ${b.label}: ${b.grams == null ? "null" : b.grams.toFixed(1) + "g"}${b.approx ? " (≈)" : ""} members=${b.members.length}`);
}

const gel = functionalRowCalc(rows[5]!, bases);
console.log("GELATIN rate:", gel.ratePct?.toFixed(2) + "%", "status:", gel.status, "suggested:", gel.suggestedInUnit?.toFixed(2) + "g", `range ${gel.recMinG?.toFixed(1)}–${gel.recMaxG?.toFixed(1)}g`);
const bp = functionalRowCalc(rows[6]!, bases);
console.log("BP rate:", bp.ratePct?.toFixed(2) + "%", "status:", bp.status, "suggested:", bp.suggestedInUnit?.toFixed(2) + "g");

console.log("BP scale ×3:", JSON.stringify(scaledAmount(10, "sub_linear", 0.85, 3), (k, v) => typeof v === "number" ? +v.toFixed(2) : v));
console.log("gelatin bloom 200→160:", gelatinConvert(8, 200, 160)?.toFixed(2) + "g");

const comp = compositionTotals(rows, 1);
console.log("COMP water:", comp.water.toFixed(1), "fat:", comp.fat.toFixed(1), "sugar:", comp.sugar.toFixed(1), "solids:", comp.totalSolids.toFixed(1), "total:", comp.totalWeight.toFixed(1));
console.log("hydration:", comp.hydrationPct?.toFixed(1) + "%", "water:fat:", comp.waterFatRatio?.toFixed(2), "fatPct:", comp.fatPct?.toFixed(1) + "%");
console.log("missing composition:", comp.missing.map((m: any) => m.name).join(", "));

const bal = balanceTotals(rows, 1);
console.log("BALANCE toughen:tender:", bal.toughener, bal.tenderizer, JSON.stringify(bal.toughenTender, (k, v) => typeof v === "number" ? +v.toFixed(1) : v));
console.log("BALANCE moisten:dry:", bal.moistener, bal.drier, JSON.stringify(bal.moistenDry, (k, v) => typeof v === "number" ? +v.toFixed(1) : v));

// overrides 테스트: 물을 liquid에서 제외
const waterRow = rows[4]!;
const bases2 = computeBases(rows, { liquid: { exclude: [waterRow.ingredient_id] } }, null);
console.log("LIQUID after exclude 물:", bases2.liquid.grams.toFixed(1), "g (expect 345)");
// bath
const bases3 = computeBases(rows, {}, 1000);
console.log("BATH with 1000g input:", bases3.bath.grams);
