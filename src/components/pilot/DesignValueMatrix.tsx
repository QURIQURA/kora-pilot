import "@xyflow/react/dist/style.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
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
  LayoutGrid,
  Maximize,
  Plus,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMeta, PRIORITY_LABEL, type NodeMeta } from "@/lib/mindmap-node-meta";
import { progressText, useTaskDone } from "@/lib/use-task-progress";
import {
  arrangeCards,
  cardRect,
  CARD_H,
  CARD_W,
  findFree,
  GAP,
  HEADER_H,
  mergeConfig,
  PAD,
  QH,
  QW,
  ZONE_IDS,
  ZONE_STYLE,
  ZONES,
  zoneAt,
  type MatrixCard,
  type MatrixConfig,
  type MatrixSaved,
  type ZoneId,
} from "@/lib/value-matrix";
import { MindmapDetailPanel } from "./MindmapDetailPanel";

type MNode = Node<Record<string, unknown>>;
type AxisKey = keyof MatrixConfig["axes"];
type CardData = {
  title: string;
  quad: ZoneId;
  meta?: NodeMeta;
  src?: string;
  _match?: boolean;
  _dim?: boolean;
  _prog?: string;
};
const cd = (n: MNode) => n.data as unknown as CardData;
const isCard = (n: MNode) => n.type === "card";

const MatrixCtx = createContext<{ add: (z: ZoneId) => void }>({ add: () => undefined });

const inputBare =
  "nodrag nowheel w-full bg-transparent outline-none focus:bg-white/70 focus:ring-1 focus:ring-black/20";

function ZoneNodeView({ data, width, height }: NodeProps<MNode>) {
  const { updateNodeData } = useReactFlow();
  const { add } = useContext(MatrixCtx);
  const zone = data["zone"] as ZoneId;
  const st = ZONE_STYLE[zone];
  return (
    <div
      style={{
        width,
        height,
        background: st.bg,
        border: `1.5px solid ${st.line}66`,
        borderRadius: 18,
      }}
    >
      <div className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <input
            aria-label="사분면 이름"
            className={`${inputBare} text-[22px] font-bold uppercase leading-tight tracking-tight`}
            style={{ color: st.ink }}
            value={String(data["title"] ?? "")}
            onChange={(e) => updateNodeData(String(data["id"] ?? ""), { title: e.target.value })}
          />
          <input
            aria-label="사분면 설명"
            className={`${inputBare} font-mono text-[12px]`}
            style={{ color: st.ink, opacity: 0.75 }}
            value={String(data["sub"] ?? "")}
            onChange={(e) => updateNodeData(String(data["id"] ?? ""), { sub: e.target.value })}
          />
        </div>
        <button
          type="button"
          title="이 구역에 카드 추가"
          className="nodrag inline-flex h-7 w-7 shrink-0 items-center justify-center border bg-white/80 hover:bg-white"
          style={{ borderColor: `${st.line}88`, color: st.ink }}
          onClick={() => add(zone)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AxisLabelView({ data }: NodeProps<MNode>) {
  const { updateNodeData } = useReactFlow();
  return (
    <input
      aria-label="축 이름"
      className="nodrag nowheel h-full w-full rounded-full border border-slate-300 bg-white px-3 text-center font-mono text-[13px] font-semibold text-slate-800 outline-none focus:border-slate-700"
      value={String(data["text"] ?? "")}
      onChange={(e) => updateNodeData(String(data["id"] ?? ""), { text: e.target.value })}
    />
  );
}

function AxisLineView({ data, width, height }: NodeProps<MNode>) {
  const w = width ?? 14;
  const h = height ?? 14;
  const v = Boolean(data["vertical"]);
  const c = "#1f2937";
  return (
    <svg width={w} height={h} className="pointer-events-none overflow-visible">
      {v ? (
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
      className="relative flex items-center gap-2 bg-white pl-3 pr-2 shadow-sm"
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 8,
        border: `1.5px solid ${selected ? "#0f172a" : "rgba(100,116,139,0.45)"}`,
        borderLeft: `6px solid ${st.line}`,
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
      <span className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] font-semibold leading-snug text-slate-900">
        {d.title || "(제목 없음)"}
      </span>
      {d._prog && (
        <span className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-1.5 font-mono text-[10px] leading-4">
          ✓ {d._prog}
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

const cx = QW + GAP / 2; // 세로축 x
const cy = QH + GAP / 2; // 가로축 y
const LABELS: Record<AxisKey, { x: number; y: number; w: number; h: number }> = {
  yHigh: { x: cx - 170, y: -74, w: 340, h: 40 },
  yLow: { x: cx - 170, y: 2 * QH + GAP + 34, w: 340, h: 40 },
  xLow: { x: 10, y: cy - 16, w: 250, h: 32 },
  xHigh: { x: 2 * QW + GAP - 260, y: cy - 16, w: 250, h: 32 },
};

function staticNodes(cfg: MatrixConfig): MNode[] {
  const base = {
    draggable: false,
    selectable: false,
    deletable: false,
    connectable: false,
    focusable: false,
  };
  const out: MNode[] = [];
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    out.push({
      ...base,
      id: `zone-${id}`,
      type: "zone",
      position: { x: z.x, y: z.y },
      width: z.w,
      height: z.h,
      zIndex: 0,
      data: { id: `zone-${id}`, zone: id, title: cfg.zones[id].title, sub: cfg.zones[id].sub },
    });
  }
  out.push(
    {
      ...base,
      id: "line-v",
      type: "line",
      position: { x: cx - 7, y: -26 },
      width: 14,
      height: 2 * QH + GAP + 52,
      zIndex: 1,
      data: { vertical: true },
    },
    {
      ...base,
      id: "line-h",
      type: "line",
      position: { x: -26, y: cy - 7 },
      width: 2 * QW + GAP + 52,
      height: 14,
      zIndex: 1,
      data: { vertical: false },
    },
  );
  for (const k of Object.keys(LABELS) as AxisKey[]) {
    const l = LABELS[k];
    out.push({
      ...base,
      id: `axis-${k}`,
      type: "axis",
      position: { x: l.x, y: l.y },
      width: l.w,
      height: l.h,
      zIndex: 2,
      data: { id: `axis-${k}`, axis: k, text: cfg.axes[k] },
    });
  }
  return out;
}

const toCardNode = (c: MatrixCard): MNode => ({
  id: c.id,
  type: "card",
  position: { x: c.x, y: c.y },
  width: CARD_W,
  height: CARD_H,
  zIndex: 10,
  data: {
    title: c.title,
    quad: c.quad,
    ...(c.meta ? { meta: c.meta } : {}),
    ...(c.src ? { src: c.src } : {}),
  },
});

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function MatrixCanvas({ boardId }: { boardId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<MNode>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelFolded, setPanelFolded] = useState(false);
  const taskRequest = 0;
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const dragStart = useRef(new Map<string, { x: number; y: number; quad: ZoneId }>());

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
      const cfg = mergeConfig(saved.config);
      const cards = (saved.cards ?? []).filter((c) => ZONE_IDS.includes(c.quad));
      setNodes([...staticNodes(cfg), ...cards.map(toCardNode)]);
      setLoaded(true);
      setTimeout(() => {
        const keep = cards.some((c) => c.quad === "unassigned");
        void fitView({
          padding: 0.06,
          duration: 0,
          nodes: [
            ...ZONE_IDS.filter((z) => z !== "unassigned" || keep).map((z) => ({ id: `zone-${z}` })),
            { id: "axis-yHigh" },
            { id: "axis-yLow" },
          ],
        });
      }, 80);
    })();
    return () => {
      alive = false;
    };
  }, [boardId, setNodes, fitView]);

  // 변경이 멈추고 0.8초 뒤 자동 저장(선택·검색 표시 같은 일시 값은 저장하지 않는다).
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
      const payload: MatrixSaved = {
        meta: { v: 1 },
        config: cfg,
        cards: nodes.filter(isCard).map((n) => ({
          id: n.id,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
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
  }, [nodes, loaded, boardId]);

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
    void fitView({ nodes: [{ id: matchIds[i]! }], duration: 350, maxZoom: 1.1, padding: 1.2 });
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

  // ── 카드 배치 ──
  const othersIn = (zone: ZoneId, list: MNode[], skip: Set<string>) =>
    list
      .filter((n) => isCard(n) && cd(n).quad === zone && !skip.has(n.id))
      .map((n) => cardRect(n.position));

  /** 카드를 zone에 놓을 자리를 찾는다(꽉 찼으면 Unassigned, 거기도 꽉 찼으면 null). */
  const place = (
    zone: ZoneId,
    list: MNode[],
    skip: Set<string>,
    desired?: { x: number; y: number },
  ): { zone: ZoneId; pos: { x: number; y: number } } | null => {
    const z = ZONES[zone];
    const want = desired ?? { x: z.x + PAD, y: z.y + HEADER_H };
    const tries: ZoneId[] = zone === "unassigned" ? ["unassigned"] : [zone, "unassigned"];
    for (const t of tries) {
      const pos = findFree(
        t,
        othersIn(t, list, skip),
        t === zone ? want : { x: ZONES[t].x, y: ZONES[t].y },
      );
      if (pos) return { zone: t, pos };
    }
    return null;
  };

  const addCard = (zone: ZoneId, init?: Partial<CardData>) => {
    const id = newId();
    const r = place(zone, nodes, new Set());
    if (!r) {
      setNotice("구역이 가득 찼어요 — 카드를 정리하거나 다른 구역을 이용하세요.");
      return null;
    }
    if (r.zone !== zone) setNotice("구역이 가득 차서 Unassigned에 추가했어요.");
    const node = toCardNode({
      id,
      x: r.pos.x,
      y: r.pos.y,
      quad: r.zone,
      title: init?.title ?? "새 아이디어",
      ...(init?.meta ? { meta: init.meta } : {}),
      ...(init?.src ? { src: init.src } : {}),
    });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
    setPanelId(id);
    setPanelFolded(false);
    return id;
  };

  const moveCardTo = (id: string, zone: ZoneId) => {
    const r = place(zone, nodes, new Set([id]));
    if (!r) return setNotice("그 구역은 가득 찼어요.");
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? ({ ...n, position: r.pos, data: { ...n.data, quad: r.zone } } as MNode) : n,
      ),
    );
  };

  const onNodeDragStart = (_: unknown, __: MNode, dragged: MNode[]) => {
    dragStart.current.clear();
    for (const n of dragged)
      if (isCard(n)) dragStart.current.set(n.id, { ...n.position, quad: cd(n).quad });
  };
  const onNodeDragStop = (_: unknown, __: MNode, dragged: MNode[]) => {
    // 놓은 자리의 사분면으로 분류를 바꾸고, 다른 카드와 겹치면 가장 가까운 빈자리로 옮긴다.
    const ids = new Set(dragged.filter(isCard).map((n) => n.id));
    setNodes((ns) => {
      const settled: MNode[] = ns.filter((n) => !ids.has(n.id));
      const moved = new Map<string, { pos: { x: number; y: number }; quad: ZoneId }>();
      for (const id of ids) {
        const n = ns.find((x) => x.id === id);
        if (!n) continue;
        const zone = zoneAt(n.position.x + CARD_W / 2, n.position.y + CARD_H / 2);
        const r = place(
          zone,
          [
            ...settled,
            ...[...moved].map(
              ([mid, m]) =>
                ({ id: mid, type: "card", position: m.pos, data: { quad: m.quad } }) as MNode,
            ),
          ],
          new Set(),
          n.position,
        );
        const back = dragStart.current.get(id);
        moved.set(
          id,
          r
            ? { pos: r.pos, quad: r.zone }
            : { pos: back ? { x: back.x, y: back.y } : n.position, quad: back?.quad ?? cd(n).quad },
        );
        if (!r) setNotice("그 구역은 가득 차서 원래 자리로 돌려놨어요.");
      }
      return ns.map((n) => {
        const m = moved.get(n.id);
        return m ? ({ ...n, position: m.pos, data: { ...n.data, quad: m.quad } } as MNode) : n;
      });
    });
  };

  const arrangeAll = () => {
    const list = cards.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      quad: cd(n).quad,
    }));
    const pos = arrangeCards(list);
    setNodes((ns) =>
      ns.map((n) => (pos.has(n.id) ? ({ ...n, position: pos.get(n.id)! } as MNode) : n)),
    );
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
    let list = nodes;
    const added: MNode[] = [];
    let spill = false;
    for (const it of items) {
      const r = place(zone, list, new Set());
      if (!r) {
        setNotice("자리가 부족해 일부는 가져오지 못했어요.");
        break;
      }
      if (r.zone !== zone) spill = true;
      const node = toCardNode({
        id: newId(),
        x: r.pos.x,
        y: r.pos.y,
        quad: r.zone,
        title: it.title,
        meta: it.meta,
        src: it.src,
      });
      added.push(node);
      list = [...list, node];
    }
    setNodes((ns) => [...ns, ...added]);
    setNotice(
      `${added.length}개를 가져왔어요${spill ? " (일부는 구역이 가득 차 Unassigned에 놓았어요)" : ""}.`,
    );
  };

  const tb =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-input bg-background text-foreground transition-colors hover:bg-secondary disabled:opacity-40";
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
  const panelOpen = panelNode !== null && !panelFolded;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of cards) c[cd(n).quad] = (c[cd(n).quad] ?? 0) + 1;
    return c;
  }, [cards]);

  return (
    <div className="mm space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            aria-label="카드 검색"
            className="h-8 w-36 border border-input bg-background pl-7 pr-2 font-mono text-xs sm:w-48"
            placeholder="카드 검색 (Enter=다음)"
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
          className="inline-flex h-8 items-center gap-1 border border-input bg-background px-2 font-mono text-xs hover:bg-secondary"
          title="Unassigned에 새 아이디어 카드 추가"
          onClick={() => addCard("unassigned")}
        >
          <Plus className="h-4 w-4" /> 카드
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 border border-input bg-background px-2 font-mono text-xs hover:bg-secondary"
          title="마인드맵 보드의 아이디어를 복사해 오기(원본은 그대로)"
          onClick={() => setImportOpen(true)}
        >
          <Download className="h-4 w-4" /> 마인드맵에서 가져오기
        </button>
        <button
          type="button"
          className={tb}
          title="구역별 카드 자동 정렬(겹침 없이 촘촘하게)"
          aria-label="자동 정렬"
          onClick={() => {
            if (window.confirm("모든 구역의 카드를 격자로 다시 정렬할까요? (분류는 그대로)"))
              arrangeAll();
          }}
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <span className="mx-0.5 hidden h-5 w-px bg-border md:inline-block" />
        <button
          type="button"
          className={tb}
          title="축소"
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
          onClick={() => void zoomIn({ duration: 150 })}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tb}
          title="전체 보기"
          aria-label="전체 보기"
          onClick={() => void fitView({ padding: 0.06, duration: 300 })}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {notice ?? statusText}
        </span>
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
            <p>· 카드를 다른 사분면으로 끌어놓으면 분류가 자동으로 바뀌고 위치가 저장돼요.</p>
            <p>
              · 겹치게 놓으면 가장 가까운 빈자리로 옮겨져요. 자리가 없으면 원래 자리로 돌아가요.
            </p>
            <p>· 카드 클릭 = 오른쪽 상세 패널(설명·체크리스트·링크·플래너 작업).</p>
            <p>· 축 이름·사분면 이름은 글자를 눌러 바로 고칠 수 있어요.</p>
            <p>· 휠 = 확대/축소, 빈 곳 드래그 = 화면 이동, Delete = 선택한 카드 삭제.</p>
            <p>· 분류하지 않은 아이디어는 오른쪽 Unassigned 영역에 두세요.</p>
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative h-[72vh] min-h-[420px] overflow-hidden border border-border bg-card outline-none">
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
            onPaneClick={() => undefined}
            onNodeDragStart={onNodeDragStart as never}
            onNodeDragStop={onNodeDragStop as never}
            deleteKeyCode={["Delete", "Backspace"]}
            zoomOnDoubleClick={false}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
          </ReactFlow>
        </MatrixCtx.Provider>

        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex gap-2 font-mono text-[10px] text-muted-foreground">
          {ZONE_IDS.map((z) => (
            <span key={z}>
              {z === "unassigned" ? "UNASSIGNED" : z.toUpperCase()} {counts[z] ?? 0}
            </span>
          ))}
        </div>

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
                  {ZONE_IDS.map((z) => {
                    const t = nodes.find((n) => n.id === `zone-${z}`)?.data["title"];
                    return (
                      <option key={z} value={z}>
                        {String(t ?? z)}
                      </option>
                    );
                  })}
                </select>
              </label>
            }
            taskRequest={taskRequest}
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

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importedSrc={importedSrc}
        titlesLower={titlesLower}
        zoneTitle={(z) => String(nodes.find((n) => n.id === `zone-${z}`)?.data["title"] ?? z)}
        onImport={(items, zone) => {
          importCards(items, zone);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

interface MindNodeRaw {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}
interface ImportItem {
  key: string;
  nodeId: string;
  title: string;
  desc: string;
  meta: NodeMeta;
}

function ImportDialog({
  open,
  onOpenChange,
  importedSrc,
  titlesLower,
  zoneTitle,
  onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  importedSrc: Set<string>;
  titlesLower: Set<string>;
  zoneTitle: (z: ZoneId) => string;
  onImport: (items: { title: string; meta: NodeMeta; src: string }[], zone: ZoneId) => void;
}) {
  const [boards, setBoards] = useState<{ id: string; title: string; mindmap: Json }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [zone, setZone] = useState<ZoneId>("unassigned");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setErr(null);
    void supabase
      .from("design_moodboards")
      .select("id, title, mindmap")
      .eq("kind", "MIND")
      .order("title")
      .then(({ data, error }) => {
        if (error) return setErr(error.message);
        const rows = [...(data ?? [])].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
        );
        setBoards(rows);
        setBoardId((cur) => cur || rows[0]?.id || "");
      });
  }, [open]);

  const items: ImportItem[] = useMemo(() => {
    const b = boards.find((x) => x.id === boardId);
    const raw = ((b?.mindmap as { nodes?: MindNodeRaw[] } | null)?.nodes ?? []).filter(
      (n) => n.type === "note" || n.type === "shape" || n.type === "default",
    );
    const out: ImportItem[] = [];
    for (const n of raw) {
      const d = n.data ?? {};
      const text = String(d["text"] ?? d["label"] ?? "").trim();
      if (!text) continue;
      const lines = text.split("\n");
      const meta = { ...getMeta(d) } as NodeMeta;
      const desc = (meta.description ?? lines.slice(1).join("\n")).trim();
      out.push({ key: `${boardId}:${n.id}`, nodeId: n.id, title: lines[0]!.trim(), desc, meta });
    }
    return out;
  }, [boards, boardId]);
  const shown = items.filter(
    (i) => !filter || `${i.title}\n${i.desc}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const blocked = (i: ImportItem) =>
    importedSrc.has(i.key)
      ? "가져옴"
      : titlesLower.has(i.title.toLowerCase())
        ? "같은 제목 있음"
        : null;

  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>마인드맵에서 가져오기</DialogTitle>
          <DialogDescription>
            원본 마인드맵 노드는 바뀌지 않아요. 분류는 직접 고르세요(자동 분류 없음).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-8 flex-1 border border-input bg-background px-2 font-mono text-xs"
            value={boardId}
            onChange={(e) => {
              setBoardId(e.target.value);
              setPicked(new Set());
            }}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <select
            className="h-8 border border-input bg-background px-2 font-mono text-xs"
            value={zone}
            onChange={(e) => setZone(e.target.value as ZoneId)}
            title="가져온 카드를 처음 놓을 구역"
          >
            {ZONE_IDS.map((z) => (
              <option key={z} value={z}>
                → {zoneTitle(z)}
              </option>
            ))}
          </select>
        </div>
        <input
          className="h-8 border border-input bg-background px-2 font-mono text-xs"
          placeholder="아이디어 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="max-h-[42vh] space-y-1 overflow-y-auto">
          {shown.map((i) => {
            const why = blocked(i);
            return (
              <label
                key={i.key}
                className={`flex items-start gap-2 border border-border p-1.5 ${why ? "opacity-50" : "cursor-pointer hover:bg-secondary"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={Boolean(why)}
                  checked={picked.has(i.key)}
                  onChange={() => toggle(i.key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs font-semibold">{i.title}</span>
                  {i.desc && (
                    <span className="line-clamp-1 block font-mono text-[11px] text-muted-foreground">
                      {i.desc}
                    </span>
                  )}
                </span>
                {why && <span className="font-mono text-[10px] text-muted-foreground">{why}</span>}
              </label>
            );
          })}
          {shown.length === 0 && (
            <p className="font-mono text-xs text-muted-foreground">가져올 노드가 없어요.</p>
          )}
        </div>
        {err && <p className="font-mono text-xs text-destructive">{err}</p>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="font-mono text-[11px] underline"
            onClick={() => setPicked(new Set(shown.filter((i) => !blocked(i)).map((i) => i.key)))}
          >
            보이는 것 모두 선택
          </button>
          <button
            type="button"
            disabled={picked.size === 0}
            className="border border-foreground bg-foreground px-3 py-1.5 font-mono text-xs text-background disabled:opacity-40"
            onClick={() =>
              onImport(
                items
                  .filter((i) => picked.has(i.key))
                  .map((i) => ({
                    title: i.title,
                    src: i.key,
                    meta: { ...i.meta, ...(i.desc ? { description: i.desc } : {}) },
                  })),
                zone,
              )
            }
          >
            {picked.size}개 가져오기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DesignValueMatrix({ boardId }: { boardId: string }) {
  return (
    <ReactFlowProvider>
      <MatrixCanvas boardId={boardId} />
    </ReactFlowProvider>
  );
}
