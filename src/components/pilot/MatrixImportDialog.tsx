import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMeta, type NodeMeta } from "@/lib/mindmap-node-meta";
import { ZONE_IDS, type ZoneId } from "@/lib/value-matrix";

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

export function MatrixImportDialog({
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
