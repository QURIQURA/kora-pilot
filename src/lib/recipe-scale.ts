/**
 * 레시피 중량 조절 — 재료 한 개 / 모든 재료. 계산만 하고 저장은 화면의 SAVE가 한다.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (text: string): number | null => {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  const frac = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d > 0 ? Number(frac[1]) / d : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** 배수 입력: "1.2", "×1.2", "7/6" → 숫자(0보다 커야 함) */
export function parseFactor(text: string): number | null {
  const n = num(text.trim().replace(/^[x×*]\s*/i, ""));
  return n != null && n > 0 ? n : null;
}

/**
 * 재료 한 개 증량 입력:
 *  "+20" 20 더하기 · "-10" 10 빼기 · "+10%" / "-5%" 퍼센트 증감 · "×1.2" / "7/6" 배수 · "150" 그 값으로 바꾸기
 * 해석이 안 되거나 결과가 0 이하면 null.
 */
export function adjustAmount(current: number, text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  let next: number | null = null;
  if (/^[x×*]/i.test(t) || /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(t)) {
    const f = parseFactor(t);
    next = f == null ? null : current * f;
  } else if (/^[+-]\s*\d+(\.\d+)?\s*%$/.test(t)) {
    const pct = num(t.replace("%", ""));
    next = pct == null ? null : current * (1 + pct / 100);
  } else if (/^[+-]/.test(t)) {
    const delta = num(t.replace(/^\+/, ""));
    next = delta == null ? null : current + delta;
  } else {
    next = num(t);
  }
  return next != null && Number.isFinite(next) && next > 0 ? round2(next) : null;
}

/** 모든 재료 조절 방식 */
export type ScaleMode = "FACTOR" | "PERCENT" | "TOTAL";

/** 입력과 현재 총 중량(g)에서 곱할 배수를 구한다. 입력이 잘못되면 null. */
export function scaleFactor(mode: ScaleMode, text: string, totalGrams: number): number | null {
  if (mode === "FACTOR") return parseFactor(text);
  if (mode === "PERCENT") {
    const pct = num(text.replace("%", ""));
    return pct != null && 1 + pct / 100 > 0 ? 1 + pct / 100 : null;
  }
  const target = num(text);
  return target != null && target > 0 && totalGrams > 0 ? target / totalGrams : null;
}
