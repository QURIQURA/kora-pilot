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
