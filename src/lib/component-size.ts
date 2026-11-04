/**
 * 컴포넌트 사이즈 표기 — WANN 플래너 TASK 제목(sync-work-session-to-planner Edge Function)과 같은 규칙.
 * SHEET는 몰드 기준(약어: Ø8″-H5), CREAM/FILLING 등은 기준중량(base weight, g) 기준.
 */
import { sizeAbbr } from "@/lib/size-label";

export function mouldAbbr(mould: {
  name: string;
  diameter_mm?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
  height_mm?: number | null;
}): string {
  return sizeAbbr(mould);
}

/**
 * 몰드 기준 생산(2026-11-05): 레시피는 기본 몰드(보통 6인치) 한 판 기준이고, "8인치 1개 생산"처럼
 * 목표 몰드 × 개수로 정하면 레시피 배수는 몰드 기준중량 비율로 자동 계산된다.
 *   배수 = 개수 × (목표 몰드 기준중량 ÷ 레시피 기본 몰드 기준중량)   예) 8″ 680g ÷ 6″ 340g × 1 = ×2
 * 기준중량이 없으면 null(몰드로 계산할 수 없음).
 */
type RefMould = { reference_weight_g: number | null } | null | undefined;
const ref = (m: RefMould): number | null =>
  m?.reference_weight_g != null && Number(m.reference_weight_g) > 0
    ? Number(m.reference_weight_g)
    : null;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function mouldMultiplier(qty: number, base: RefMould, target: RefMould): number | null {
  const b = ref(base);
  const t = ref(target);
  if (b == null || t == null || !(qty > 0)) return null;
  return round4((qty * t) / b);
}

/** 저장된 레시피 배수에서 목표 몰드 개수를 거꾸로 계산한다(대시보드에서 배수를 바꿔도 표기가 맞도록). */
export function mouldQty(multiplier: number, base: RefMould, target: RefMould): number | null {
  const b = ref(base);
  const t = ref(target);
  if (b == null || t == null || !(multiplier > 0)) return null;
  return round4((multiplier * b) / t);
}
