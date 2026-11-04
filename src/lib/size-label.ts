/**
 * 사이즈 약어 체계 (2026-11-04 확정, 모든 화면/플래너 제목 공통): 모양-사이즈-높이
 *   원형  Ø8″-H5      (Ø = 원형, 지름 인치)
 *   정사각 ■6″-H5      (■ = 정사각, 한 변 인치)
 *   직사각 ▬30×20-H4   (▬ = 직사각, 가로×세로 cm)
 * 높이는 cm. 높이를 모르면 "-H…"를 생략한다. 인치로 딱 떨어지지 않는 치수는 cm로 적는다(Ø15cm).
 * 같은 규칙이 Edge Function(sync-work-session-to-planner)에도 복제돼 있다 — 바꾸면 함께 바꾼다.
 */
export const SHAPE_SYMBOL = { ROUND: "Ø", SQUARE: "■", RECTANGLE: "▬" } as const;
export type SizeShape = keyof typeof SHAPE_SYMBOL;

export interface SizeLabelInput {
  shape?: string | null;
  /** 몰드처럼 shape 컬럼이 없을 때 이름에서 모양/인치를 읽는다 (예: `ROUND 6"`) */
  name?: string | null;
  size_inch?: number | null;
  diameter_mm?: number | null;
  width_mm?: number | null;
  length_mm?: number | null;
  height_mm?: number | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const cm = (mm: number): string => String(Math.round((mm / 10) * 10) / 10);

function mmToInch(mm: number): number | null {
  const inch = mm / 25.4;
  const half = Math.round(inch * 2) / 2;
  return Math.abs(inch - half) <= 0.15 ? half : null;
}

function normalizeShape(input: SizeLabelInput): SizeShape | null {
  const s = (input.shape ?? "").toUpperCase();
  if (s.startsWith("ROUND")) return "ROUND";
  if (s.startsWith("SQUARE")) return "SQUARE";
  if (s.startsWith("RECT")) return "RECTANGLE";
  const n = (input.name ?? "").toLowerCase();
  if (/round|원형|라운드/.test(n)) return "ROUND";
  if (/square|정사각|스퀘어/.test(n)) return "SQUARE";
  if (/rect|직사각/.test(n)) return "RECTANGLE";
  if (num(input.diameter_mm)) return "ROUND";
  const w = num(input.width_mm);
  const l = num(input.length_mm);
  if (w && l) return w === l ? "SQUARE" : "RECTANGLE";
  return null;
}

function inchFromName(name: string | null | undefined): number | null {
  const m =
    (name ?? "").match(/(\d+(?:\.\d+)?)\s*(?:"|''|″|”|inch|in\b|인치)/i) ??
    (name ?? "").match(/(\d+(?:\.\d+)?)\s*$/);
  return m ? Number(m[1]) : null;
}

export function sizeAbbr(input: SizeLabelInput): string {
  const shape = normalizeShape(input);
  const h = num(input.height_mm);
  const height = h ? `-H${cm(h)}` : "";
  if (shape === "RECTANGLE") {
    const l = num(input.length_mm);
    const w = num(input.width_mm);
    const dims = [l ? cm(l) : "?", w ? cm(w) : "?"].join("×");
    return `${SHAPE_SYMBOL.RECTANGLE}${dims}${height}`;
  }
  if (shape === "ROUND" || shape === "SQUARE") {
    const side =
      shape === "ROUND" ? num(input.diameter_mm) : (num(input.width_mm) ?? num(input.length_mm));
    const inch = input.size_inch ?? (side ? mmToInch(side) : null) ?? inchFromName(input.name);
    const size = inch != null ? `${inch}″` : side ? `${cm(side)}cm` : "?";
    return `${SHAPE_SYMBOL[shape]}${size}${height}`;
  }
  return input.name?.trim() || "?";
}
