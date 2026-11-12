import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
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
import { buttonClass } from "./ui";

/** DESIGN BOARD 마인드맵(2026-11-13) — Miro식 자유 캔버스. 노트(텍스트) 노드를 배치하고 선으로 연결한다.
 * 보드 한 개당 design_moodboards.mindmap(jsonb)에 {nodes, edges, viewport}를 통째로 자동 저장한다. */

const COLORS = ["#fff7c2", "#ffd9e1", "#d6ecff", "#dff5dc", "#e8dcff", "#ffffff"] as const;

type NoteData = { text: string; color: string };
type ShapeKind = "rect" | "round" | "ellipse" | "diamond";
type ShapeData = { text: string; color: string; shape: ShapeKind };
type ImageData = { url: string };
type NoteNode = Node<NoteData, "note"> | Node<ShapeData, "shape"> | Node<ImageData, "image">;

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "rect", label: "▭ 사각형" },
  { kind: "round", label: "▢ 둥근 사각형" },
  { kind: "ellipse", label: "◯ 원" },
  { kind: "diamond", label: "◇ 마름모" },
];

function ShapeNodeView({ id, data, selected, width, height }: NodeProps<Node<ShapeData, "shape">>) {
  const { updateNodeData } = useReactFlow();
  const w = width ?? 180;
  const h = height ?? 110;
  const stroke = selected ? "#111" : "rgba(0,0,0,0.45)";
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <NodeResizer isVisible={selected} minWidth={70} minHeight={50} />
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ImageNodeView({ data, selected, width }: NodeProps<Node<ImageData, "image">>) {
  return (
    <div
      className="border bg-white p-1 shadow-sm"
      style={{
        width: width ?? 220,
        borderColor: selected ? "#111" : "rgba(0,0,0,0.25)",
        borderWidth: selected ? 2 : 1,
      }}
    >
      <NodeResizer isVisible={selected} minWidth={80} keepAspectRatio />
      <Handle type="target" position={Position.Left} />
      <img src={data.url} alt="" draggable={false} className="pointer-events-none block w-full" />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function NoteNodeView({ id, data, selected }: NodeProps<Node<NoteData, "note">>) {
  const { updateNodeData } = useReactFlow();
  return (
    <div
      className="min-h-[56px] min-w-[140px] max-w-[260px] border px-2 py-1.5 shadow-sm"
      style={{
        background: data.color,
        borderColor: selected ? "#111" : "rgba(0,0,0,0.25)",
        borderWidth: selected ? 2 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <textarea
        className="nodrag nowheel block w-full resize-none bg-transparent font-mono text-xs leading-snug text-black outline-none"
        rows={Math.max(
          2,
          (data.text.match(/\n/g)?.length ?? 0) + 1 + Math.floor(data.text.length / 28),
        )}
        placeholder="텍스트 입력"
        value={data.text}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { note: NoteNodeView, shape: ShapeNodeView, image: ImageNodeView };

type Saved = { nodes?: NoteNode[]; edges?: Edge[] };

function MindmapCanvas({ boardId }: { boardId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

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
      setNodes(saved.nodes ?? []);
      setEdges(saved.edges ?? []);
      setLoaded(true);
      setTimeout(() => void fitView({ padding: 0.2 }), 50);
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
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
          width: n.width,
          height: n.height,
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
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
    (c: Connection) => setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es)),
    [setEdges],
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
      const siblings = edges.filter((e) => e.source === opts.parent!.id).length;
      position = {
        x: opts.parent.position.x + 260,
        y: opts.parent.position.y + siblings * 90,
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
          type: "smoothstep",
        },
      ]);
  };

  const setColor = (color: string) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.selected && n.type !== "image" ? ({ ...n, data: { ...n.data, color } } as NoteNode) : n,
      ),
    );

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
    <div className="space-y-2">
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
          onClick={() => void fitView({ padding: 0.2 })}
        >
          전체 보기
        </button>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{statusText}</span>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        드래그로 이동 · 휠로 확대/축소 · 양옆 점을 끌어 연결 · 도형/이미지는 선택하면 모서리로 크기
        조절 · 이미지는 파일을 캔버스에 끌어놓거나 붙여넣기(Ctrl/⌘+V)도 가능 · Delete로 삭제
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
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
