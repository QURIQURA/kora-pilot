import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Inbox,
  Maximize,
  Plus,
  Rocket,
  Search,
  Target,
  Trophy,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMeta, PRIORITY_LABEL, type NodeMeta } from "@/lib/mindmap-node-meta";
import { progressText, useTaskDone } from "@/lib/use-task-progress";
import {
  CARD_H,
  CARD_W,
  computeGeometry,
  GAP,
  insertOrd,
  LABEL_W,
  mergeConfig,
  orderCards,
  QW,
  ZONE_IDS,
  ZONE_STYLE,
  zoneAt,
  type Geometry,
  type MatrixConfig,
  type MatrixSaved,
  type ZoneId,
} from "@/lib/value-matrix";
import { MindmapDetailPanel } from "./MindmapDetailPanel";
import { MatrixImportDialog } from "./MatrixImportDialog";

type MNode = Node<Record<string, unknown>>;
type AxisKey = keyof MatrixConfig["axes"];
type CardData = {
  title: string;
  quad: ZoneId;
  ord: number;
  meta?: NodeMeta;
  src?: string;
  _match?: boolean;
  _dim?: boolean;
  _prog?: string;
};
const cd = (n: MNode) => n.data as unknown as CardData;
const isCard = (n: MNode) => n.type === "card";
const ZONE_ICON: Record<ZoneId, LucideIcon> = {
  maxroi: Trophy,
  big: Rocket,
  easy: Zap,
  neg: Target,
  unassigned: Inbox,
};

const MatrixCtx = createContext<{ add: (z: ZoneId) => void }>({ add: () => undefined });

const inputBare =
  "nodrag nowheel w-full bg-transparent outline-none focus:bg-white/70 focus:ring-1 focus:ring-black/20";

function ZoneNodeView({ id, data, width, height }: NodeProps<MNode>) {
  const { updateNodeData } = useReactFlow();
  const { add } = useContext(MatrixCtx);
  const zone = data["zone"] as ZoneId;
  const st = ZONE_STYLE[zone];
  const Icon = ZONE_ICON[zone];
  return (
    <div
      style={{
        width,
        height,
        background: st.bg,
        border: `1.5px ${zone === "unassigned" ? "dashed" : "solid"} ${st.line}66`,
        borderRadius: 18,
      }}
    >
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" style={{ color: st.line }} />
        <div className="min-w-0 flex-1">
          <input
            aria-label="사분면 이름"
            className={`${inputBare} text-[18px] font-extrabold uppercase leading-tight tracking-tight`}
            style={{ color: st.ink }}
            value={String(data["title"] ?? "")}
            onChange={(e) => updateNodeData(id, { title: e.target.value })}
          />
          <input
            aria-label="사분면 설명"
            className={`${inputBare} mt-0.5 rounded-full px-2 py-0.5 text-[12px] font-medium`}
            style={{ color: st.ink, background: st.pill, width: "auto", maxWidth: "100%" }}
            size={Math.max(8, String(data["sub"] ?? "").length)}
            value={String(data["sub"] ?? "")}
            onChange={(e) => updateNodeData(id, { sub: e.target.value })}
          />
        </div>
        <button
          type="button"
          title="이 구역에 카드 추가"
          className="nodrag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-white/80 hover:bg-white"
          style={{ borderColor: `${st.line}88`, color: st.ink }}
          onClick={() => add(zone)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {Boolean(data["empty"]) && (
        <div
          className="pointer-events-none mx-5 mt-3 rounded-xl border border-dashed py-5 text-center text-[13px]"
          style={{ borderColor: `${st.line}55`, color: st.ink, opacity: 0.7 }}
        >
          카드를 여기로 끌어놓거나 + 로 추가
        </div>
      )}
    </div>
  );
}

function AxisLabelView({ id, data }: NodeProps<MNode>) {
  const { updateNodeData } = useReactFlow();
  const cls =
    "nodrag nowheel h-full w-full rounded-2xl border border-slate-300 bg-white px-2 text-center text-[14px] font-semibold leading-tight text-slate-800 shadow-sm outline-none focus:border-slate-700";
  return data["multi"] ? (
    <textarea
      aria-label="축 이름"
      rows={3}
      className={`${cls} resize-none overflow-hidden py-2`}
      value={String(data["text"] ?? "")}
      onChange={(e) => updateNodeData(id, { text: e.target.value })}
    />
  ) : (
    <input
      aria-label="축 이름"
      className={cls}
      value={String(data["text"] ?? "")}
      onChange={(e) => updateNodeData(id, { text: e.target.value })}
    />
  );
}

function AxisLineView({ data, width, height }: NodeProps<MNode>) {
  const w = width ?? 14;
  const h = height ?? 14;
  const c = "#1f2937";
  return (
    <svg width={w} height={h} className="pointer-events-none overflow-visible">
      {data["vertical"] ? (
        <>
          <line x1={w / 2} y1={10} x2={w / 2} y2={h - 10} stroke={c} strokeWidth={2.5} />
          <polygon points={`${w / 2},0 ${w / 2 - 7},12 ${w / 2 + 7},12`} fill={c} />
          <polygon
            points={`${w / 2},${h} ${w / 2 - 7},${h - 12} ${w / 2 + 7},${h - 12}`}
            fill={c}
          />
        </>
      ) : (
        <>
          <line x1={10} y1={h / 2} x2={w - 10} y2={h / 2} stroke={c} strokeWidth={2.5} />
          <polygon points={`0,${h / 2} 12,${h / 2 - 7} 12,${h / 2 + 7}`} fill={c} />
          <polygon
            points={`${w},${h / 2} ${w - 12},${h / 2 - 7} ${w - 12},${h / 2 + 7}`}
            fill={c}
          />
        </>
      )}
    </svg>
  );
}

const PRIORITY_DOT: Record<string, string> = { high: "#dc2626", mid: "#f59e0b", low: "#94a3b8" };

function CardNodeView({ data, selected }: NodeProps<MNode>) {
  const d = data as unknown as CardData;
  const st = ZONE_STYLE[d.quad];
  const pr = getMeta(d).priority;
  return (
    <div
      title={d.title}
      className="relative flex items-center gap-2 bg-white pl-3 pr-3 shadow-sm"
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 10,
        borderStyle: "solid",
        borderWidth: "1.5px 1.5px 1.5px 6px",
        borderColor: `${selected ? "#0f172a" : "rgba(100,116,139,0.35)"} ${selected ? "#0f172a" : "rgba(100,116,139,0.35)"} ${selected ? "#0f172a" : "rgba(100,116,139,0.35)"} ${st.line}`,
        opacity: d._dim ? 0.25 : 1,
        outline: d._match ? "3px solid #f59e0b" : undefined,
        outlineOffset: 2,
      }}
    >
      {pr && (
        <span
          title={`우선순위: ${PRIORITY_LABEL[pr as "high" | "mid" | "low"]}`}
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: PRIORITY_DOT[pr] }}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">
        {d.title || "(제목 없음)"}
      </span>
      {d._prog && (
        <span className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-2 font-mono text-[11px] leading-5">
          작업 {d._prog}
        </span>
      )}
    </div>
  );
}

const nodeTypes = {
  zone: ZoneNodeView,
  axis: AxisLabelView,
  line: AxisLineView,
  card: CardNodeView,
};

const AXIS_KEYS: AxisKey[] = ["yHigh", "yLow", "xLow", "xHigh"];

function staticNodes(cfg: MatrixConfig): MNode[] {
  const base = {
    draggable: false,
    selectable: false,
    deletable: false,
    connectable: false,
    focusable: false,
    position: { x: 0, y: 0 },
  };
  const out: MNode[] = ZONE_IDS.map((z) => ({
    ...base,
    id: `zone-${z}`,
    type: "zone",
    zIndex: 0,
    data: { zone: z, title: cfg.zones[z].title, sub: cfg.zones[z].sub, empty: false },
  }));
  out.push(
    { ...base, id: "line-v", type: "line", zIndex: 1, data: { vertical: true } },
    { ...base, id: "line-h", type: "line", zIndex: 1, data: { vertical: false } },
  );
  for (const k of AXIS_KEYS)
    out.push({
      ...base,
      id: `axis-${k}`,
      type: "axis",
      zIndex: 2,
      data: { axis: k, text: cfg.axes[k], multi: k === "xLow" || k === "xHigh" },
    });
  return out;
}

const cx = QW + GAP / 2; // 세로축 x
const WORLD_W = 2 * QW + GAP;

/** 카드 수에 맞춰 사분면·축·카드 위치를 다시 계산해 노드에 반영한다(자유 좌표 없음). */
function applyGeometry(nodes: MNode[], geo: Geometry, unOpen: boolean): MNode[] {
  const { top, total } = geo;
  const axisBox: Record<AxisKey, { x: number; y: number; w: number; h: number }> = {
    yHigh: { x: cx - 130, y: -66, w: 260, h: 44 },
    yLow: { x: cx - 130, y: total + 22, w: 260, h: 44 },
    xLow: { x: -(LABEL_W + 10), y: top + GAP / 2 - 34, w: LABEL_W, h: 68 },
    xHigh: { x: WORLD_W + 10, y: top + GAP / 2 - 34, w: LABEL_W, h: 68 },
  };
  return nodes.map((n) => {
    if (n.type === "zone") {
      const z = n.data["zone"] as ZoneId;
      const r = geo.zones[z];
      return {
        ...n,
        position: { x: r.x, y: r.y },
        width: r.w,
        height: r.h,
        hidden: z === "unassigned" && !unOpen,
        data: { ...n.data, empty: geo.sorted[z].length === 0 },
      };
    }
    if (n.id === "line-v")
      return { ...n, position: { x: cx - 7, y: -16 }, width: 14, height: total + 32 };
    if (n.id === "line-h")
      return { ...n, position: { x: -12, y: top + GAP / 2 - 7 }, width: WORLD_W + 24, height: 14 };
    if (n.type === "axis") {
      const b = axisBox[n.data["axis"] as AxisKey];
      return { ...n, position: { x: b.x, y: b.y }, width: b.w, height: b.h };
    }
    if (isCard(n)) {
      const p = geo.pos.get(n.id);
      return {
        ...n,
        position: p ?? n.position,
        width: CARD_W,
        height: CARD_H,
        hidden: cd(n).quad === "unassigned" && !unOpen,
      };
    }
    return n;
  });
}

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function MatrixCanvas({ boardId, focusCardId }: { boardId: string; focusCardId?: string | undefined }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<MNode>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelFolded, setPanelFolded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [unOpen, setUnOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const geoRef = useRef<Geometry | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fitPending = useRef(true);
  const v1Raw = useRef<number | undefined>(undefined);

  const fitAll = (duration = 0, open = unOpen) => {
    const ids = [
      ...ZONE_IDS.filter((z) => z !== "unassigned" || open).map((z) => `zone-${z}`),
      "axis-yHigh",
      "axis-yLow",
      "axis-xLow",
      "axis-xHigh",
      ...(open ? [] : []),
    ];
    void fitView({ padding: 0.04, maxZoom: 1.25, duration, nodes: ids.map((id) => ({ id })) });
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("design_moodboards")
        .select("matrix")
        .eq("id", boardId)
        .single();
      if (!alive) return;
      if (error) {
        setStatus("error");
        return;
      }
      const saved = (data.matrix ?? {}) as MatrixSaved;
      v1Raw.current = saved.meta?.v;
      const cfg = mergeConfig(saved.config, saved.meta?.v);
      const cards = orderCards(
        (saved.cards ?? []).filter((c) => ZONE_IDS.includes(c.quad)),
        saved.meta?.v,
      );
      setUnOpen(Boolean(saved.config?.unOpen));
      setNodes([
        ...staticNodes(cfg),
        ...cards.map((c): MNode => ({
          id: c.id,
          type: "card",
          position: { x: 0, y: 0 },
          zIndex: 10,
          data: {
            title: c.title,
            quad: c.quad,
            ord: c.ord,
            ...(c.meta ? { meta: c.meta } : {}),
            ...(c.src ? { src: c.src } : {}),
          },
        })),
      ]);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [boardId, setNodes]);

  // 카드 구성(어느 구역·몇 번째)이 바뀌면 사분면 높이와 카드 위치를 다시 계산한다.
  const cardKey = nodes
    .filter(isCard)
    .map((n) => `${n.id}:${cd(n).quad}:${cd(n).ord}`)
    .join("|");
  useEffect(() => {
    if (!loaded) return;
    const list = nodes.filter(isCard).map((n) => ({ id: n.id, quad: cd(n).quad, ord: cd(n).ord }));
    const geo = computeGeometry(list);
    geoRef.current = geo;
    setNodes((ns) => applyGeometry(ns, geo, unOpen));
    if (fitPending.current) {
      fitPending.current = false;
      setTimeout(() => fitAll(0), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, cardKey, tick, unOpen, setNodes]);

  // 창 크기가 바뀌면 매트릭스가 화면 너비에 맞게 다시 배치되도록 전체 보기를 다시 맞춘다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => fitAll(0), 200);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unOpen]);

  // 변경이 멈추고 0.8초 뒤 자동 저장(위치는 구역 안 순서로 저장).
  useEffect(() => {
    if (!loaded) return;
    setStatus("saving");
    const t = setTimeout(() => {
      const cfg = mergeConfig();
      for (const n of nodes) {
        if (n.type === "zone") {
          const z = n.data["zone"] as ZoneId;
          cfg.zones[z] = { title: String(n.data["title"] ?? ""), sub: String(n.data["sub"] ?? "") };
        } else if (n.type === "axis") {
          cfg.axes[n.data["axis"] as AxisKey] = String(n.data["text"] ?? "");
        }
      }
      const ordered = nodes
        .filter(isCard)
        .sort(
          (a, b) =>
            ZONE_IDS.indexOf(cd(a).quad) - ZONE_IDS.indexOf(cd(b).quad) ||
            cd(a).ord - cd(b).ord ||
            a.id.localeCompare(b.id),
        );
      const payload: MatrixSaved = {
        meta: { v: 2 },
        config: { ...cfg, unOpen },
        cards: ordered.map((n) => ({
          id: n.id,
          quad: cd(n).quad,
          title: cd(n).title,
          ...(cd(n).meta ? { meta: cd(n).meta as NodeMeta } : {}),
          ...(cd(n).src ? { src: cd(n).src as string } : {}),
        })),
      };
      void supabase
        .from("design_moodboards")
        .update({ matrix: payload as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", boardId)
        .then(({ error }) => setStatus(error ? "error" : "saved"));
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, loaded, boardId, unOpen]);

  const cards = useMemo(() => nodes.filter(isCard), [nodes]);

  // ── 연결된 플래너 작업 진행 ──
  const allTaskIds = useMemo(() => cards.flatMap((n) => getMeta(cd(n)).taskIds ?? []), [cards]);
  const taskDone = useTaskDone(allTaskIds, loaded);

  // ── 검색 ──
  const q = query.trim().toLowerCase();
  const matchIds = useMemo(
    () =>
      q
        ? cards
            .filter((n) =>
              `${cd(n).title}\n${getMeta(cd(n)).description ?? ""}`.toLowerCase().includes(q),
            )
            .map((n) => n.id)
        : [],
    [cards, q],
  );
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  useEffect(() => setMatchIdx(-1), [q]);
  const goToMatch = (dir: 1 | -1) => {
    if (matchIds.length === 0) return;
    const i = (((matchIdx + dir) % matchIds.length) + matchIds.length) % matchIds.length;
    setMatchIdx(i);
    const id = matchIds[i]!;
    const card = cards.find((n) => n.id === id);
    if (card && cd(card).quad === "unassigned" && !unOpen) setUnOpen(true);
    setTimeout(
      () => void fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.3, padding: 1.4 }),
      150,
    );
  };

  const viewNodes = useMemo(
    () =>
      nodes.map((n) =>
        isCard(n)
          ? ({
              ...n,
              data: {
                ...n.data,
                _match: matchSet.has(n.id),
                _dim: q !== "" && !matchSet.has(n.id),
                _prog: progressText(getMeta(n.data).taskIds, taskDone),
              },
            } as MNode)
          : n,
      ),
    [nodes, matchSet, q, taskDone],
  );

  // ── 카드 조작 ──
  const lastOrd = (zone: ZoneId, list: MNode[]) =>
    list
      .filter((n) => isCard(n) && cd(n).quad === zone)
      .reduce((m, n) => Math.max(m, cd(n).ord), -1);

  const addCard = (zone: ZoneId, init?: Partial<CardData>) => {
    const id = newId();
    if (zone === "unassigned") setUnOpen(true);
    const node: MNode = {
      id,
      type: "card",
      position: { x: 0, y: 0 },
      zIndex: 10,
      selected: true,
      data: {
        title: init?.title ?? "새 아이디어",
        quad: zone,
        ord: lastOrd(zone, nodes) + 1,
        ...(init?.meta ? { meta: init.meta } : {}),
        ...(init?.src ? { src: init.src } : {}),
      },
    };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    setPanelId(id);
    setPanelFolded(false);
    return id;
  };

  const moveCardTo = (id: string, zone: ZoneId) => {
    if (zone === "unassigned") setUnOpen(true);
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, quad: zone, ord: lastOrd(zone, ns) + 1 } } as MNode)
          : n,
      ),
    );
  };

  const onNodeDragStop = (_: unknown, __: MNode, dragged: MNode[]) => {
    // 놓은 자리의 사분면으로 분류를 바꾸고, 놓은 높이에 맞는 순서로 끼워 넣는다.
    const geo = geoRef.current;
    if (!geo) return;
    const ids = new Set(dragged.filter(isCard).map((n) => n.id));
    setNodes((ns) => {
      let cur = ns;
      for (const id of ids) {
        const n = cur.find((x) => x.id === id);
        if (!n) continue;
        const zone = zoneAt(geo, n.position.x + CARD_W / 2, n.position.y + CARD_H / 2, unOpen);
        const others = cur
          .filter((x) => isCard(x) && x.id !== id && cd(x).quad === zone)
          .map((x) => ({ id: x.id, ord: cd(x).ord }));
        const ord = insertOrd(geo, others, n.position.y + CARD_H / 2);
        cur = cur.map((x) =>
          x.id === id ? ({ ...x, data: { ...x.data, quad: zone, ord } } as MNode) : x,
        );
      }
      return cur;
    });
    setTick((t) => t + 1); // 같은 자리에 놓아도 격자 위치로 되돌아오게
  };

  const patchCard = (id: string, patch: Partial<CardData>) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as MNode) : n)),
    );
  const patchMeta = (id: string, patch: Partial<NodeMeta>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, meta: { ...getMeta(n.data), ...patch } } } as MNode)
          : n,
      ),
    );
  const deleteCard = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setPanelId(null);
  };
  const duplicateCard = (id: string) => {
    const src = cards.find((n) => n.id === id);
    if (!src) return;
    const meta = { ...getMeta(cd(src)) };
    delete meta.taskIds; // 같은 플래너 작업이 두 카드에 중복 연결되지 않게
    addCard(cd(src).quad, { title: `${cd(src).title} (복사)`, meta });
  };

  const panelNode = panelId ? (cards.find((n) => n.id === panelId) ?? null) : null;
  useEffect(() => {
    if (panelId && loaded && !panelNode) setPanelId(null);
  }, [panelId, panelNode, loaded]);
  // 2026-11-13: Planner에서 연결된 원본 TASK를 클릭해 돌아올 때(design-moodboard 라우트의
  // ?node= 파라미터) 해당 카드로 바로 이동 — 보드가 로드된 뒤 한 번만 실행.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!loaded || !focusCardId || focusedOnce.current) return;
    const card = cards.find((n) => n.id === focusCardId);
    if (!card) return;
    focusedOnce.current = true;
    if (cd(card).quad === "unassigned" && !unOpen) setUnOpen(true);
    setPanelId(focusCardId);
    setTimeout(
      () => void fitView({ nodes: [{ id: focusCardId }], duration: 350, maxZoom: 1.3, padding: 1.4 }),
      200,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focusCardId, cards]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if ((e.target as HTMLElement | null)?.closest("textarea,input,select")) return;
      setPanelId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const importCards = (items: { title: string; meta: NodeMeta; src: string }[], zone: ZoneId) => {
    if (zone === "unassigned") setUnOpen(true);
    let ord = lastOrd(zone, nodes);
    const added: MNode[] = items.map((it) => ({
      id: newId(),
      type: "card",
      position: { x: 0, y: 0 },
      zIndex: 10,
      data: { title: it.title, quad: zone, ord: ++ord, meta: it.meta, src: it.src },
    }));
    setNodes((ns) => [...ns, ...added]);
    setNotice(`${added.length}개를 가져왔어요.`);
  };

  const tb =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-input bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-40";
  const txtBtn =
    "inline-flex h-8 items-center gap-1 border border-input bg-background px-2 font-mono text-xs hover:bg-secondary";
  const statusText = {
    idle: "",
    saving: "저장 중…",
    saved: "저장됨",
    error: "저장 실패 — 새로고침 후 다시 시도",
  }[status];
  const importedSrc = useMemo(
    () => new Set(cards.map((n) => cd(n).src).filter(Boolean) as string[]),
    [cards],
  );
  const titlesLower = useMemo(
    () => new Set(cards.map((n) => cd(n).title.trim().toLowerCase())),
    [cards],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of cards) c[cd(n).quad] = (c[cd(n).quad] ?? 0) + 1;
    return c;
  }, [cards]);
  const zoneTitle = (z: ZoneId) =>
    String(nodes.find((n) => n.id === `zone-${z}`)?.data["title"] ?? z);

  return (
    <div className="mm space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            aria-label="카드 검색"
            className="h-8 w-36 border border-input bg-background pl-7 pr-2 font-mono text-xs sm:w-44"
            placeholder="카드 검색 (Enter)"
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
        <span className="mx-0.5 hidden h-5 w-px bg-border md:inline-block" />
        <button
          type="button"
          className={txtBtn}
          title="Unassigned에 새 아이디어 카드 추가"
          onClick={() => addCard("unassigned")}
        >
          <Plus className="h-4 w-4" /> Add Idea
        </button>
        <button
          type="button"
          className={txtBtn}
          title="마인드맵 보드의 아이디어를 복사해 오기(원본은 그대로)"
          onClick={() => setImportOpen(true)}
        >
          <Download className="h-4 w-4" />{" "}
          <span className="max-sm:hidden">Import from Mindmap</span>
        </button>
        <button
          type="button"
          className={`${txtBtn} ${unOpen ? "!bg-foreground !text-background" : ""}`}
          title="분류하지 않은 아이디어 영역 펼치기/접기"
          onClick={() => {
            const next = !unOpen;
            setUnOpen(next);
            setTimeout(() => fitAll(250, next), 80);
          }}
        >
          <Inbox className="h-4 w-4" /> Unassigned ({counts["unassigned"] ?? 0})
        </button>
        <span className="mx-0.5 hidden h-5 w-px bg-border md:inline-block" />
        <button
          type="button"
          className={tb}
          title="축소"
          aria-label="축소"
          onClick={() => void zoomOut({ duration: 150 })}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`${tb} !w-auto px-1.5 font-mono text-[11px]`}
          title="100%"
          onClick={() => void zoomTo(1, { duration: 250 })}
        >
          100%
        </button>
        <button
          type="button"
          className={tb}
          title="확대"
          aria-label="확대"
          onClick={() => void zoomIn({ duration: 150 })}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tb}
          title="화면에 맞추기"
          aria-label="전체 보기"
          onClick={() => fitAll(300)}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground xl:inline">
          {(["maxroi", "big", "easy", "neg"] as const)
            .map((z) => `${zoneTitle(z)} ${counts[z] ?? 0}`)
            .join(" · ")}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{notice ?? statusText}</span>
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
            <p>
              · 카드를 다른 사분면(또는 같은 구역의 다른 높이)으로 끌어놓으면 분류와 순서가 바뀌고
              자동 저장돼요.
            </p>
            <p>· 사분면은 카드 수에 맞게 높이가 자라고, 네 사분면은 항상 정렬을 유지해요.</p>
            <p>· 카드 클릭 = 오른쪽 상세 패널(설명·체크리스트·링크·플래너 작업).</p>
            <p>· 축 이름·사분면 이름은 글자를 눌러 바로 고칠 수 있어요.</p>
            <p>
              · 분류 전 아이디어는 Unassigned(기본 접힘)에 둬요. 카드 옆 `작업 1/2`는 플래너 작업
              진행이에요.
            </p>
            <p>· 휠 = 확대/축소, 빈 곳 드래그 = 화면 이동, Delete = 선택한 카드 삭제.</p>
          </PopoverContent>
        </Popover>
      </div>

      <div
        ref={wrapRef}
        className="relative h-[74vh] min-h-[440px] overflow-hidden border border-border bg-card outline-none"
      >
        <MatrixCtx.Provider value={{ add: (z) => addCard(z) }}>
          <ReactFlow
            nodes={viewNodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              if (node.type === "card") {
                setPanelId(node.id);
                setPanelFolded(false);
              }
            }}
            onNodeDragStop={onNodeDragStop as never}
            deleteKeyCode={["Delete", "Backspace"]}
            zoomOnDoubleClick={false}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          />
        </MatrixCtx.Provider>

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
        {panelNode && !panelFolded && (
          <MindmapDetailPanel
            boardId={boardId}
            headerTitle="아이디어 상세"
            showRelations={false}
            plannerPrefix="Value Matrix"
            node={{
              id: panelNode.id,
              type: "note",
              title: cd(panelNode).title,
              data: panelNode.data as Record<string, unknown>,
            }}
            extra={
              <label className="block font-mono text-[10px] uppercase text-muted-foreground">
                분류
                <select
                  className="w-full border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={cd(panelNode).quad}
                  onChange={(e) => moveCardTo(panelNode.id, e.target.value as ZoneId)}
                >
                  {ZONE_IDS.map((z) => (
                    <option key={z} value={z}>
                      {zoneTitle(z)}
                    </option>
                  ))}
                </select>
              </label>
            }
            taskRequest={0}
            onTitle={(t) => patchCard(panelNode.id, { title: t })}
            onMeta={(m) => patchMeta(panelNode.id, m)}
            onEdgeLabel={() => undefined}
            onGoto={() => undefined}
            onDuplicate={() => duplicateCard(panelNode.id)}
            onDelete={() => {
              if (window.confirm("이 카드를 삭제할까요?")) deleteCard(panelNode.id);
            }}
            onClose={() => setPanelId(null)}
            onCollapse={() => setPanelFolded(true)}
          />
        )}
      </div>

      <MatrixImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importedSrc={importedSrc}
        titlesLower={titlesLower}
        zoneTitle={zoneTitle}
        onImport={(items, zone) => {
          importCards(items, zone);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

export function DesignValueMatrix({
  boardId,
  focusCardId,
}: {
  boardId: string;
  focusCardId?: string | undefined;
}) {
  return (
    <ReactFlowProvider>
      <MatrixCanvas boardId={boardId} focusCardId={focusCardId} />
    </ReactFlowProvider>
  );
}
