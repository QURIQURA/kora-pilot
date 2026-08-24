/**
 * PILOT — 배합 계산 엔진 (순수 함수 모듈)
 *
 * 절대 규칙: 저장되는 것은 사용자가 확정한 amount 하나뿐이다.
 * 이 모듈이 반환하는 기준량·RATE·권장 범위·제안값은 전부 "볼 때마다 계산되는"
 * 표시용 값이며 어디에도 저장하지 않는다.
 */
import { toGrams } from "@/lib/formula";
import { hasComposition, ingredientDisplayName } from "@/lib/pilot";
import type { VersionIngredientRow } from "@/lib/queries";

/* ── 기준량 (REFERENCE BASIS) ─────────────────────────────── */

export type BasisKey =
  | "flour"
  | "liquid"
  | "fat"
  | "sugar"
  | "total"
  | "egg_white"
  | "puree_sugar"
  | "bath";

export const BASIS_ORDER: BasisKey[] = [
  "flour",
  "liquid",
  "fat",
  "sugar",
  "total",
  "egg_white",
  "puree_sugar",
  "bath",
];

export const BASIS_LABELS: Record<BasisKey, string> = {
  flour: "FLOUR",
  liquid: "LIQUID",
  fat: "FAT",
  sugar: "SUGAR",
  total: "TOTAL",
  egg_white: "EGG WHITE",
  puree_sugar: "PUREE SUGAR",
  bath: "BATH",
};

/** basis_overrides jsonb 형태: { [basisKey]: { include?: ingredientId[], exclude?: ingredientId[] } } */
export interface BasisOverride {
  include?: string[];
  exclude?: string[];
}
export type BasisOverrides = Record<string, BasisOverride>;

export function parseBasisOverrides(raw: unknown): BasisOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: BasisOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    out[key] = {
      include: Array.isArray(rec.include)
        ? rec.include.filter((v): v is string => typeof v === "string")
        : [],
      exclude: Array.isArray(rec.exclude)
        ? rec.exclude.filter((v): v is string => typeof v === "string")
        : [],
    };
  }
  return out;
}

function functionKeys(row: VersionIngredientRow): string[] {
  return (row.ingredients?.ingredient_function_links ?? [])
    .map((link) => link.ingredient_functions?.key)
    .filter((k): k is string => Boolean(k));
}

function rowGrams(row: VersionIngredientRow): number {
  return toGrams(Number(row.amount), row.unit) ?? 0;
}

function isEggWhite(row: VersionIngredientRow): boolean {
  const name = row.ingredients?.name ?? "";
  const nameEn = row.ingredients?.name_en ?? "";
  return /흰자/.test(name) || /egg\s*white/i.test(nameEn);
}

export interface BasisMember {
  ingredientId: string;
  name: string;
  grams: number;
  /** 조성 미입력 등으로 근사한 값 */
  approx: boolean;
  /** 자동 규칙으로 포함된 멤버 (false면 사용자가 include로 추가) */
  auto: boolean;
}

export interface BasisInfo {
  key: BasisKey;
  label: string;
  /** bath 미입력 시 null */
  grams: number | null;
  /** 멤버 중 근사값이 하나라도 있으면 true */
  approx: boolean;
  members: BasisMember[];
  /** 체크 조정 가능 여부 (total/bath는 불가) */
  adjustable: boolean;
}

function autoMembers(key: BasisKey, rows: VersionIngredientRow[]): BasisMember[] {
  const members: BasisMember[] = [];
  for (const row of rows) {
    const ing = row.ingredients;
    if (!ing) continue;
    const grams = rowGrams(row);
    if (grams <= 0) continue;
    const keys = functionKeys(row);
    const name = ingredientDisplayName(ing);
    const id = row.ingredient_id;

    switch (key) {
      case "flour":
        if (!ing.is_functional && (keys.includes("structure") || keys.includes("starch")))
          members.push({ ingredientId: id, name, grams, approx: false, auto: true });
        break;
      case "liquid":
        if (ing.comp_water != null)
          members.push({ ingredientId: id, name, grams: (grams * ing.comp_water) / 100, approx: false, auto: true });
        else if (keys.includes("water"))
          members.push({ ingredientId: id, name, grams, approx: true, auto: true });
        break;
      case "fat":
        if (ing.comp_fat != null)
          members.push({ ingredientId: id, name, grams: (grams * ing.comp_fat) / 100, approx: false, auto: true });
        else if (keys.includes("fat"))
          members.push({ ingredientId: id, name, grams, approx: true, auto: true });
        break;
      case "sugar":
      case "puree_sugar":
        if (ing.comp_sugar != null)
          members.push({ ingredientId: id, name, grams: (grams * ing.comp_sugar) / 100, approx: false, auto: true });
        else if (keys.includes("sweetener"))
          members.push({ ingredientId: id, name, grams, approx: true, auto: true });
        break;
      case "egg_white":
        if (isEggWhite(row))
          members.push({ ingredientId: id, name, grams, approx: false, auto: true });
        break;
      case "total":
        members.push({ ingredientId: id, name, grams, approx: false, auto: true });
        break;
      case "bath":
        break;
    }
  }
  return members;
}

/** 기준량 자동 집계 + 사용자 체크 조정(overrides) 반영 */
export function computeBases(
  rows: VersionIngredientRow[],
  overrides: BasisOverrides = {},
  bathWaterG: number | null = null
): Record<BasisKey, BasisInfo> {
  const result = {} as Record<BasisKey, BasisInfo>;
  for (const key of BASIS_ORDER) {
    const adjustable = key !== "total" && key !== "bath";
    let members = autoMembers(key, rows);

    const override = overrides[key];
    if (adjustable && override) {
      const exclude = new Set(override.exclude ?? []);
      members = members.filter((m) => !exclude.has(m.ingredientId));
      for (const id of override.include ?? []) {
        if (members.some((m) => m.ingredientId === id)) continue;
        const row = rows.find((r) => r.ingredient_id === id);
        const grams = row ? rowGrams(row) : 0;
        if (row && row.ingredients && grams > 0) {
          members.push({
            ingredientId: id,
            name: ingredientDisplayName(row.ingredients),
            grams,
            approx: true,
            auto: false,
          });
        }
      }
    }

    const grams =
      key === "bath"
        ? bathWaterG != null && bathWaterG > 0
          ? bathWaterG
          : null
        : members.reduce((sum, m) => sum + m.grams, 0);

    result[key] = {
      key,
      label: BASIS_LABELS[key],
      grams,
      approx: members.some((m) => m.approx),
      members,
      adjustable,
    };
  }
  return result;
}

/* ── 기능성 재료 행 계산 ──────────────────────────────────── */

export type RangeStatus = "in" | "low" | "high";

export interface FunctionalCalc {
  basisKey: BasisKey | null;
  basisLabel: string;
  basisGrams: number | null;
  ratePct: number | null;
  recMinPct: number | null;
  recMaxPct: number | null;
  recMinG: number | null;
  recMaxG: number | null;
  status: RangeStatus | null;
  /** 권장 범위 중앙값 (%) */
  midPct: number | null;
  /** 제안값 — 기준량 × 중앙값, 행의 단위로 환산 */
  suggestedInUnit: number | null;
  suggestedGrams: number | null;
}

export function functionalRowCalc(
  row: VersionIngredientRow,
  bases: Record<BasisKey, BasisInfo>
): FunctionalCalc {
  const ing = row.ingredients;
  const basisKey = (ing?.reference_basis as BasisKey | null) ?? null;
  const basis = basisKey ? bases[basisKey] : null;
  const basisGrams = basis?.grams ?? null;
  const grams = rowGrams(row);

  const ratePct =
    basisGrams != null && basisGrams > 0 ? (grams / basisGrams) * 100 : null;

  const rmin = ing?.typical_rate_min != null ? Number(ing.typical_rate_min) : null;
  const rmax = ing?.typical_rate_max != null ? Number(ing.typical_rate_max) : null;

  const recMinG = basisGrams != null && rmin != null ? (basisGrams * rmin) / 100 : null;
  const recMaxG = basisGrams != null && rmax != null ? (basisGrams * rmax) / 100 : null;

  const status: RangeStatus | null =
    ratePct == null || rmin == null || rmax == null
      ? null
      : ratePct < rmin
        ? "low"
        : ratePct > rmax
          ? "high"
          : "in";

  const midPct = rmin != null && rmax != null ? (rmin + rmax) / 2 : null;
  const suggestedGrams =
    basisGrams != null && midPct != null ? (basisGrams * midPct) / 100 : null;
  const unitFactor = toGrams(1, row.unit); // 1단위당 그램 (ea/% 는 null)
  const suggestedInUnit =
    suggestedGrams != null && unitFactor ? suggestedGrams / unitFactor : null;

  return {
    basisKey,
    basisLabel: basisKey ? BASIS_LABELS[basisKey] : "—",
    basisGrams,
    ratePct,
    recMinPct: rmin,
    recMaxPct: rmax,
    recMinG,
    recMaxG,
    status,
    midPct,
    suggestedInUnit,
    suggestedGrams,
  };
}

/** 젤라틴 bloom 환산: 필요량 = 원래량 × 원래블룸 ÷ 내블룸 */
export function gelatinConvert(
  amount: number,
  recipeBloom: number,
  myBloom: number
): number | null {
  if (!Number.isFinite(myBloom) || myBloom <= 0) return null;
  return (amount * recipeBloom) / myBloom;
}

/* ── 배치 증량 (N^k) ─────────────────────────────────────── */

export interface ScaledAmount {
  scaled: number;
  linear: number;
  nonLinear: boolean;
}

export function scaledAmount(
  base: number,
  mode: string | null | undefined,
  exponent: number | null | undefined,
  n: number
): ScaledAmount {
  const linear = base * n;
  if (mode === "fixed") return { scaled: base, linear, nonLinear: n !== 1 };
  if (mode === "sub_linear") {
    const k = exponent ?? 1;
    const scaled = base * Math.pow(n, k);
    return { scaled, linear, nonLinear: Math.abs(k - 1) > 1e-9 && n !== 1 };
  }
  return { scaled: linear, linear, nonLinear: false };
}

/** 행의 배수 적용 중량(그램) */
export function rowScaledGrams(row: VersionIngredientRow, n: number): ScaledAmount {
  const ing = row.ingredients;
  const { scaled, linear, nonLinear } = scaledAmount(
    Number(row.amount),
    ing?.scaling_mode,
    ing?.scaling_exponent != null ? Number(ing.scaling_exponent) : null,
    n
  );
  return {
    scaled: toGrams(scaled, row.unit) ?? 0,
    linear: toGrams(linear, row.unit) ?? 0,
    nonLinear,
  };
}

/* ── 조성 집계 (COMPOSITION) ─────────────────────────────── */

export interface CompositionTotals {
  water: number;
  fat: number;
  sugar: number;
  protein: number;
  otherSolids: number;
  alcohol: number;
  totalSolids: number;
  totalWeight: number;
  /** 총수분 ÷ 밀가루 기준 ×100 */
  hydrationPct: number | null;
  /** 물 : 지방 (지방 1당 물) */
  waterFatRatio: number | null;
  /** 총지방 ÷ 총중량 ×100 */
  fatPct: number | null;
  /** 조성 미입력 재료 */
  missing: { ingredientId: string; name: string }[];
}

export function compositionTotals(
  rows: VersionIngredientRow[],
  batch: number
): CompositionTotals {
  let water = 0,
    fat = 0,
    sugar = 0,
    protein = 0,
    otherSolids = 0,
    alcohol = 0,
    totalWeight = 0,
    flour = 0;
  const missing: CompositionTotals["missing"] = [];

  for (const row of rows) {
    const ing = row.ingredients;
    if (!ing) continue;
    const grams = rowScaledGrams(row, batch).scaled;
    if (grams <= 0) continue;
    totalWeight += grams;

    const keys = functionKeys(row);
    if (!ing.is_functional && (keys.includes("structure") || keys.includes("starch")))
      flour += grams;

    if (hasComposition(ing)) {
      water += (grams * (ing.comp_water ?? 0)) / 100;
      fat += (grams * (ing.comp_fat ?? 0)) / 100;
      sugar += (grams * (ing.comp_sugar ?? 0)) / 100;
      protein += (grams * (ing.comp_protein ?? 0)) / 100;
      otherSolids += (grams * (ing.comp_other_solids ?? 0)) / 100;
      alcohol += (grams * (ing.comp_alcohol ?? 0)) / 100;
    } else {
      missing.push({ ingredientId: row.ingredient_id, name: ingredientDisplayName(ing) });
    }
  }

  const totalSolids = fat + sugar + protein + otherSolids;

  return {
    water,
    fat,
    sugar,
    protein,
    otherSolids,
    alcohol,
    totalSolids,
    totalWeight,
    hydrationPct: flour > 0 ? (water / flour) * 100 : null,
    waterFatRatio: fat > 0 ? water / fat : null,
    fatPct: totalWeight > 0 ? (fat / totalWeight) * 100 : null,
    missing,
  };
}

/* ── 배합 균형 (BALANCE) ─────────────────────────────────── */

export interface BalancePair {
  /** 왼쪽 힘(강화/습윤)의 점유율 % */
  left: number;
  right: number;
}

export interface BalanceTotals {
  toughener: number;
  tenderizer: number;
  moistener: number;
  drier: number;
  /** 강화 : 연화 */
  toughenTender: BalancePair | null;
  /** 습윤 : 건조 */
  moistenDry: BalancePair | null;
}

function pair(a: number, b: number): BalancePair | null {
  const total = a + b;
  if (total <= 0) return null;
  return { left: (a / total) * 100, right: (b / total) * 100 };
}

export function balanceTotals(
  rows: VersionIngredientRow[],
  batch: number
): BalanceTotals {
  let toughener = 0,
    tenderizer = 0,
    moistener = 0,
    drier = 0;
  for (const row of rows) {
    const ing = row.ingredients;
    if (!ing) continue;
    const grams = rowScaledGrams(row, batch).scaled;
    if (grams <= 0) continue;
    if (ing.role_toughener) toughener += grams;
    if (ing.role_tenderizer) tenderizer += grams;
    if (ing.role_moistener) moistener += grams;
    if (ing.role_drier) drier += grams;
  }
  return {
    toughener,
    tenderizer,
    moistener,
    drier,
    toughenTender: pair(toughener, tenderizer),
    moistenDry: pair(moistener, drier),
  };
}
