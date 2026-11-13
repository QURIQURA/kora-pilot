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
  Panel,
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
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  CornerDownRight,
  Focus,
  Image as ImageIcon,
  LayoutGrid,
  LocateFixed,
  Map as MapIcon,
  Maximize,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMeta, type NodeMeta } from "@/lib/mindmap-node-meta";
import { fetchPlannerTasks } from "@/lib/mindmap-planner";
import { MindmapDetailPanel, type RelNode } from "./MindmapDetailPanel";
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
  _prog?: string;
  _autoEdit?: boolean;
  /** 상세 패널 데이터(설명·우선순위·상태·실행 항목·링크·연결 작업 id) — 없어도 정상 동작 */
  meta?: NodeMeta;
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
  const ed = useInlineEdit(id, data._autoEdit);
  return (
    <div
      className="relative"
      style={{ width: w, height: h, ...searchStyle(data) }}
      onDoubleClick={ed.start}
    >
      <ProgressPill prog={data._prog} />
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
        ref={ed.ref}
        {...ed.areaProps}
        className={`${ed.areaClass} absolute left-1/2 top-1/2 block w-[70%] -translate-x-1/2 -translate-y-1/2 resize-none bg-transparent text-center font-mono text-xs leading-snug text-black outline-none`}
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
      <ProgressPill prog={data._prog} />
      <img src={data.url} alt="" draggable={false} className="pointer-events-none block w-full" />
    </div>
  );
}

/** 더블클릭으로 제목 편집(2026-11-13) — 평소에는 글자 위에서도 노드가 드래그/선택되고, 더블클릭하면 편집 모드. */
function useInlineEdit(id: string, autoEdit?: boolean) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoEdit) {
      setEditing(true);
      updateNodeData(id, { _autoEdit: false });
    }
  }, [autoEdit, id, updateNodeData]);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);
  return {
    editing,
    ref,
    start: () => setEditing(true),
    areaProps: {
      readOnly: !editing,
      onBlur: () => setEditing(false),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        e.stopPropagation();
      },
    },
    areaClass: editing ? "nodrag nowheel" : "pointer-events-none select-none",
  };
}

/** 연결된 작업 진행 표시 — 작업이 있는 노드에만 보인다(예: 2/5). */
function ProgressPill({ prog }: { prog?: string | undefined }) {
  if (!prog) return null;
  return (
    <span className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-black/40 bg-white px-1.5 font-mono text-[10px] leading-4 text-black shadow-sm">
      ✓ {prog}
    </span>
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
  const ed = useInlineEdit(id, data._autoEdit);
  return (
    <div
      onDoubleClick={ed.start}
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
      <ProgressPill prog={data._prog} />
      <textarea
        ref={ed.ref}
        {...ed.areaProps}
        className={`${ed.areaClass} block resize-none bg-transparent text-center leading-snug outline-none`}
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

function MindmapCanvas({ boardId, focusNodeId }: { boardId: string; focusNodeId?: string | undefined }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition, fitView, setCenter, zoomTo, zoomIn, zoomOut } = useReactFlow();
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

  // ── 연결된 플래너 작업 진행(완료/전체) — 상태의 원천은 플래너라 열 때·1분마다·변경 시 다시 읽는다 ──
  const [taskDone, setTaskDone] = useState<Map<string, boolean>>(new Map());
  const allTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) for (const id of getMeta(n.data).taskIds ?? []) set.add(id);
    return [...set].sort();
  }, [nodes]);
  const taskKey = allTaskIds.join(",");
  useEffect(() => {
    if (!loaded || !taskKey) {
      setTaskDone(new Map());
      return;
    }
    let alive = true;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      fetchPlannerTasks(taskKey.split(","))
        .then((ts) => alive && setTaskDone(new Map(ts.map((t) => [t.id, t.completed]))))
        .catch(() => undefined);
    };
    run();
    const t = setInterval(run, 60_000);
    window.addEventListener("mm-tasks-changed", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("mm-tasks-changed", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [loaded, taskKey]);
  const progressOf = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      const ids = n ? (getMeta(n.data).taskIds ?? []) : [];
      if (ids.length === 0) return undefined;
      const known = ids.filter((t) => taskDone.has(t));
      if (known.length === 0) return undefined;
      return `${known.filter((t) => taskDone.get(t)).length}/${known.length}`;
    },
    [nodes, taskDone],
  );

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
          _prog: progressOf(n.id),
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
    [nodes, graph, matchSet, pathNodes, q, focusSet, progressOf],
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
        _autoEdit: true,
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

  // ── 상세 패널 · 우클릭 메뉴 · 연결 모드 · 미니맵 ──
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelFolded, setPanelFolded] = useState(false);
  const [taskRequest, setTaskRequest] = useState(0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"open" | "folded" | "hidden">(() => {
    try {
      const v = localStorage.getItem("mm-minimap");
      return v === "folded" || v === "hidden" ? v : "open";
    } catch {
      return "open";
    }
  });
  const setMap = (m: "open" | "folded" | "hidden") => {
    setMapMode(m);
    try {
      localStorage.setItem("mm-minimap", m);
    } catch {
      /* 저장소를 못 쓰는 환경 — 무시 */
    }
  };
  const panelNode = panelId ? (nodes.find((n) => n.id === panelId) ?? null) : null;
  useEffect(() => {
    if (panelId && !panelNode) setPanelId(null);
  }, [panelId, panelNode]);
  const titleOf = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      const t = n ? (n.data as { text?: string }).text : "";
      return n?.type === "image" ? "🖼 이미지" : (t ?? "").replace(/\n/g, " ");
    },
    [nodes],
  );
  const patchNodeData = (id: string, patch: Record<string, unknown>) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as NoteNode) : n)),
    );
  const patchMeta = (id: string, patch: Partial<NodeMeta>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, meta: { ...getMeta(n.data), ...patch } } } as NoteNode)
          : n,
      ),
    );
  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setPanelId((p) => (p === id ? null : p));
  };
  const duplicateNode = (id: string) => {
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    const meta = { ...getMeta(src.data) };
    delete meta.taskIds; // 같은 작업이 두 노드에 중복 연결되지 않게
    const copy = {
      ...src,
      id: newId(),
      position: { x: src.position.x + 36, y: src.position.y + 36 },
      selected: true,
      data: { ...src.data, collapsed: false, locked: false, meta },
    } as NoteNode;
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), copy]);
  };
  const connectNodes = (fromId: string, toId: string) => {
    const a = nodes.find((n) => n.id === fromId);
    const b = nodes.find((n) => n.id === toId);
    if (!a || !b || fromId === toId) return;
    if (edges.some((e) => e.source === fromId && e.target === toId)) return;
    const c = (n: NoteNode) => {
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
        graph.depth.get(n.id) ?? 2,
      );
      return { cx: n.position.x + sz.w / 2, cy: n.position.y + sz.h / 2 };
    };
    const h = nearestHandles(c(a), c(b));
    setEdges((es) => [
      ...es,
      {
        id: `e-${fromId}-${toId}-${Date.now().toString(36)}`,
        source: fromId,
        target: toId,
        sourceHandle: h.s,
        targetHandle: h.t,
        type: "smoothstep",
        markerEnd: ARROW,
      },
    ]);
  };
  const openPanel = (id: string) => {
    setPanelId(id);
    setPanelFolded(false);
  };
  // Esc: 우클릭 메뉴 → 연결 모드 → 패널 순서로 닫는다(입력 중에는 입력만 빠져나옴).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea,input,select")) return;
      if (menu) setMenu(null);
      else if (connectFrom) setConnectFrom(null);
      else if (panelId) setPanelId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, connectFrom, panelId]);

  const rels = (id: string) => {
    const mk = (e: Edge, other: string): RelNode => ({
      id: other,
      title: titleOf(other),
      edgeId: e.id,
      label: typeof e.label === "string" ? e.label : "",
    });
    return {
      parents: edges.filter((e) => e.target === id).map((e) => mk(e, e.source)),
      children: edges.filter((e) => e.source === id).map((e) => mk(e, e.target)),
    };
  };
  const editEdgeLabel = (edgeId: string, label: string) =>
    setEdges((es) => es.map((e) => (e.id === edgeId ? { ...e, label } : e)));
  const gotoNode = (id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    setPanelId(id);
    void fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.2, padding: 0.8 });
  };
  // 2026-11-13: Planner에서 연결된 원본 TASK를 클릭해 돌아올 때(design-moodboard 라우트의
  // ?node= 파라미터) 해당 노드로 바로 이동 — 보드가 로드된 뒤 한 번만 실행.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!loaded || !focusNodeId || focusedOnce.current) return;
    if (!nodes.some((n) => n.id === focusNodeId)) return;
    focusedOnce.current = true;
    setTimeout(() => gotoNode(focusNodeId), 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focusNodeId, nodes]);
  const levelItems: [string, number | "all"][] = [
    ["0단계 (최상위만)", 0],
    ["1단계까지", 1],
    ["2단계까지", 2],
    ["3단계까지", 3],
    ["전체 펼치기", "all"],
  ];
  const cycleFocus = () =>
    setFocusMode((m) => (m === "off" ? "near" : m === "near" ? "branch" : "off"));
  const toggleCollapseSelected = () =>
    selected && patchNodeData(selected.id, { collapsed: !(selected.data as Extra).collapsed });
  const mapShift = panelId && !panelFolded ? 348 : 8;

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

  const tb =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-input bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-40";
  const tbOn = "!bg-foreground !text-background";
  const sep = <span className="mx-0.5 hidden h-5 w-px bg-border md:inline-block" />;
  const selCls = "h-8 border border-input bg-background px-1.5 font-mono text-xs";
  const fitAll = () => void fitView({ padding: 0.15, minZoom: 0.55, maxZoom: 1.1, duration: 300 });
  const askArrange = () => {
    if (window.confirm("노드 위치를 자동으로 다시 배치할까요? (🔒 고정한 노드는 그대로 둡니다)"))
      runArrange();
  };
  const panelOpen = panelNode !== null && !panelFolded;

  return (
    <div className="mm space-y-1.5">
      <style>{`.mm .react-flow__handle{opacity:0;transition:opacity .12s}.mm .react-flow__node:hover .react-flow__handle,.mm .react-flow__node.selected .react-flow__handle,.mm .react-flow__handle.connectingfrom,.mm .react-flow__handle.connectingto{opacity:1}`}</style>
      <div className="flex flex-wrap items-center gap-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            aria-label="마인드맵 검색"
            className="h-8 w-36 border border-input bg-background pl-7 pr-2 font-mono text-xs sm:w-48"
            placeholder="검색 (Enter=다음)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToMatch(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") setQuery("");
            }}
          />
        </div>
        {q && (
          <>
            <span className="font-mono text-[11px] text-muted-foreground">
              {matchIds.length === 0
                ? "0"
                : `${matchIdx >= 0 ? matchIdx + 1 : "-"}/${matchIds.length}`}
            </span>
            <button type="button" className={tb} title="이전 결과" onClick={() => goToMatch(-1)}>
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" className={tb} title="다음 결과" onClick={() => goToMatch(1)}>
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" className={tb} title="검색 지우기" onClick={() => setQuery("")}>
              <X className="h-4 w-4" />
            </button>
          </>
        )}
        {sep}
        <button
          type="button"
          className={tb}
          title="노트 추가"
          aria-label="노트 추가"
          onClick={() => addNote()}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tb}
          title="선택한 노드의 하위 노트 추가"
          aria-label="하위 노트 추가"
          disabled={!selected || selected.type === "image"}
          onClick={() => selected && addNote({ parent: selected })}
        >
          <CornerDownRight className="h-4 w-4" />
        </button>
        <select
          aria-label="하위 노트 방향"
          title="하위 노트 방향"
          className={`${selCls} w-12`}
          value={childDir}
          onChange={(e) => setChildDir(e.target.value as Dir)}
        >
          <option value="r">→</option>
          <option value="l">←</option>
          <option value="b">↓</option>
          <option value="t">↑</option>
        </select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${tb} max-md:hidden`}
              title="도형 추가"
              aria-label="도형 추가"
            >
              <Shapes className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SHAPES.map((sh) => (
              <DropdownMenuItem key={sh.kind} onSelect={() => addShape(sh.kind)}>
                {sh.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className={`${tb} max-md:hidden`}
          title={uploading ? "업로드 중…" : "이미지 추가"}
          aria-label="이미지 추가"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
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
        {sep}
        <select
          aria-label="자동 정렬 방식"
          title="자동 정렬 방식"
          className={`${selCls} max-md:hidden`}
          value={layoutMode}
          onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
        >
          <option value="compact">컴팩트</option>
          <option value="radial">방사형</option>
          <option value="flow">플로우</option>
        </select>
        <button
          type="button"
          className={tb}
          title="자동 정렬 (🔒 고정 노드 제외)"
          aria-label="자동 정렬"
          onClick={askArrange}
        >
          <Wand2 className="h-4 w-4" />
        </button>
        {sep}
        <button
          type="button"
          className={`${tb} max-lg:hidden`}
          title="축소"
          aria-label="축소"
          onClick={() => void zoomOut({ duration: 150 })}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${tb} max-lg:hidden !w-auto px-1.5 font-mono text-[11px]`}
          title="100%"
          onClick={() => void zoomTo(1, { duration: 250 })}
        >
          100%
        </button>
        <button
          type="button"
          className={`${tb} max-lg:hidden`}
          title="확대"
          aria-label="확대"
          onClick={() => void zoomIn({ duration: 150 })}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tb}
          title="전체 보기"
          aria-label="전체 보기"
          onClick={fitAll}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${tb} max-md:hidden`}
          title="루트로 이동"
          aria-label="루트로 이동"
          onClick={centerOnRoot}
        >
          <LocateFixed className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${tb} max-lg:hidden ${focusMode !== "off" ? tbOn : ""}`}
          title={`포커스 모드: ${focusMode === "off" ? "끔" : focusMode === "near" ? "연결된 노드" : "하위 전체"} (클릭=전환)`}
          aria-label="포커스 모드"
          onClick={cycleFocus}
        >
          <Focus className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${tb} max-lg:hidden`}
              title="단계별 접기/펼치기"
              aria-label="단계별 보기"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {levelItems.map(([label, v]) => (
              <DropdownMenuItem key={label} onSelect={() => showLevel(v)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{statusText}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={tb} title="도움말" aria-label="도움말">
              <CircleHelp className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 space-y-1 p-3 font-mono text-[11px] leading-relaxed"
          >
            <p className="font-semibold">사용법</p>
            <p>· 노드 클릭 = 선택 + 상세 패널 / 더블클릭 = 제목 편집 / 우클릭 = 메뉴</p>
            <p>· 드래그 = 이동 · 휠 = 확대/축소 · 빈 곳 드래그 = 화면 이동</p>
            <p>· 노드 사방의 점을 끌어 연결(위·아래·좌·우) · 선을 클릭하면 글자·화살표 편집</p>
            <p>· 도형/이미지는 선택 후 모서리로 크기 조절 · 이미지는 끌어놓기/붙여넣기(Ctrl/⌘+V)</p>
            <p>· 우측 ⋯ 메뉴: 접기/펼치기, 위치 고정, 선 글자, 미니맵, 삭제</p>
            <p>· Esc = 메뉴/패널 닫기 · Delete = 삭제</p>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={tb} title="더보기" aria-label="더보기">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={!selected || !graph.kids.get(selected.id)?.length}
              onSelect={toggleCollapseSelected}
            >
              선택 노드 접기/펼치기
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!selected} onSelect={toggleLock}>
              🔒 선택 노드 위치 고정/해제
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                setLabelMode((m) => (m === "smart" ? "all" : m === "all" ? "none" : "smart"))
              }
            >
              선 글자: {labelMode === "smart" ? "핵심만" : labelMode === "all" ? "전부" : "숨김"}{" "}
              (전환)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMap(mapMode === "hidden" ? "open" : "hidden")}>
              <MapIcon className="mr-2 h-4 w-4" /> 미니맵{" "}
              {mapMode === "hidden" ? "보이기" : "숨기기"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="md:hidden">
              <DropdownMenuLabel className="text-[10px]">모바일</DropdownMenuLabel>
              {SHAPES.map((sh) => (
                <DropdownMenuItem key={sh.kind} onSelect={() => addShape(sh.kind)}>
                  도형 추가 {sh.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                이미지 추가
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={centerOnRoot}>루트로 이동</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setLayoutMode((m) =>
                    m === "compact" ? "radial" : m === "radial" ? "flow" : "compact",
                  )
                }
              >
                정렬 방식:{" "}
                {layoutMode === "compact"
                  ? "컴팩트"
                  : layoutMode === "radial"
                    ? "방사형"
                    : "플로우"}{" "}
                (전환)
              </DropdownMenuItem>
            </div>
            <div className="lg:hidden">
              <DropdownMenuItem onSelect={() => void zoomOut({ duration: 150 })}>
                축소
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void zoomIn({ duration: 150 })}>
                확대
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void zoomTo(1, { duration: 250 })}>
                100%
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cycleFocus}>
                포커스:{" "}
                {focusMode === "off" ? "끔" : focusMode === "near" ? "연결된 노드" : "하위 전체"}{" "}
                (전환)
              </DropdownMenuItem>
              {levelItems.map(([label, v]) => (
                <DropdownMenuItem key={label} onSelect={() => showLevel(v)}>
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
            <DropdownMenuItem
              className="text-destructive"
              disabled={!nodes.some((n) => n.selected) && !edges.some((e) => e.selected)}
              onSelect={removeSelected}
            >
              선택 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {selectedEdge && (
        <div className="flex flex-wrap items-center gap-1 border border-dashed border-border p-1.5">
          <span className="font-mono text-[11px] uppercase">선</span>
          <input
            aria-label="선 글자"
            className="h-8 min-w-[10rem] flex-1 border border-input bg-background px-2 font-mono text-xs"
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
              className={`${tb} ${arrowMode === mode ? tbOn : ""}`}
              onClick={() => setArrows(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {uploadError && <p className="font-mono text-xs text-destructive">{uploadError}</p>}
      <div
        ref={wrapRef}
        tabIndex={-1}
        className="relative h-[72vh] min-h-[420px] overflow-hidden border border-border bg-card outline-none"
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
        {connectFrom && (
          <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 border border-foreground bg-background px-3 py-1 font-mono text-xs shadow">
            연결할 노드를 클릭하세요 · Esc 취소
          </div>
        )}
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
          onNodeClick={(_, node) => {
            setMenu(null);
            if (connectFrom) {
              connectNodes(connectFrom, node.id);
              setConnectFrom(null);
              return;
            }
            openPanel(node.id);
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            const r = wrapRef.current?.getBoundingClientRect();
            setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === node.id })));
            setMenu({ id: node.id, x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
          }}
          onPaneClick={() => setMenu(null)}
          onMoveStart={() => setMenu(null)}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Delete", "Backspace"]}
          zoomOnDoubleClick={false}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          {mapMode !== "hidden" && (
            <>
              <Panel
                position="bottom-right"
                style={{
                  margin: 8,
                  marginRight: mapShift,
                  marginBottom: mapMode === "open" ? 100 : 8,
                }}
              >
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1 border border-input bg-background/90 px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMap(mapMode === "open" ? "folded" : "open")}
                  title={mapMode === "open" ? "미니맵 접기" : "미니맵 펼치기"}
                >
                  <MapIcon className="h-3 w-3" /> 지도 {mapMode === "open" ? "▾" : "▴"}
                </button>
              </Panel>
              {mapMode === "open" && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-right"
                  style={{
                    width: 132,
                    height: 88,
                    margin: 8,
                    marginRight: mapShift,
                    background: "rgba(255,255,255,0.8)",
                    border: "1px solid rgba(100,116,139,0.35)",
                  }}
                />
              )}
            </>
          )}
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>

        {menu && (
          <div
            className="absolute z-40 w-44 border border-border bg-popover py-1 font-mono text-xs shadow-lg"
            style={{
              left: Math.min(menu.x, (wrapRef.current?.clientWidth ?? 400) - 180),
              top: Math.min(menu.y, (wrapRef.current?.clientHeight ?? 300) - 230),
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {(
              [
                ["하위 노트 추가", "child"],
                ["연결하기", "connect"],
                ["상세 편집", "details"],
                ["작업 만들기", "task"],
                ["복제", "dup"],
                [
                  nodes.find((n) => n.id === menu.id) &&
                  (nodes.find((n) => n.id === menu.id)!.data as Extra).locked
                    ? "위치 고정 해제"
                    : "위치 고정",
                  "lock",
                ],
                ["삭제", "del"],
              ] as const
            ).map(([label, act]) => {
              const node = nodes.find((n) => n.id === menu.id);
              const disabled = act === "child" && node?.type === "image";
              return (
                <button
                  key={act}
                  type="button"
                  disabled={disabled}
                  className={`block w-full px-3 py-1.5 text-left hover:bg-secondary disabled:opacity-40 ${act === "del" ? "text-destructive" : ""}`}
                  onClick={() => {
                    const id = menu.id;
                    setMenu(null);
                    if (act === "child" && node) addNote({ parent: node });
                    else if (act === "connect") setConnectFrom(id);
                    else if (act === "details") openPanel(id);
                    else if (act === "task") {
                      openPanel(id);
                      setTaskRequest((n) => n + 1);
                    } else if (act === "dup") duplicateNode(id);
                    else if (act === "lock")
                      patchNodeData(id, { locked: !(node?.data as Extra | undefined)?.locked });
                    else if (act === "del") {
                      if (window.confirm("이 노드를 삭제할까요?")) deleteNode(id);
                    }
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {panelNode && panelFolded && (
          <button
            type="button"
            onClick={() => setPanelFolded(false)}
            className="absolute right-0 top-16 z-20 border border-r-0 border-border bg-card px-1 py-3 font-mono text-[11px] shadow [writing-mode:vertical-rl]"
            title="상세 패널 펼치기"
          >
            ‹ 상세
          </button>
        )}
        {panelNode && panelOpen && (
          <MindmapDetailPanel
            boardId={boardId}
            node={{
              id: panelNode.id,
              type: panelNode.type ?? "note",
              title:
                titleOf(panelNode.id) === "🖼 이미지"
                  ? ""
                  : ((panelNode.data as { text?: string }).text ?? ""),
              color: (panelNode.data as { color?: string }).color ?? "",
              data: panelNode.data as Record<string, unknown>,
            }}
            {...rels(panelNode.id)}
            others={[]}
            colors={COLORS}
            taskRequest={taskRequest}
            onTitle={(t) => patchNodeData(panelNode.id, { text: t })}
            onColor={(c) => patchNodeData(panelNode.id, { color: c })}
            onMeta={(m) => patchMeta(panelNode.id, m)}
            onEdgeLabel={editEdgeLabel}
            onGoto={gotoNode}
            onDelete={() => {
              if (window.confirm("이 노드를 삭제할까요?")) deleteNode(panelNode.id);
            }}
            onClose={() => setPanelId(null)}
            onCollapse={() => setPanelFolded(true)}
          />
        )}
      </div>
    </div>
  );
}

export function DesignMindmap({ boardId, focusNodeId }: { boardId: string; focusNodeId?: string | undefined }) {
  return (
    <ReactFlowProvider>
      <MindmapCanvas boardId={boardId} focusNodeId={focusNodeId} />
    </ReactFlowProvider>
  );
}
