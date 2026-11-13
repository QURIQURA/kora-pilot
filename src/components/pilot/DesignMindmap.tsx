import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  ConnectionMode,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { currentUserId } from "@/lib/queries";
import {
  analyze,
  arrange,
  DIR_OPPOSITE as OPP,
  fixEdgeHandles,
  nearestHandles,
  nodeSize,
  type LayoutMode,
  type LEdge,
  type LNode,
} from "@/lib/mindmap-layout";
import { buttonClass } from "./ui";

/** DESIGN BOARD 마인드맵(2026-11-13) — Miro식 자유 캔버스. 노트(텍스트) 노드를 배치하고 선으로 연결한다.
 * 보드 한 개당 design_moodboards.mindmap(jsonb)에 {nodes, edges, viewport}를 통째로 자동 저장한다. */

/** 사방(위·아래·왼·오른쪽) 연결점 — ConnectionMode.Loose라 어느 점에서 어느 점으로든 연결된다. */
const SIDES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
] as const;
function Handles() {
  return (
    <>
      {SIDES.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position}
          style={{ width: 9, height: 9 }}
        />
      ))}
    </>
  );
}
type Dir = "r" | "l" | "t" | "b";
const DIR_OPPOSITE: Record<Dir, string> = OPP;

const ARROW = { type: MarkerType.ArrowClosed, width: 10, height: 10 } as const;
const COLORS = ["#fff7c2", "#ffd9e1", "#d6ecff", "#dff5dc", "#e8dcff", "#ffffff"] as const;

const GENERIC_LABELS = new Set(["strategy", "action"]);

/** 접기/펼치기·검색용 값 — collapsed만 저장하고 _로 시작하는 값은 화면 계산용(저장 안 함). */
type Extra = {
  collapsed?: boolean;
  locked?: boolean;
  _kids?: number;
  _hidden?: number;
  _match?: boolean;
  _dim?: boolean;
  _path?: boolean;
  _depth?: number;
  _auto?: string;
};

/** 1차 가지 파스텔 색(자동 배색) — 노트에 색을 직접 지정하지 않았을 때 */
const BRANCH_COLORS = ["#dbe7ff", "#ffeed6", "#e3f8e5", "#ece6ff", "#ffe0e6", "#d6f1f3", "#fff3c4"];
const ROOT_BG = "#1b2550";
type NoteData = { text: string; color: string } & Extra;
type ShapeKind = "rect" | "round" | "ellipse" | "diamond";
type ShapeData = { text: string; color: string; shape: ShapeKind } & Extra;
type ImageData = { url: string } & Extra;
type NoteNode = Node<NoteData, "note"> | Node<ShapeData, "shape"> | Node<ImageData, "image">;

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "rect", label: "▭ 사각형" },
  { kind: "round", label: "▢ 둥근 사각형" },
  { kind: "ellipse", label: "◯ 원" },
  { kind: "diamond", label: "◇ 마름모" },
];

/** 하위 노드가 있는 노드의 접기/펼치기 버튼 — 접히면 숨겨진 개수를 보여 준다. */
function CollapseButton({ id, data }: { id: string; data: Extra }) {
  const { updateNodeData } = useReactFlow();
  if (!data._kids) return null;
  return (
    <button
      type="button"
      title={data.collapsed ? "하위 노드 펼치기" : "하위 노드 접기"}
      className="nodrag absolute -right-3 -top-3 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-black/50 bg-white px-1 font-mono text-[10px] text-black shadow hover:bg-neutral-100"
      onClick={(e) => {
        e.stopPropagation();
        updateNodeData(id, { collapsed: !data.collapsed });
      }}
    >
      {data.collapsed ? `+${data._hidden ?? data._kids}` : "−"}
    </button>
  );
}

/** 검색 결과 강조/흐림 */
function searchStyle(d: Extra): React.CSSProperties {
  return {
    opacity: d._dim ? 0.22 : 1,
    outline: d._match ? "3px solid #f59e0b" : d._path ? "2px dashed #f59e0b" : undefined,
    outlineOffset: 2,
  };
}

function ShapeNodeView({ id, data, selected, width, height }: NodeProps<Node<ShapeData, "shape">>) {
  const { updateNodeData } = useReactFlow();
  const w = width ?? 180;
  const h = height ?? 110;
  const stroke = selected ? "#111" : "rgba(0,0,0,0.45)";
  return (
    <div className="relative" style={{ width: w, height: h, ...searchStyle(data) }}>
      <NodeResizer isVisible={selected} minWidth={70} minHeight={50} />
      <Handles />
      <CollapseButton id={id} data={data} />
      {data.shape === "diamond" ? (
        <svg className="absolute inset-0" width={w} height={h}>
          <polygon
            points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`}
            fill={data.color}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1}
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: data.color,
            border: `${selected ? 2 : 1}px solid ${stroke}`,
            borderRadius: data.shape === "ellipse" ? "50%" : data.shape === "round" ? 18 : 0,
          }}
        />
      )}
      <textarea
        className="nodrag nowheel absolute left-1/2 top-1/2 block w-[70%] -translate-x-1/2 -translate-y-1/2 resize-none bg-transparent text-center font-mono text-xs leading-snug text-black outline-none"
        rows={Math.min(5, Math.max(1, (data.text.match(/\n/g)?.length ?? 0) + 1))}
        placeholder="텍스트"
        value={data.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
    </div>
  );
}

function ImageNodeView({ id, data, selected, width }: NodeProps<Node<ImageData, "image">>) {
  return (
    <div
      className="border bg-white p-1 shadow-sm"
      style={{
        width: width ?? 220,
        borderColor: selected ? "#111" : "rgba(0,0,0,0.25)",
        borderWidth: selected ? 2 : 1,
        ...searchStyle(data),
      }}
    >
      <NodeResizer isVisible={selected} minWidth={80} keepAspectRatio />
      <Handles />
      <CollapseButton id={id} data={data} />
      <img src={data.url} alt="" draggable={false} className="pointer-events-none block w-full" />
    </div>
  );
}

/** 글자 폭 추정(한글 등 전각은 1em, 영문·숫자는 0.58em) */
function textUnits(line: string, fs: number) {
  return [...line].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 1.15 : 0.68), 0) * fs;
}

function NoteNodeView({ id, data, selected }: NodeProps<Node<NoteData, "note">>) {
  const { updateNodeData } = useReactFlow();
  const depth = data._depth ?? 2;
  const isRoot = depth === 0;
  const fs = isRoot ? 22 : depth === 1 ? 18 : 15;
  const weight = isRoot ? 700 : depth === 1 ? 700 : 500;
  const maxInner = (isRoot ? 260 : depth === 1 ? 230 : 240) - 28;
  const minInner = isRoot ? 150 : depth === 1 ? 110 : 90;
  const bg = data.color || (isRoot ? ROOT_BG : depth === 1 ? (data._auto ?? "#dbe7ff") : "#ffffff");
  const light = !data.color && isRoot;
  const lines = data.text.split("\n");
  const longest = Math.max(...lines.map((l) => textUnits(l, fs)), 0);
  const inner = Math.min(maxInner, Math.max(minInner, longest + 4));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(textUnits(l, fs) / inner)), 0);
  return (
    <div
      className="relative border shadow-sm"
      style={{
        background: bg,
        borderRadius: isRoot ? 16 : depth === 1 ? 14 : 10,
        padding: isRoot ? "16px 14px" : depth === 1 ? "12px 14px" : "8px 14px",
        borderColor: selected ? "#0f172a" : isRoot ? "#2b3a7a" : "rgba(100,116,139,0.55)",
        borderWidth: selected ? 3 : isRoot ? 2 : 1.5,
        ...searchStyle(data),
      }}
    >
      <Handles />
      <CollapseButton id={id} data={data} />
      {data.locked && <span className="absolute -left-2 -top-3 text-[11px]">🔒</span>}
      <textarea
        className="nodrag nowheel block resize-none bg-transparent text-center leading-snug outline-none"
        style={{
          width: inner,
          fontSize: fs,
          fontWeight: weight,
          color: light ? "#ffffff" : "#0f172a",
          fontFamily: "inherit",
        }}
        rows={rows}
        placeholder="텍스트 입력"
        value={data.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
    </div>
  );
}

const nodeTypes = { note: NoteNodeView, shape: ShapeNodeView, image: ImageNodeView };

type Saved = {
  nodes?: Record<string, unknown>[];
  edges?: Edge[];
  meta?: { v?: number; arranged?: boolean };
};

/** 예전 저장 데이터 정규화 — 외부에서 만든 "default" 타입(data.label) 노드를 노트로 바꾼다.
 * id·위치·글자(label→text)는 그대로 보존하고 지우는 것은 없다. */
function normalizeNodes(raw: Record<string, unknown>[]): { nodes: NoteNode[]; legacy: boolean } {
  let legacy = false;
  const nodes = raw.map((n) => {
    const type = n["type"];
    const d = (n["data"] ?? {}) as Record<string, unknown>;
    if (type === "shape" || type === "image") return n as unknown as NoteNode;
    if (type !== "note") legacy = true;
    const text = typeof d["text"] === "string" ? d["text"] : String(d["label"] ?? "");
    return {
      ...n,
      type: "note",
      position: (n["position"] as { x: number; y: number }) ?? { x: 0, y: 0 },
      data: { ...d, text, color: typeof d["color"] === "string" ? d["color"] : "" },
    } as unknown as NoteNode;
  });
  return { nodes, legacy };
}

function MindmapCanvas({ boardId }: { boardId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition, fitView, setCenter, zoomTo } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingArrange = useRef(false);
  const metaRef = useRef<{ v: number; arranged: boolean }>({ v: 2, arranged: false });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("design_moodboards")
        .select("mindmap")
        .eq("id", boardId)
        .single();
      if (!alive) return;
      if (error) {
        setStatus("error");
        return;
      }
      const saved = (data.mindmap ?? {}) as Saved;
      const { nodes: loadedNodes, legacy } = normalizeNodes(saved.nodes ?? []);
      const fixed = fixEdgeHandles(
        (saved.edges ?? []) as unknown as (Edge & LEdge)[],
        loadedNodes as unknown as LNode[],
      ) as Edge[];
      // 외부에서 만든(예전 형식) 보드는 처음 한 번만 컴팩트 정렬 + 1차 가지까지만 펼쳐 보여 준다.
      if (legacy && !saved.meta?.arranged && loadedNodes.length > 0) {
        const g = analyze(loadedNodes, fixed as LEdge[]);
        const big = loadedNodes.length > 20;
        setNodes(
          loadedNodes.map((n) =>
            big && (g.treeKids.get(n.id)?.length ?? 0) > 0 && (g.depth.get(n.id) ?? 0) >= 1
              ? ({ ...n, data: { ...n.data, collapsed: true } } as NoteNode)
              : n,
          ),
        );
        pendingArrange.current = true;
      } else {
        setNodes(loadedNodes);
      }
      metaRef.current = { v: 2, arranged: Boolean(saved.meta?.arranged) };
      setEdges(fixed);
      setLoaded(true);
      setTimeout(() => void fitView({ padding: 0.2, minZoom: 0.6, maxZoom: 1 }), 80);
    })();
    return () => {
      alive = false;
    };
  }, [boardId, setNodes, setEdges, fitView]);

  // 변경이 멈추고 0.8초 뒤 자동 저장(선택 상태 등 일시 값은 빼고 저장).
  useEffect(() => {
    if (!loaded) return;
    setStatus("saving");
    const t = setTimeout(() => {
      const payload = {
        meta: metaRef.current,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: Object.fromEntries(Object.entries(n.data).filter(([k]) => !k.startsWith("_"))),
          width: n.width,
          height: n.height,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: e.type,
          label: e.label,
          markerEnd: e.markerEnd,
          markerStart: e.markerStart,
        })),
      };
      void supabase
        .from("design_moodboards")
        .update({ mindmap: payload as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", boardId)
        .then(({ error }) => setStatus(error ? "error" : "saved"));
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded, boardId]);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) => addEdge({ ...c, type: "smoothstep", markerEnd: ARROW }, es)),
    [setEdges],
  );

  // ── 접기/펼치기: 선(source→target)을 따라 내려가는 하위 노드를 숨긴다 ──
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const graph = useMemo(() => {
    const a = analyze(nodes, edges as LEdge[]);
    const { kids, parents } = a;
    const hidden = new Set<string>();
    const hiddenCount = new Map<string, number>();
    for (const n of nodes) {
      if (!(n.data as Extra).collapsed) continue;
      const seen = new Set<string>([n.id]);
      const stack = [...(kids.get(n.id) ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        hidden.add(id);
        stack.push(...(kids.get(id) ?? []));
      }
      hiddenCount.set(n.id, seen.size - 1);
    }
    return { ...a, kids, parents, hidden, hiddenCount };
  }, [nodes, edges]);

  const q = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!q) return [] as string[];
    const out: string[] = [];
    for (const n of nodes) {
      const t = (n.data as { text?: string }).text;
      if (typeof t === "string" && t.toLowerCase().includes(q)) out.push(n.id);
    }
    // 선 글자가 일치하면 그 선이 가리키는(자식) 노드를 결과로 센다.
    for (const e of edges) {
      if (
        typeof e.label === "string" &&
        e.label.toLowerCase().includes(q) &&
        !out.includes(e.target)
      )
        out.push(e.target);
    }
    return out;
  }, [nodes, edges, q]);
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  // 현재 결과의 부모 경로 강조
  const currentMatch = matchIdx >= 0 ? (matchIds[matchIdx] ?? null) : null;
  const pathNodes = useMemo(() => {
    const out = new Set<string>();
    let cur = currentMatch;
    while (cur) {
      const p = graph.treeParent.get(cur);
      if (!p || out.has(p)) break;
      out.add(p);
      cur = p;
    }
    return out;
  }, [currentMatch, graph]);

  // ── 포커스 모드: 선택한 노드와 직접 연결된 노드/선만 밝게 ──
  const [focusMode, setFocusMode] = useState<"off" | "near" | "branch">("off");
  const [labelMode, setLabelMode] = useState<"smart" | "all" | "none">("smart");
  const focusSet = useMemo(() => {
    const sel = nodes.find((n) => n.selected);
    if (focusMode === "off" || !sel) return null;
    const set = new Set<string>([sel.id]);
    for (const e of edges) {
      if (e.source === sel.id) set.add(e.target);
      if (e.target === sel.id) set.add(e.source);
    }
    if (focusMode === "branch") {
      const stack = [...(graph.kids.get(sel.id) ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        if (set.has(id)) continue;
        set.add(id);
        stack.push(...(graph.kids.get(id) ?? []));
      }
    }
    return set;
  }, [nodes, edges, focusMode, graph]);

  const viewNodes = useMemo(
    () =>
      nodes.map((n) => {
        const d = n.data as Extra;
        const data = {
          ...n.data,
          _kids: graph.kids.get(n.id)?.length ?? 0,
          _hidden: graph.hiddenCount.get(n.id) ?? 0,
          _match: matchSet.has(n.id),
          _path: pathNodes.has(n.id),
          _depth: graph.depth.get(n.id) ?? 2,
          _auto: BRANCH_COLORS[(graph.branch.get(n.id) ?? 0) % BRANCH_COLORS.length],
          _dim:
            (q !== "" && !matchSet.has(n.id) && !pathNodes.has(n.id)) ||
            (focusSet !== null && !focusSet.has(n.id)),
        };
        return {
          ...n,
          data,
          hidden: graph.hidden.has(n.id),
          draggable: !d.locked,
        } as NoteNode;
      }),
    [nodes, graph, matchSet, pathNodes, q, focusSet],
  );
  const viewEdges = useMemo(
    () =>
      edges.map((e) => {
        const onPath =
          pathNodes.has(e.source) && (pathNodes.has(e.target) || e.target === currentMatch);
        const inFocus = focusSet === null || (focusSet.has(e.source) && focusSet.has(e.target));
        const stroke = onPath ? "#f59e0b" : e.selected ? "#0f172a" : "#64748b";
        const label = typeof e.label === "string" ? e.label : "";
        const showLabel =
          labelMode === "all" ||
          (labelMode === "smart" && !GENERIC_LABELS.has(label.trim().toLowerCase()));
        const mk = (m: unknown) =>
          m ? { type: MarkerType.ArrowClosed, width: 10, height: 10, color: stroke } : undefined;
        const base = {
          ...e,
          hidden: graph.hidden.has(e.source) || graph.hidden.has(e.target),
          zIndex: onPath || e.selected ? 10 : 5,
          style: {
            stroke,
            strokeWidth: e.selected || onPath ? 3.5 : 2.5,
            opacity: inFocus ? 1 : 0.15,
          },
          pathOptions: { borderRadius: 14 },
          labelStyle: { fontSize: 12, fontWeight: 500, fill: "#0f172a" },
          labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95, stroke: "#cbd5e1" },
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 6,
          label: showLabel && label ? label : undefined,
        };
        const { markerEnd: _me, markerStart: _ms, ...rest } = base;
        void _me;
        void _ms;
        const end = mk(e.markerEnd);
        const start = mk(e.markerStart);
        return {
          ...rest,
          ...(end ? { markerEnd: end } : {}),
          ...(start ? { markerStart: start } : {}),
        } as Edge;
      }),
    [edges, graph, pathNodes, currentMatch, focusSet, labelMode],
  );

  const patchCollapsed = (fn: (id: string) => boolean) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.type === "image" && !graph.kids.get(n.id)?.length
          ? n
          : ({ ...n, data: { ...n.data, collapsed: fn(n.id) } } as NoteNode),
      ),
    );
  // 단계별 보기: 루트(들어오는 선이 없는 노드)=0단계. N단계까지 보이고 그 아래는 접는다.
  const showLevel = (level: number | "all") => {
    if (level === "all") patchCollapsed(() => false);
    else {
      const depth = new Map<string, number>();
      const roots = nodes.filter((n) => !graph.parents.get(n.id)?.length).map((n) => n.id);
      const queue: [string, number][] = (roots.length ? roots : nodes.map((n) => n.id)).map(
        (id) => [id, 0],
      );
      while (queue.length) {
        const [id, d] = queue.shift()!;
        if (depth.has(id)) continue;
        depth.set(id, d);
        for (const k of graph.kids.get(id) ?? []) queue.push([k, d + 1]);
      }
      patchCollapsed(
        (id) => (depth.get(id) ?? 0) >= level && (graph.kids.get(id)?.length ?? 0) > 0,
      );
    }
    setTimeout(
      () => void fitView({ padding: 0.15, minZoom: 0.55, maxZoom: 1.1, duration: 300 }),
      80,
    );
  };

  // 검색: 다음 결과로 이동 — 접힌 조상은 펼치고 그 노드로 화면을 맞춘다.
  const goToMatch = (dir: 1 | -1) => {
    if (matchIds.length === 0) return;
    const i = (((matchIdx + dir) % matchIds.length) + matchIds.length) % matchIds.length;
    setMatchIdx(i);
    const target = matchIds[i]!;
    const ancestors = new Set<string>();
    const stack = [...(graph.parents.get(target) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      stack.push(...(graph.parents.get(id) ?? []));
    }
    setNodes((ns) =>
      ns.map((n) =>
        ancestors.has(n.id) && (n.data as Extra).collapsed
          ? ({ ...n, data: { ...n.data, collapsed: false } } as NoteNode)
          : n,
      ),
    );
    setTimeout(
      () => void fitView({ nodes: [{ id: target }], duration: 400, maxZoom: 1.3, padding: 0.6 }),
      120,
    );
  };
  useEffect(() => setMatchIdx(-1), [q]);

  // ── 자동 정렬(컴팩트 4방향 / 방사형 / 플로우차트) — 고정(🔒)한 노드는 그대로 둔다 ──
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("compact");
  const runArrange = (mode: LayoutMode = layoutMode) => {
    const ln: LNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as Record<string, unknown>,
      width: n.width,
      height: n.height,
      measured: n.measured,
    }));
    const res = arrange(ln, edges as LEdge[], mode);
    if (!res) return;
    const sizeOf = new Map(ln.map((n) => [n.id, nodeSize(n, graph.depth.get(n.id) ?? 2)] as const));
    const centers = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const sz = sizeOf.get(n.id)!;
      const locked = Boolean((n.data as Extra).locked);
      const c = locked ? undefined : res.centers.get(n.id);
      centers.set(n.id, c ?? { x: n.position.x + sz.w / 2, y: n.position.y + sz.h / 2 });
    }
    setNodes((ns) =>
      ns.map((n) => {
        const c = res.centers.get(n.id);
        if (!c || (n.data as Extra).locked) return n;
        const sz = sizeOf.get(n.id)!;
        return { ...n, position: { x: c.x - sz.w / 2, y: c.y - sz.h / 2 } };
      }),
    );
    setEdges((es) =>
      es.map((e) => {
        const t = res.handles.get(e.target);
        if (t && graph.treeParent.get(e.target) === e.source)
          return { ...e, sourceHandle: t.s, targetHandle: t.t };
        const a = centers.get(e.source);
        const b = centers.get(e.target);
        if (!a || !b) return e;
        const h = nearestHandles({ cx: a.x, cy: a.y }, { cx: b.x, cy: b.y });
        return { ...e, sourceHandle: h.s, targetHandle: h.t };
      }),
    );
    metaRef.current = { v: 2, arranged: true };
    setTimeout(
      () => void fitView({ padding: 0.15, minZoom: 0.55, maxZoom: 1.1, duration: 400 }),
      120,
    );
  };
  const arrangeRef = useRef(runArrange);
  arrangeRef.current = runArrange;
  useEffect(() => {
    if (!loaded || !pendingArrange.current) return;
    const t = setTimeout(() => {
      if (!pendingArrange.current) return;
      pendingArrange.current = false;
      arrangeRef.current("compact");
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, nodes.length]);

  const centerOnRoot = () => {
    const rid = graph.mainRoot;
    const n = rid ? nodes.find((x) => x.id === rid) : null;
    if (!n) return;
    const sz = nodeSize(
      {
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as Record<string, unknown>,
        width: n.width,
        height: n.height,
        measured: n.measured,
      },
      0,
    );
    void setCenter(n.position.x + sz.w / 2, n.position.y + sz.h / 2, { zoom: 1, duration: 400 });
  };

  const toggleLock = () =>
    setNodes((ns) =>
      ns.map((n) => {
        if (!n.selected) return n;
        const d = n.data as Extra;
        return { ...n, data: { ...n.data, locked: !d.locked } } as NoteNode;
      }),
    );

  const selected = nodes.find((n) => n.selected) ?? null;
  const newId = () => `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const centerPos = () => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2 - 70 + Math.random() * 40,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 - 30 + Math.random() * 40,
    });
  };
  const addShape = (shape: ShapeKind) => {
    const node: NoteNode = {
      id: newId(),
      type: "shape",
      position: centerPos(),
      width: shape === "ellipse" || shape === "diamond" ? 170 : 180,
      height: 110,
      data: { text: "", color: COLORS[0], shape },
      selected: true,
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
  };
  const [childDir, setChildDir] = useState<Dir>("r");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addImages = async (files: File[], at?: { x: number; y: number }) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const userId = await currentUserId();
      const added: NoteNode[] = [];
      for (const [i, file] of images.entries()) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${userId}/design/${boardId}/mindmap-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage
          .from("order-moodboards")
          .upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from("order-moodboards").getPublicUrl(path);
        const base = at ?? centerPos();
        added.push({
          id: newId(),
          type: "image",
          position: { x: base.x + i * 30, y: base.y + i * 30 },
          width: 240,
          data: { url: data.publicUrl },
        });
      }
      setNodes((ns) => [...ns, ...added]);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addNote = (opts?: { parent?: NoteNode }) => {
    const id = newId();
    let position: { x: number; y: number };
    if (opts?.parent) {
      // 선택한 방향(→ ← ↑ ↓)으로 자식을 놓는다. 같은 방향 형제는 옆으로 나란히 벌린다.
      const siblings = edges.filter(
        (e) => e.source === opts.parent!.id && e.sourceHandle === childDir,
      ).length;
      const gx = childDir === "r" ? 260 : childDir === "l" ? -260 : 0;
      const gy = childDir === "b" ? 150 : childDir === "t" ? -150 : 0;
      const spread = siblings * (childDir === "r" || childDir === "l" ? 90 : 200);
      position = {
        x: opts.parent.position.x + gx + (gx === 0 ? spread : 0),
        y: opts.parent.position.y + gy + (gx === 0 ? 0 : spread),
      };
    } else {
      const rect = wrapRef.current?.getBoundingClientRect();
      position = screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2 - 70 + Math.random() * 40,
        y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 - 30 + Math.random() * 40,
      });
    }
    const node: NoteNode = {
      id,
      type: "note",
      position,
      data: {
        text: "",
        color: (opts?.parent && "color" in opts.parent.data && opts.parent.data.color) || COLORS[0],
      },
      selected: true,
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    if (opts?.parent)
      setEdges((es) => [
        ...es,
        {
          id: `e-${opts.parent!.id}-${id}`,
          source: opts.parent!.id,
          target: id,
          sourceHandle: childDir,
          targetHandle: DIR_OPPOSITE[childDir],
          type: "smoothstep",
          markerEnd: ARROW,
        },
      ]);
  };

  const setColor = (color: string) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.selected && n.type !== "image" ? ({ ...n, data: { ...n.data, color } } as NoteNode) : n,
      ),
    );

  // 선 편집 — 선택한 선의 글자와 화살표(없음 / → / ← / ↔).
  const selectedEdge = edges.find((e) => e.selected) ?? null;
  const patchEdge = (patch: Partial<Edge>) =>
    setEdges((es) => es.map((e) => (e.selected ? { ...e, ...patch } : e)));
  const setArrows = (mode: "none" | "end" | "start" | "both") =>
    setEdges((es) =>
      es.map((e) => {
        if (!e.selected) return e;
        const { markerEnd: _me, markerStart: _ms, ...rest } = e;
        void _me;
        void _ms;
        return {
          ...rest,
          ...(mode === "end" || mode === "both" ? { markerEnd: ARROW } : {}),
          ...(mode === "start" || mode === "both" ? { markerStart: ARROW } : {}),
        };
      }),
    );
  const arrowMode = selectedEdge
    ? selectedEdge.markerEnd && selectedEdge.markerStart
      ? "both"
      : selectedEdge.markerEnd
        ? "end"
        : selectedEdge.markerStart
          ? "start"
          : "none"
    : "none";

  const removeSelected = () => {
    const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
    setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target) && !e.selected));
  };

  const statusText = useMemo(
    () =>
      ({
        idle: "",
        saving: "저장 중…",
        saved: "저장됨",
        error: "저장 실패 — 새로고침 후 다시 시도",
      })[status],
    [status],
  );

  return (
    <div className="mm space-y-2">
      <style>{`.mm .react-flow__handle{opacity:0;transition:opacity .12s}.mm .react-flow__node:hover .react-flow__handle,.mm .react-flow__node.selected .react-flow__handle,.mm .react-flow__handle.connectingfrom,.mm .react-flow__handle.connectingto{opacity:1}`}</style>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={() => addNote()}>
          + 노트
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!selected || selected.type === "image"}
          onClick={() => selected && addNote({ parent: selected })}
        >
          + 하위 노트
        </button>
        <select
          aria-label="하위 노트 방향"
          className="h-9 border border-border bg-background px-2 font-mono text-xs"
          value={childDir}
          onChange={(e) => setChildDir(e.target.value as Dir)}
        >
          <option value="r">→ 오른쪽</option>
          <option value="l">← 왼쪽</option>
          <option value="b">↓ 아래</option>
          <option value="t">↑ 위</option>
        </select>
        <select
          aria-label="도형 추가"
          className="h-9 border border-border bg-background px-2 font-mono text-xs"
          value=""
          onChange={(e) => e.target.value && addShape(e.target.value as ShapeKind)}
        >
          <option value="">+ 도형</option>
          {SHAPES.map((sh) => (
            <option key={sh.kind} value={sh.kind}>
              {sh.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={buttonClass}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "업로드 중…" : "+ 이미지"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addImages(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title="선택한 노트 색상"
              disabled={!selected}
              onClick={() => setColor(c)}
              className="h-6 w-6 border border-black/30 disabled:opacity-40"
              style={{ background: c }}
            />
          ))}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
          onClick={removeSelected}
        >
          선택 삭제
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            void fitView({ padding: 0.15, minZoom: 0.55, maxZoom: 1.1, duration: 300 })
          }
        >
          전체 보기
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{statusText}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="마인드맵 검색"
          className="h-8 min-w-[12rem] flex-1 border border-border bg-background px-2 font-mono text-xs"
          placeholder="🔍 노드·선 글자 검색 (Enter = 다음 결과)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToMatch(e.shiftKey ? -1 : 1);
          }}
        />
        {q && (
          <>
            <span className="font-mono text-[11px] text-muted-foreground">
              {matchIds.length === 0
                ? "결과 없음"
                : `${matchIdx >= 0 ? matchIdx + 1 : "-"}/${matchIds.length}`}
            </span>
            <button
              type="button"
              className={`${buttonClass} !h-8 !min-h-0 px-2`}
              onClick={() => goToMatch(-1)}
            >
              ▲
            </button>
            <button
              type="button"
              className={`${buttonClass} !h-8 !min-h-0 px-2`}
              onClick={() => goToMatch(1)}
            >
              ▼
            </button>
            <button
              type="button"
              className={`${buttonClass} !h-8 !min-h-0 px-2`}
              onClick={() => setQuery("")}
            >
              ✕
            </button>
          </>
        )}
        <select
          aria-label="단계별 보기"
          className="h-8 border border-border bg-background px-2 font-mono text-xs"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) showLevel(v === "all" ? "all" : Number(v));
          }}
        >
          <option value="">단계별 보기…</option>
          <option value="0">0단계 (최상위만)</option>
          <option value="1">1단계까지</option>
          <option value="2">2단계까지</option>
          <option value="3">3단계까지</option>
          <option value="all">전체 펼치기</option>
        </select>
        <select
          aria-label="자동 정렬 방식"
          className="h-8 border border-border bg-background px-2 font-mono text-xs"
          value={layoutMode}
          onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
        >
          <option value="compact">컴팩트 (4방향)</option>
          <option value="radial">방사형</option>
          <option value="flow">플로우차트 (→)</option>
        </select>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          title="노드 위치를 선택한 방식으로 다시 배치합니다(🔒 고정한 노드는 그대로)"
          onClick={() => {
            if (
              window.confirm(
                "노드 위치를 자동으로 다시 배치할까요? (🔒 고정한 노드는 그대로 둡니다)",
              )
            )
              runArrange();
          }}
        >
          자동 정렬
        </button>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          disabled={!selected}
          onClick={toggleLock}
          title="선택한 노드 위치 고정/해제 (자동 정렬·드래그 제외)"
        >
          🔒 위치 고정
        </button>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          onClick={() => void zoomTo(1, { duration: 250 })}
        >
          100%
        </button>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          onClick={centerOnRoot}
        >
          루트로 이동
        </button>
        <select
          aria-label="포커스 모드"
          className="h-8 border border-border bg-background px-2 font-mono text-xs"
          value={focusMode}
          onChange={(e) => setFocusMode(e.target.value as "off" | "near" | "branch")}
          title="노드를 선택하면 연결된 노드만 밝게 보여 줍니다"
        >
          <option value="off">포커스 끔</option>
          <option value="near">포커스: 연결된 노드</option>
          <option value="branch">포커스: 하위 전체</option>
        </select>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          title="선 글자 표시: 의미 있는 글자만 / 전부 / 숨김"
          onClick={() =>
            setLabelMode((m) => (m === "smart" ? "all" : m === "all" ? "none" : "smart"))
          }
        >
          선 글자: {labelMode === "smart" ? "핵심만" : labelMode === "all" ? "전부" : "숨김"}
        </button>
        <button
          type="button"
          className={`${buttonClass} !h-8 !min-h-0 px-3`}
          disabled={!selected || !graph.kids.get(selected.id)?.length}
          onClick={() =>
            selected &&
            setNodes((ns) =>
              ns.map((n) =>
                n.id === selected.id
                  ? ({
                      ...n,
                      data: { ...n.data, collapsed: !(n.data as Extra).collapsed },
                    } as NoteNode)
                  : n,
              ),
            )
          }
        >
          선택 노드 접기/펼치기
        </button>
      </div>
      {selectedEdge && (
        <div className="flex flex-wrap items-center gap-2 border border-dashed border-border p-2">
          <span className="font-mono text-[11px] uppercase">선</span>
          <input
            aria-label="선 글자"
            className="h-8 min-w-[10rem] flex-1 border border-border bg-background px-2 font-mono text-xs"
            placeholder="선 위에 표시할 글자"
            value={typeof selectedEdge.label === "string" ? selectedEdge.label : ""}
            onChange={(e) => patchEdge({ label: e.target.value })}
          />
          {(
            [
              ["none", "—"],
              ["end", "→"],
              ["start", "←"],
              ["both", "↔"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              title="화살표"
              className={`${buttonClass} !h-8 !min-h-0 px-3 ${arrowMode === mode ? "!bg-foreground !text-background" : ""}`}
              onClick={() => setArrows(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="font-mono text-[11px] text-muted-foreground">
        드래그로 이동 · 휠로 확대/축소 · 사방의 점(위·아래·좌·우)을 끌어 연결 · 도형/이미지는
        선택하면 모서리로 크기 조절 · 이미지는 파일을 캔버스에 끌어놓거나 붙여넣기(Ctrl/⌘+V)도 가능
        · Delete로 삭제
      </p>
      {uploadError && <p className="font-mono text-xs text-destructive">{uploadError}</p>}
      <div
        ref={wrapRef}
        tabIndex={-1}
        className="h-[70vh] min-h-[420px] border border-border bg-card outline-none"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          void addImages(
            Array.from(e.dataTransfer.files),
            screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          );
        }}
        onPaste={(e) => {
          if ((e.target as HTMLElement).closest("textarea,input")) return;
          const files = Array.from(e.clipboardData.files);
          if (files.length > 0) {
            e.preventDefault();
            void addImages(files);
          }
        }}
      >
        <ReactFlow
          defaultEdgeOptions={{
            labelStyle: { fontSize: 11, fontFamily: "monospace" },
            labelBgPadding: [6, 3],
            labelBgStyle: { fill: "#fff" },
          }}
          nodes={viewNodes}
          edges={viewEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Delete", "Backspace"]}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function DesignMindmap({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <MindmapCanvas boardId={boardId} />
    </ReactFlowProvider>
  );
}
