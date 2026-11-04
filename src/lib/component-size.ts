/**
 * 컴포넌트 사이즈 표기 — WANN 플래너 TASK 제목(sync-work-session-to-planner Edge Function)과 같은 규칙.
 * SHEET는 몰드 기준("8inch round"), CREAM/FILLING 등은 기준중량(base weight, g) 기준.
 */
export function mouldSizeLabel(name: string): string {
  const m = name.trim().match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(?:"|''|”|inch|in|인치)?$/i);
  if (!m || !m[1]?.trim()) return name.trim();
  return `${m[2]}inch ${m[1].trim().toLowerCase()}`;
}
