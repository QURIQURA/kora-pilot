/** 마인드맵 순수 로직(2026-11-13) — 그래프 분석, 예전 데이터 정규화, 자동 정렬(컴팩트·방사형·플로우차트). */

export type Dir = "r" | "l" | "t" | "b";
export const DIR_OPPOSITE: Record<Dir, Dir> = { r: "l", l: "r", t: "b", b: "t" };
export type LayoutMode = "compact" | "radial" | "flow";

export interface LNode {
  id: string;
  type?: string | undefined;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number | undefined;
  height?: number | undefined;
  measured?: { width?: number | undefined; height?: number | undefined } | undefined;
}
export interface LEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
}

const VALID_HANDLES = new Set(["t", "r", "b", "l"]);

/** 선(source→target)을 부모→자식으로 보고 루트·깊이·최초 부모(트리)·가지 번호를 계산한다. */
export function analyze(nodes: { id: string }[], edges: LEdge[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
  }
  const roots = nodes.filter((n) => !parents.get(n.id)?.length).map((n) => n.id);
  const depth = new Map<string, number>();
  const treeParent = new Map<string, string>();
  const treeKids = new Map<string, string[]>();
  const branch = new Map<string, number>();
  const queue: string[] = [...(roots.length ? roots : nodes.slice(0, 1).map((n) => n.id))];
  for (const r of queue) {
    depth.set(r, 0);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    let idx = 0;
    for (const k of kids.get(id) ?? []) {
      if (depth.has(k)) continue;
      depth.set(k, depth.get(id)! + 1);
      treeParent.set(k, id);
      treeKids.set(id, [...(treeKids.get(id) ?? []), k]);
      branch.set(
        k,
        depth.get(id) === 0 ? (treeKids.get(id)?.length ?? 1) - 1 : (branch.get(id) ?? 0),
      );
      idx++;
      queue.push(k);
    }
    void idx;
  }
  // 도달 못 한 노드(고립·순환)는 0단계로 둔다.
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);
  const size = (id: string): number => {
    let c = 1;
    for (const k of treeKids.get(id) ?? []) c += size(k);
    return c;
  };
  // 가장 큰 트리의 루트를 메인 루트로 본다.
  const mainRoot = [...roots].sort((a, b) => size(b) - size(a))[0] ?? nodes[0]?.id ?? null;
  return { kids, parents, roots, depth, treeParent, treeKids, branch, mainRoot };
}

/** 가장 가까운 연결점(방향) — 두 노드 중심의 상대 위치로 고른다. */
export function nearestHandles(
  a: { cx: number; cy: number },
  b: { cx: number; cy: number },
): { s: Dir; t: Dir } {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { s: "r", t: "l" } : { s: "l", t: "r" };
  return dy >= 0 ? { s: "b", t: "t" } : { s: "t", t: "b" };
}

/** 저장된 선의 연결점 id가 없거나 옛 형식이면 노드 위치로 가장 가까운 점을 정해 준다(기존 유효 값은 유지). */
export function fixEdgeHandles<E extends LEdge>(edges: E[], nodes: LNode[]): E[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => {
    const okS = e.sourceHandle && VALID_HANDLES.has(e.sourceHandle);
    const okT = e.targetHandle && VALID_HANDLES.has(e.targetHandle);
    if (okS && okT) return e;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b)
      return {
        ...e,
        sourceHandle: okS ? e.sourceHandle : "r",
        targetHandle: okT ? e.targetHandle : "l",
      };
    const sz = (n: LNode) => ({ w: nodeSize(n, 0).w, h: nodeSize(n, 0).h });
    const ca = { cx: a.position.x + sz(a).w / 2, cy: a.position.y + sz(a).h / 2 };
    const cb = { cx: b.position.x + sz(b).w / 2, cy: b.position.y + sz(b).h / 2 };
    const h = nearestHandles(ca, cb);
    return {
      ...e,
      sourceHandle: okS ? e.sourceHandle : h.s,
      targetHandle: okT ? e.targetHandle : h.t,
    };
  });
}

/** 깊이별 예상 크기(렌더 전·숨김 노드용). 렌더된 노드는 measured(실제 크기)를 우선한다. */
export function nodeSize(n: LNode, depth: number): { w: number; h: number } {
  const w = n.measured?.width ?? n.width;
  const h = n.measured?.height ?? n.height;
  if (w && h) return { w, h };
  if (n.type === "image") return { w: w ?? 240, h: h ?? 180 };
  if (n.type === "shape") return { w: w ?? 180, h: h ?? 110 };
  const text = String(n.data["text"] ?? n.data["label"] ?? "");
  const fs = depth === 0 ? 22 : depth === 1 ? 18 : 15;
  const cap = depth === 0 ? 260 : depth === 1 ? 230 : 240;
  const units = [...text].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 1.15 : 0.68), 0) * fs;
  const inner = Math.min(cap - 28, Math.max(depth === 0 ? 150 : 100, units));
  const lines = Math.max(1, Math.ceil(units / inner));
  return { w: w ?? inner + 28, h: h ?? lines * fs * 1.35 + 24 };
}

interface Ctx {
  kids: Map<string, string[]>;
  size: (id: string) => { w: number; h: number };
}
interface Sub {
  extent: number;
  items: Map<string, { m: number; c: number }>;
}
const SIB_GAP = 28;
const PRIMARY_GAP = 170;
const childGap = (depth: number) => (depth <= 2 ? 110 : 80);

/** main축(가지가 뻗는 방향)·cross축(형제가 늘어서는 방향)으로 서브트리를 촘촘하게 배치한다. */
function buildTree(id: string, dir: Dir, depth: number, ctx: Ctx): Sub {
  const horizontal = dir === "r" || dir === "l";
  const { w, h } = ctx.size(id);
  const M = horizontal ? w : h;
  const C = horizontal ? h : w;
  const kids = ctx.kids.get(id) ?? [];
  if (kids.length === 0) return { extent: C, items: new Map([[id, { m: 0, c: 0 }]]) };
  const subs = kids.map((k) => buildTree(k, dir, depth + 1, ctx));
  const total = subs.reduce((s, x) => s + x.extent, 0) + SIB_GAP * (kids.length - 1);
  const items = new Map<string, { m: number; c: number }>([[id, { m: 0, c: 0 }]]);
  let start = -total / 2;
  const off = M + childGap(depth + 1);
  subs.forEach((sub) => {
    const cc = start + sub.extent / 2;
    start += sub.extent + SIB_GAP;
    for (const [kid, it] of sub.items) items.set(kid, { m: it.m + off, c: it.c + cc });
  });
  return { extent: Math.max(C, total), items };
}

export interface ArrangeResult {
  /** 노드 중심 좌표 */
  centers: Map<string, { x: number; y: number }>;
  /** 트리 선의 연결점(자식 id → {source dir, target dir}) */
  handles: Map<string, { s: Dir; t: Dir }>;
}

export function arrange(nodes: LNode[], edges: LEdge[], mode: LayoutMode): ArrangeResult | null {
  const g = analyze(nodes, edges);
  const root = g.mainRoot;
  if (!root) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const size = (id: string) => nodeSize(byId.get(id)!, g.depth.get(id) ?? 1);
  const ctx: Ctx = { kids: g.treeKids, size };
  const rootNode = byId.get(root)!;
  const rs = size(root);
  const rc = { x: rootNode.position.x + rs.w / 2, y: rootNode.position.y + rs.h / 2 };
  const centers = new Map<string, { x: number; y: number }>([[root, rc]]);
  const handles = new Map<string, { s: Dir; t: Dir }>();
  const primaries = g.treeKids.get(root) ?? [];

  if (mode === "flow") {
    const sub = buildTree(root, "r", 0, ctx);
    for (const [id, it] of sub.items) {
      const s = size(id);
      centers.set(id, { x: rc.x - rs.w / 2 + it.m + s.w / 2, y: rc.y + it.c });
    }
    for (const [id, p] of g.treeParent)
      if (sub.items.has(id) && p) handles.set(id, { s: "r", t: "l" });
    return { centers, handles };
  }

  if (mode === "radial") {
    const leaves = (id: string): number => {
      const k = g.treeKids.get(id) ?? [];
      return k.length ? k.reduce((s, x) => s + leaves(x), 0) : 1;
    };
    const place = (id: string, a0: number, a1: number, depth: number) => {
      const kids = g.treeKids.get(id) ?? [];
      const total = kids.reduce((s, k) => s + leaves(k), 0) || 1;
      let a = a0;
      for (const k of kids) {
        const span = ((a1 - a0) * leaves(k)) / total;
        const mid = a + span / 2;
        const ring = 230 + (depth - 1) * 200;
        const s = size(k);
        centers.set(k, {
          x: rc.x + Math.cos(mid) * (ring + s.w / 4),
          y: rc.y + Math.sin(mid) * (ring + s.h / 2),
        });
        place(k, a, a + span, depth + 1);
        a += span;
      }
    };
    // 1차 가지가 위·오른쪽·아래·왼쪽 축에 오도록 시작 각도를 반 칸 돌려 둔다.
    const a0 = -Math.PI / 2 - Math.PI / Math.max(1, primaries.length);
    place(root, a0, a0 + 2 * Math.PI, 1);
    return { centers, handles };
  }

  // 컴팩트 4방향: 1차 가지를 오른쪽·왼쪽·아래·위 순으로 돌려 가며 나눠 놓는다.
  const order: Dir[] = ["r", "l", "b", "t"];
  const groups = new Map<Dir, string[]>();
  primaries.forEach((p, i) => {
    const d = order[i % 4]!;
    groups.set(d, [...(groups.get(d) ?? []), p]);
  });
  type Placed = { d: Dir; subs: { id: string; sub: Sub; cc: number }[]; extent: number };
  const placed = new Map<Dir, Placed>();
  for (const [d, ids] of groups) {
    const subs = ids.map((id) => ({ id, sub: buildTree(id, d, 1, ctx), cc: 0 }));
    const total = subs.reduce((s, x) => s + x.sub.extent, 0) + 40 * (subs.length - 1);
    let start = -total / 2;
    for (const x of subs) {
      x.cc = start + x.sub.extent / 2;
      start += x.sub.extent + 40;
    }
    placed.set(d, { d, subs, extent: total });
  }
  const hlr = Math.max(placed.get("r")?.extent ?? 0, placed.get("l")?.extent ?? 0);
  for (const [d, p] of placed) {
    const base =
      d === "r" || d === "l"
        ? rs.w / 2 + PRIMARY_GAP
        : Math.max(rs.h / 2 + PRIMARY_GAP, hlr / 2 + 48);
    for (const { id: pid, sub, cc } of p.subs) {
      for (const [id, it] of sub.items) {
        const s = size(id);
        const near = base + it.m;
        const cross = cc + it.c;
        if (d === "r") centers.set(id, { x: rc.x + near + s.w / 2, y: rc.y + cross });
        else if (d === "l") centers.set(id, { x: rc.x - near - s.w / 2, y: rc.y + cross });
        else if (d === "b") centers.set(id, { x: rc.x + cross, y: rc.y + near + s.h / 2 });
        else centers.set(id, { x: rc.x + cross, y: rc.y - near - s.h / 2 });
        handles.set(id, { s: d, t: DIR_OPPOSITE[d] });
      }
      void pid;
    }
  }
  return { centers, handles };
}
