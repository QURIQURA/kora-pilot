import type { NodeMeta } from "@/lib/mindmap-node-meta";

/** VALUE MATRIX(2026-11-13) — 노력(X) × 사업 효과(Y) 2×2 보드의 데이터/기하 로직.
 * design_moodboards.matrix(jsonb)에 저장한다: { meta:{v:1}, config, cards }. */
export type ZoneId = "maxroi" | "big" | "easy" | "neg" | "unassigned";
export const ZONE_IDS: ZoneId[] = ["maxroi", "big", "easy", "neg", "unassigned"];

export const QW = 600; // 사분면 너비
export const QH = 480; // 사분면 높이
export const GAP = 48; // 축이 지나가는 사이 간격
export const CARD_W = 250;
export const CARD_H = 54;
export const CARD_GAP = 10;
export const PAD = 16;
export const HEADER_H = 66;
export const UN_W = 560;
export const UN_X = 2 * QW + GAP + 80;

export interface Zone {
  id: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const ZONES: Record<ZoneId, Zone> = {
  maxroi: { id: "maxroi", x: 0, y: 0, w: QW, h: QH },
  big: { id: "big", x: QW + GAP, y: 0, w: QW, h: QH },
  easy: { id: "easy", x: 0, y: QH + GAP, w: QW, h: QH },
  neg: { id: "neg", x: QW + GAP, y: QH + GAP, w: QW, h: QH },
  unassigned: { id: "unassigned", x: UN_X, y: 0, w: UN_W, h: 2 * QH + GAP },
};

export const ZONE_STYLE: Record<ZoneId, { bg: string; line: string; ink: string }> = {
  maxroi: { bg: "#e9f8ea", line: "#16a34a", ink: "#14532d" },
  big: { bg: "#efeafd", line: "#7c3aed", ink: "#4c1d95" },
  easy: { bg: "#e4eefe", line: "#2563eb", ink: "#1e3a8a" },
  neg: { bg: "#fde8ec", line: "#dc2626", ink: "#7f1d1d" },
  unassigned: { bg: "#f1f1ee", line: "#8a8a84", ink: "#3f3f3a" },
};

export interface MatrixConfig {
  axes: { xLow: string; xHigh: string; yLow: string; yHigh: string };
  zones: Record<ZoneId, { title: string; sub: string }>;
}
export const DEFAULT_CONFIG: MatrixConfig = {
  axes: {
    xLow: "← Low Development Effort",
    xHigh: "High Development Effort →",
    yLow: "↓ Low Business Impact",
    yHigh: "↑ High Business Impact",
  },
  zones: {
    maxroi: { title: "MAX ROI", sub: "High Impact · Low Effort" },
    big: { title: "BIG PROJECTS", sub: "High Impact · High Effort" },
    easy: { title: "EASY WINS", sub: "Low Impact · Low Effort" },
    neg: { title: "NEGATIVE ROI", sub: "Low Impact · High Effort" },
    unassigned: { title: "UNASSIGNED IDEAS", sub: "아직 분류하지 않은 아이디어" },
  },
};

export interface MatrixCard {
  id: string;
  x: number;
  y: number;
  quad: ZoneId;
  title: string;
  meta?: NodeMeta;
  /** 가져온 원본(마인드맵 보드:노드) — 같은 아이디어를 두 번 가져오지 않게 */
  src?: string;
}
export interface MatrixSaved {
  meta?: { v?: number };
  config?: Partial<MatrixConfig>;
  cards?: MatrixCard[];
}

export const mergeConfig = (c?: Partial<MatrixConfig>): MatrixConfig => ({
  axes: { ...DEFAULT_CONFIG.axes, ...(c?.axes ?? {}) },
  zones: Object.fromEntries(
    ZONE_IDS.map((z) => [z, { ...DEFAULT_CONFIG.zones[z], ...(c?.zones?.[z] ?? {}) }]),
  ) as MatrixConfig["zones"],
});

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect, m = 6) =>
  a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

/** 점이 속한(없으면 가장 가까운) 구역. */
export function zoneAt(cx: number, cy: number): ZoneId {
  let best: ZoneId = "unassigned";
  let bestD = Infinity;
  for (const z of Object.values(ZONES)) {
    const dx = Math.max(z.x - cx, 0, cx - (z.x + z.w));
    const dy = Math.max(z.y - cy, 0, cy - (z.y + z.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = z.id;
    }
  }
  return best;
}

/** 구역 안에서 다른 카드와 겹치지 않는, 원하는 위치에 가장 가까운 자리. 자리가 없으면 null. */
export function findFree(
  zone: ZoneId,
  others: Rect[],
  desired: { x: number; y: number },
): { x: number; y: number } | null {
  const z = ZONES[zone];
  const minX = z.x + PAD;
  const maxX = z.x + z.w - PAD - CARD_W;
  const minY = z.y + HEADER_H;
  const maxY = z.y + z.h - PAD - CARD_H;
  const dx = Math.min(Math.max(desired.x, minX), maxX);
  const dy = Math.min(Math.max(desired.y, minY), maxY);
  const ok = (x: number, y: number) =>
    !others.some((o) => overlaps({ x, y, w: CARD_W, h: CARD_H }, o));
  if (ok(dx, dy)) return { x: dx, y: dy };
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = minY; y <= maxY; y += 8) {
    for (let x = minX; x <= maxX; x += 8) {
      const d = (x - dx) ** 2 + (y - dy) ** 2;
      if (d < bestD && ok(x, y)) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** 구역별로 카드를 (위→아래, 왼→오른쪽) 순서로 2열 격자에 촘촘히 다시 배치. */
export function arrangeCards<T extends { id: string; x: number; y: number; quad: ZoneId }>(
  cards: T[],
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    const mine = cards
      .filter((c) => c.quad === id)
      .sort((a, b) => Math.round(a.y / 30) - Math.round(b.y / 30) || a.x - b.x);
    const rows = Math.max(1, Math.floor((z.h - HEADER_H - PAD + CARD_GAP) / (CARD_H + CARD_GAP)));
    mine.forEach((c, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      out.set(c.id, {
        x: z.x + PAD + (col % 2) * (CARD_W + PAD),
        y: z.y + HEADER_H + row * (CARD_H + CARD_GAP),
      });
    });
  }
  return out;
}

export const cardRect = (c: { x: number; y: number }): Rect => ({
  x: c.x,
  y: c.y,
  w: CARD_W,
  h: CARD_H,
});
