import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// 기준중량(방정식) 저장 계약 — 화면이 v3를 호출하고, 서버 정수 규칙이 몰드/기준중량/목표를 예외로 둔다.
test("order plan row saves through v3 with base weight params", () => {
  const src = readFileSync("src/components/pilot/OrderComponentPlanRow.tsx", "utf8");
  assert.match(src, /save_order_component_plan_v3/);
  assert.match(src, /p_base_weight_id/);
  assert.match(src, /p_base_weight_qty/);
});

test("latest plan functions exempt equation-derived multipliers from the integer rule", () => {
  const dir = "supabase/migrations";
  const v3 = readdirSync(dir).find((f) => f.includes("save_order_component_plan_v3"));
  assert.ok(v3, "v3 migration exists");
  const sql = readFileSync(`${dir}/${v3}`, "utf8");
  assert.match(sql, /p_mould_id is null and p_base_weight_id is null/);
});
