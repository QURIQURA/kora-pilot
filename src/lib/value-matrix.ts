import type { NodeMeta } from "@/lib/mindmap-node-meta";

/** VALUE MATRIX — 노력(X) × 사업 효과(Y) 2×2 보드의 데이터/배치 로직.
 * design_moodboards.matrix(jsonb) 저장 형식 v2: { meta:{v:2}, config, cards(구역별 표시 순서대로) }.
 * 카드는 자유 좌표가 아니라 "구역 안의 순서"로 배치된다 — 사분면 높이는 카드 수에 맞게 자라고(최소 높이 있음),
 * 네 사분면은 항상 정렬된 구조를 유지한다. */
export type ZoneId = "maxroi" | "big" | "easy" | "neg" | "unassigned";
export const ZONE_IDS: ZoneId[] = ["maxroi", "big", "easy", "neg", "unassigned"];

export const CARD_W = 420;
export const CARD_H = 44;
export const CARD_GAP = 8;
export const PAD = 20;
export const HEADER_H = 70;
export const QW = CARD_W + 2 * PAD; // 사분면 너비
export const GAP = 56; // 축이 지나가는 사이 간격
export const MIN_H = 244; // 사분면 최소 높이(카드 3개가 들어가는 높이)
export const UN_GAP = 84;
export const LABEL_W = 118; // 가로축 양끝 라벨 너비

export interface Zone {
  id: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZONE_STYLE: Record<ZoneId, { bg: string; line: string; ink: string; pill: string }> = {
  maxroi: { bg: "#e9f8ea", line: "#16a34a", ink: "#14532d", pill: "#cdefd0" },
  big: { bg: "#efeafd", line: "#7c3aed", ink: "#4c1d95", pill: "#dcd2fa" },
  easy: { bg: "#e4eefe", line: "#2563eb", ink: "#1e3a8a", pill: "#cadcfb" },
  neg: { bg: "#fde8ec", line: "#dc2626", ink: "#7f1d1d", pill: "#f9cfd6" },
  unassigned: { bg: "#f3f3f0", line: "#8a8a84", ink: "#3f3f3a", pill: "#e4e4df" },
};

export interface MatrixConfig {
  axes: { xLow: string; xHigh: string; yLow: string; yHigh: string };
  zones: Record<ZoneId, { title: string; sub: string }>;
}
export const DEFAULT_CONFIG: MatrixConfig = {
  axes: {
    xLow: "Low Development Effort",
    xHigh: "High Development Effort",
    yLow: "Low Business Impact",
    yHigh: "High Business Impact",
  },
  zones: {
    maxroi: { title: "MAX ROI", sub: "High Impact · Low Effort" },
    big: { title: "BIG PROJECTS", sub: "High Impact · High Effort" },
    easy: { title: "EASY WINS", sub: "Low Impact · Low Effort" },
    neg: { title: "NEGATIVE ROI", sub: "Low Impact · High Effort" },
    unassigned: { title: "UNASSIGNED IDEAS", sub: "아직 분류하지 않은 아이디어" },
  },
};
/** v1(첫 버전)이 저장하던 기본 축 이름 — 사용자가 안 고쳤다면 새 기본값으로 바꾼다. */
const V1_AXES: MatrixConfig["axes"] = {
  xLow: "← Low Development Effort",
  xHigh: "High Development Effort →",
  yLow: "↓ Low Business Impact",
  yHigh: "↑ High Business Impact",
};

export interface MatrixCard {
  id: string;
  x?: number; // v1 호환(읽기 전용)
  y?: number;
  quad: ZoneId;
  title: string;
  meta?: NodeMeta;
  /** 가져온 원본(마인드맵 보드:노드) — 같은 아이디어를 두 번 가져오지 않게 */
  src?: string;
}
export interface MatrixSaved {
  meta?: { v?: number };
  config?: Partial<MatrixConfig> & { unOpen?: boolean };
  cards?: MatrixCard[];
}

export const mergeConfig = (c?: MatrixSaved["config"], v?: number): MatrixConfig => {
  const axes = { ...DEFAULT_CONFIG.axes, ...(c?.axes ?? {}) };
  if (v === 1 || v === undefined) {
    for (const k of Object.keys(axes) as (keyof MatrixConfig["axes"])[])
      if (axes[k] === V1_AXES[k]) axes[k] = DEFAULT_CONFIG.axes[k];
  }
  return {
    axes,
    zones: Object.fromEntries(
      ZONE_IDS.map((z) => [z, { ...DEFAULT_CONFIG.zones[z], ...(c?.zones?.[z] ?? {}) }]),
    ) as MatrixConfig["zones"],
  };
};

/** 저장된 카드 → 표시 순서(ord)가 붙은 카드. v1은 구역 안에서 세로 위치(y) 순서를 그대로 따른다. */
export function orderCards<T extends MatrixCard>(
  cards: T[],
  v: number | undefined,
): (T & { ord: number })[] {
  const out: (T & { ord: number })[] = [];
  for (const z of ZONE_IDS) {
    const mine = cards.filter((c) => c.quad === z);
    if (v === 1 || v === undefined)
      mine.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    mine.forEach((c, i) => out.push({ ...c, ord: i }));
  }
  return out;
}

export interface Geometry {
  zones: Record<ZoneId, Zone>;
  top: number;
  bot: number;
  total: number;
  /** 카드 id → 월드 좌표 */
  pos: Map<string, { x: number; y: number }>;
  /** 구역별 정렬된 카드 id */
  sorted: Record<ZoneId, string[]>;
}

const need = (n: number) => (n === 0 ? 0 : HEADER_H + n * CARD_H + (n - 1) * CARD_GAP + PAD);

export function computeGeometry(cards: { id: string; quad: ZoneId; ord: number }[]): Geometry {
  const sorted = Object.fromEntries(ZONE_IDS.map((z) => [z, [] as string[]])) as Record<
    ZoneId,
    string[]
  >;
  for (const z of ZONE_IDS)
    sorted[z] = cards
      .filter((c) => c.quad === z)
      .sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id))
      .map((c) => c.id);
  const top = Math.max(MIN_H, need(sorted.maxroi.length), need(sorted.big.length));
  const bot = Math.max(MIN_H, need(sorted.easy.length), need(sorted.neg.length));
  const total = top + GAP + bot;
  const zones: Record<ZoneId, Zone> = {
    maxroi: { id: "maxroi", x: 0, y: 0, w: QW, h: top },
    big: { id: "big", x: QW + GAP, y: 0, w: QW, h: top },
    easy: { id: "easy", x: 0, y: top + GAP, w: QW, h: bot },
    neg: { id: "neg", x: QW + GAP, y: top + GAP, w: QW, h: bot },
    unassigned: {
      id: "unassigned",
      x: 2 * QW + GAP + UN_GAP,
      y: 0,
      w: QW,
      h: Math.max(total, need(sorted.unassigned.length)),
    },
  };
  const pos = new Map<string, { x: number; y: number }>();
  for (const z of ZONE_IDS)
    sorted[z].forEach((id, i) =>
      pos.set(id, { x: zones[z].x + PAD, y: zones[z].y + HEADER_H + i * (CARD_H + CARD_GAP) }),
    );
  return { zones, top, bot, total, pos, sorted };
}

/** 점이 속한(없으면 가장 가까운) 구역. unassigned가 접혀 있으면 후보에서 뺀다. */
export function zoneAt(geo: Geometry, cx: number, cy: number, includeUnassigned: boolean): ZoneId {
  let best: ZoneId = "maxroi";
  let bestD = Infinity;
  for (const z of ZONE_IDS) {
    if (z === "unassigned" && !includeUnassigned) continue;
    const r = geo.zones[z];
    const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
    const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

/** 놓은 높이(centerY)에 맞는 구역 안 삽입 순서값. others = 그 구역의 (끌고 있는 카드를 뺀) 카드들. */
export function insertOrd(
  geo: Geometry,
  others: { id: string; ord: number }[],
  centerY: number,
): number {
  const list = [...others].sort((a, b) => a.ord - b.ord || a.id.localeCompare(b.id));
  let idx = 0;
  for (const o of list) {
    const p = geo.pos.get(o.id);
    if (p && p.y + CARD_H / 2 < centerY) idx++;
  }
  if (list.length === 0) return 0;
  if (idx === 0) return list[0]!.ord - 1;
  if (idx >= list.length) return list[list.length - 1]!.ord + 1;
  return (list[idx - 1]!.ord + list[idx]!.ord) / 2;
}
