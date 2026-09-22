/**
 * PILOT — 원가 계산 헬퍼 (순수 함수 모듈)
 *
 * 저장되는 값은 ingredients.purchase_price/purchase_qty/purchase_unit(재료의 "구입가")뿐이다.
 * g당 단가·배치 원가·제품 원가는 전부 볼 때마다 계산하는 표시용 값이며 어디에도 저장하지 않는다.
 */
import { toGrams } from "@/lib/formula";

/** 구입 단위 옵션 — "ea"(개당 구입, 예: 계란)는 g 환산이 안 돼 g당 단가 계산에서는 제외된다. */
export const PURCHASE_UNITS = ["g", "kg", "ml", "l", "ea"] as const;

export interface CostableIngredient {
  purchase_price: number | null;
  purchase_qty: number | null;
  purchase_unit: string | null;
}

/**
 * 재료의 g당 단가(원/g) — 구입가 ÷ (구입량을 g으로 환산한 값).
 * 구입 단위가 무게/부피가 아니거나(예: "개") 구입가/구입량이 미입력이면 null.
 */
export function costPerGram(ingredient: CostableIngredient | null | undefined): number | null {
  if (!ingredient) return null;
  const { purchase_price, purchase_qty, purchase_unit } = ingredient;
  if (purchase_price == null || purchase_qty == null || purchase_qty <= 0) return null;
  const grams = toGrams(purchase_qty, purchase_unit ?? "g");
  if (grams == null || grams <= 0) return null;
  return purchase_price / grams;
}

export interface IngredientLine {
  amount: number;
  unit: string;
  ingredients: CostableIngredient | null;
}

export interface LineCostResult {
  /** 원가 정보가 있는 재료들만 합산한 총 원가(원) */
  totalCost: number;
  /** 전체 재료 총중량(g) — 원가 정보 유무와 무관하게 합산 */
  totalGrams: number;
  /** totalCost / totalGrams — 배치 전체 g당 평균 단가. totalGrams가 0이면 null */
  costPerGram: number | null;
  /** 중량이 있는 재료 중 하나 이상 구입가 정보가 없으면 true — 원가가 과소 계산됐을 수 있다는 뜻 */
  hasMissingPrice: boolean;
}

/** 배합(또는 그 일부)의 재료 목록으로 총 원가/총중량/g당 단가를 계산한다. */
export function computeLineCosts(rows: IngredientLine[]): LineCostResult {
  let totalCost = 0;
  let totalGrams = 0;
  let hasMissingPrice = false;
  for (const row of rows) {
    const grams = toGrams(Number(row.amount), row.unit) ?? 0;
    totalGrams += grams;
    const cpg = costPerGram(row.ingredients);
    if (cpg == null) {
      if (grams > 0) hasMissingPrice = true;
      continue;
    }
    totalCost += grams * cpg;
  }
  return {
    totalCost,
    totalGrams,
    costPerGram: totalGrams > 0 ? totalCost / totalGrams : null,
    hasMissingPrice,
  };
}

/**
 * FULL PRODUCTION COST(2026-09-23, "배치" 기준 → "케익(제품 단위) 개당" 기준으로 변경).
 * 케익 하나에 시트/필링/가나슈 등 Component가 몇 개 들어가는지에 따라 "배치" 횟수가 무한히
 * 배수될 수 있어 고정 기준으로 쓰기 애매하다는 판단(사용자 확정)에 따라, UTILITY/CONSUMABLE도
 * PACKAGING과 동일하게 Product(케익) 단위·개당으로 배정한다 — Component 단위 배정은 폐기.
 * Raw Material Cost와 별개로 계산되는 추가 원가이며, 어디에도 저장하지 않고 볼 때마다 계산한다.
 */
export interface CostableCostItem {
  unit_cost: number;
}

export interface CostItemAssignment {
  quantity: number;
  cost_items: CostableCostItem;
}

/** 배정된 원가 항목들의 합계 — Σ(quantity × unit_cost). Product에 배정된 UTILITY/CONSUMABLE/PACKAGING 공통. */
export function sumCostItemAssignments(rows: CostItemAssignment[]): number {
  return rows.reduce((sum, row) => sum + row.quantity * row.cost_items.unit_cost, 0);
}

export interface OverheadSettings {
  monthly_overhead: number;
  monthly_unit_count: number;
}

/**
 * 월 고정비(OVERHEAD) ÷ 월 예상 케익(제품 단위) 개수 = 케익 1개당 배분액.
 * SETTINGS에 입력된 값 기준이며 모든 케익에 동일하게 적용한다(사이즈 구분 없음).
 * 개수가 미입력/0이면 계산할 수 없으므로 null.
 */
export function overheadPerUnit(settings: OverheadSettings | null | undefined): number | null {
  if (!settings) return null;
  if (!settings.monthly_unit_count || settings.monthly_unit_count <= 0) return null;
  return settings.monthly_overhead / settings.monthly_unit_count;
}

/**
 * AUD 통화 표시(2026-09-23, 원화 ₩ 표시에서 변경 — Kora Cakes는 호주 캔버라 기준 사업).
 * g당 단가처럼 소수점 이하가 작은 값은 소수 2자리로 반올림하면 $0.00으로 보여버리는 문제가
 * 있어서(예: 구입가 2.2÷구입량 1000g = $0.0022/g), 절댓값이 $0.01 미만이면 소수 4자리까지 보여준다.
 */
export function fmtCurrency(value: number): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs > 0 && abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}
