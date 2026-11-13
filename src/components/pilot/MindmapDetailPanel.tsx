import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink, Link2Off, Plus, Trash2, X } from "lucide-react";
import {
  getMeta,
  newItemId,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type NodeMeta,
  type NodeStatus,
  type Priority,
} from "@/lib/mindmap-node-meta";
import {
  createPlannerTask,
  fetchPlannerTasks,
  searchPlannerTasks,
  setPlannerTaskDone,
  type PlannerTaskRef,
} from "@/lib/mindmap-planner";

/** 마인드맵 우측 노드 상세 패널(2026-11-13) — 캔버스 위에 겹쳐 열려서 캔버스 크기·뷰포트를 바꾸지 않는다. */
export interface RelNode {
  id: string;
  title: string;
  edgeId: string;
  label: string;
}
export interface PanelNode {
  id: string;
  type: string;
  title: string;
  color?: string;
  data: Record<string, unknown>;
}
interface Props {
  boardId: string;
  node: PanelNode;
  parents: RelNode[];
  children: RelNode[];
  others: RelNode[];
  colors: readonly string[];
  taskRequest: number; // 값이 바뀌면 "작업 만들기" 폼을 연다(우클릭 메뉴)
  onTitle: (t: string) => void;
  onColor: (c: string) => void;
  onMeta: (patch: Partial<NodeMeta>) => void;
  onEdgeLabel: (edgeId: string, label: string) => void;
  onGoto: (id: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onCollapse: () => void;
}

const field =
  "w-full border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-foreground";

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: string | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-wide hover:bg-secondary"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
        {badge && <span className="ml-auto font-normal text-muted-foreground">{badge}</span>}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </section>
  );
}

function Tags({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setV("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px]"
        >
          {t}
          <button
            type="button"
            aria-label="태그 삭제"
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-[6rem] flex-1 border border-dashed border-border bg-background px-1.5 py-0.5 font-mono text-[11px] outline-none"
        placeholder="+ 태그 (Enter)"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

function LinkedWork({
  boardId,
  nodeId,
  title,
  meta,
  onMeta,
  taskRequest,
}: {
  boardId: string;
  nodeId: string;
  title: string;
  meta: NodeMeta;
  onMeta: (p: Partial<NodeMeta>) => void;
  taskRequest: number;
}) {
  const ids = meta.taskIds ?? [];
  const idsKey = ids.join(",");
  const [tasks, setTasks] = useState<PlannerTaskRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "create" | "link">("none");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlannerTaskRef[]>([]);

  const refresh = useCallback(async () => {
    if (!idsKey) {
      setTasks([]);
      return;
    }
    try {
      setTasks(await fetchPlannerTasks(idsKey.split(",")));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [idsKey]);
  // 상태의 원천은 플래너 — 열 때·1분마다·창 복귀 시 다시 읽는다.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  useEffect(() => {
    if (taskRequest > 0) {
      setMode("create");
      setNewTitle(title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskRequest]);

  const link = (id: string) => {
    if (!ids.includes(id)) onMeta({ taskIds: [...ids, id] });
  };
  const doCreate = async () => {
    if (!newTitle.trim()) return;
    if (!window.confirm(`플래너에 작업을 만들까요?\n\n"${newTitle.trim()}"`)) return;
    setBusy(true);
    try {
      const r = await createPlannerTask({
        board_id: boardId,
        node_id: nodeId,
        title: newTitle.trim(),
        due_date: newDue || null,
        notes: meta.description || null,
      });
      link(r.task.id);
      if (r.duplicate) setErr("같은 작업이 이미 있어 새로 만들지 않고 기존 작업을 연결했어요.");
      else setErr(null);
      setMode("none");
      setNewTitle("");
      setNewDue("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doSearch = async () => {
    setBusy(true);
    try {
      setFound(await searchPlannerTasks(q));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (t: PlannerTaskRef) => {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, completed: !t.completed } : x)));
    try {
      await setPlannerTaskDone(t.id, !t.completed);
      window.dispatchEvent(new Event("mm-tasks-changed"));
    } catch (e) {
      setErr((e as Error).message);
      void refresh();
    }
  };
  const missing = ids.filter((id) => !tasks.some((t) => t.id === id));

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-start gap-2 border border-border p-1.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={t.completed}
            onChange={() => void toggle(t)}
            aria-label="완료"
          />
          <div className="min-w-0 flex-1">
            <div
              className={`font-mono text-xs ${t.completed ? "text-muted-foreground line-through" : ""}`}
            >
              {t.title}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {[t.project_name, t.due_date].filter(Boolean).join(" · ") || "프로젝트 없음"}
            </div>
          </div>
          <button
            type="button"
            title="연결 해제(플래너 작업은 지우지 않아요)"
            onClick={() => onMeta({ taskIds: ids.filter((x) => x !== t.id) })}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {missing.length > 0 &&
        tasks.length + missing.length > 0 &&
        !err &&
        ids.length > tasks.length && (
          <div className="font-mono text-[10px] text-muted-foreground">
            플래너에서 찾을 수 없는 작업 {missing.length}개(삭제됨?){" "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                onMeta({ taskIds: ids.filter((id) => tasks.some((t) => t.id === id)) })
              }
            >
              연결 정리
            </button>
          </div>
        )}
      {ids.length === 0 && (
        <div className="font-mono text-[11px] text-muted-foreground">연결된 작업이 없어요.</div>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 border border-input px-2 py-1 font-mono text-[11px] hover:bg-secondary"
          onClick={() => {
            setMode(mode === "create" ? "none" : "create");
            setNewTitle(title);
          }}
        >
          <Plus className="h-3 w-3" /> 작업 만들기
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 border border-input px-2 py-1 font-mono text-[11px] hover:bg-secondary"
          onClick={() => {
            setMode(mode === "link" ? "none" : "link");
            if (mode !== "link") void doSearch();
          }}
        >
          <ExternalLink className="h-3 w-3" /> 기존 작업 연결
        </button>
      </div>
      {mode === "create" && (
        <div className="space-y-1 border border-dashed border-border p-2">
          <input
            className={field}
            placeholder="작업 제목"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <input
            className={field}
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy || !newTitle.trim()}
              className="border border-foreground bg-foreground px-2 py-1 font-mono text-[11px] text-background disabled:opacity-40"
              onClick={() => void doCreate()}
            >
              {busy ? "만드는 중…" : "플래너에 만들기"}
            </button>
            <button
              type="button"
              className="px-2 py-1 font-mono text-[11px]"
              onClick={() => setMode("none")}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {mode === "link" && (
        <div className="space-y-1 border border-dashed border-border p-2">
          <div className="flex gap-1">
            <input
              className={field}
              placeholder="작업 제목 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void doSearch()}
            />
            <button
              type="button"
              className="border border-input px-2 font-mono text-[11px]"
              onClick={() => void doSearch()}
            >
              검색
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {found.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={ids.includes(t.id)}
                onClick={() => {
                  link(t.id);
                  setMode("none");
                }}
                className="block w-full border border-border px-2 py-1 text-left font-mono text-[11px] hover:bg-secondary disabled:opacity-40"
              >
                {t.completed ? "✓ " : ""}
                {t.title}
                <span className="block text-[10px] text-muted-foreground">
                  {[t.project_name, t.due_date].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
            {found.length === 0 && !busy && (
              <div className="font-mono text-[11px] text-muted-foreground">결과 없음</div>
            )}
          </div>
        </div>
      )}
      {err && <div className="font-mono text-[11px] text-destructive">{err}</div>}
    </div>
  );
}

export function MindmapDetailPanel(p: Props) {
  const meta = getMeta(p.node.data);
  const checklist = meta.checklist ?? [];
  const links = meta.links ?? [];
  const done = checklist.filter((c) => c.done).length;
  const isImage = p.node.type === "image";
  const [newItem, setNewItem] = useState("");

  const rel = (title: string, list: RelNode[]) => (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">{title}</div>
      {list.length === 0 ? (
        <div className="font-mono text-[11px] text-muted-foreground">없음</div>
      ) : (
        list.map((r) => (
          <div key={r.edgeId} className="mb-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => p.onGoto(r.id)}
              className="min-w-0 max-w-[45%] truncate border border-border px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-secondary"
              title={r.title}
            >
              {r.title || "(빈 노드)"}
            </button>
            <input
              className={`${field} !py-0.5`}
              placeholder="관계 글자"
              value={r.label}
              onChange={(e) => p.onEdgeLabel(r.edgeId, e.target.value)}
            />
          </div>
        ))
      )}
    </div>
  );

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-[340px] max-w-[92%] flex-col border-l border-border bg-card shadow-xl"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <span className="font-mono text-[11px] font-semibold uppercase">노드 상세</span>
        <span className="ml-auto" />
        <button
          type="button"
          title="패널 접기"
          className="p-1 hover:bg-secondary"
          onClick={p.onCollapse}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="닫기 (Esc)"
          className="p-1 hover:bg-secondary"
          onClick={p.onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="기본 정보">
          {!isImage && (
            <textarea
              className={`${field} resize-none text-sm font-semibold`}
              rows={2}
              placeholder="제목"
              value={p.node.title}
              onChange={(e) => p.onTitle(e.target.value)}
            />
          )}
          <textarea
            className={`${field} resize-y`}
            rows={3}
            placeholder="설명 — 이 노드가 무엇이고 왜 필요한지"
            value={meta.description ?? ""}
            onChange={(e) => p.onMeta({ description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="font-mono text-[10px] uppercase text-muted-foreground">
              우선순위
              <select
                className={field}
                value={meta.priority ?? ""}
                onChange={(e) => p.onMeta({ priority: e.target.value as Priority })}
              >
                <option value="">—</option>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="font-mono text-[10px] uppercase text-muted-foreground">
              상태
              <select
                className={field}
                value={meta.status ?? ""}
                onChange={(e) => p.onMeta({ status: e.target.value as NodeStatus })}
              >
                <option value="">—</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Tags tags={meta.tags ?? []} onChange={(tags) => p.onMeta({ tags })} />
          {!isImage && (
            <div className="flex items-center gap-1">
              {p.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  title="노드 색상"
                  onClick={() => p.onColor(c)}
                  className={`h-5 w-5 border ${p.node.color === c ? "border-foreground" : "border-black/30"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="실행" badge={checklist.length ? `${done}/${checklist.length}` : undefined}>
          <div className="space-y-1">
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={() =>
                    p.onMeta({
                      checklist: checklist.map((x) =>
                        x.id === c.id ? { ...x, done: !x.done } : x,
                      ),
                    })
                  }
                />
                <input
                  className={`${field} !py-0.5 ${c.done ? "text-muted-foreground line-through" : ""}`}
                  value={c.text}
                  onChange={(e) =>
                    p.onMeta({
                      checklist: checklist.map((x) =>
                        x.id === c.id ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  type="date"
                  className="w-[7.2rem] border border-border bg-background px-1 py-0.5 font-mono text-[10px]"
                  value={c.due ?? ""}
                  onChange={(e) =>
                    p.onMeta({
                      checklist: checklist.map((x) =>
                        x.id === c.id ? { ...x, due: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label="항목 삭제"
                  onClick={() => p.onMeta({ checklist: checklist.filter((x) => x.id !== c.id) })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
            <input
              className={`${field} border-dashed`}
              placeholder="+ 실행 항목 추가 (Enter)"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  p.onMeta({
                    checklist: [
                      ...checklist,
                      { id: newItemId(), text: newItem.trim(), done: false },
                    ],
                  });
                  setNewItem("");
                }
              }}
            />
          </div>
          <label className="block font-mono text-[10px] uppercase text-muted-foreground">
            마감일
            <input
              type="date"
              className={field}
              value={meta.due ?? ""}
              onChange={(e) => p.onMeta({ due: e.target.value })}
            />
          </label>
          <textarea
            className={`${field} resize-y`}
            rows={3}
            placeholder="메모"
            value={meta.notes ?? ""}
            onChange={(e) => p.onMeta({ notes: e.target.value })}
          />
          <div className="space-y-1">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-1">
                <input
                  className={`${field} !w-24 !py-0.5`}
                  placeholder="이름"
                  value={l.label}
                  onChange={(e) =>
                    p.onMeta({
                      links: links.map((x) =>
                        x.id === l.id ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  className={`${field} !py-0.5`}
                  placeholder="https://"
                  value={l.url}
                  onChange={(e) =>
                    p.onMeta({
                      links: links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)),
                    })
                  }
                />
                {/^https?:\/\//i.test(l.url) && (
                  <a href={l.url} target="_blank" rel="noreferrer noopener" aria-label="열기">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  aria-label="링크 삭제"
                  onClick={() => p.onMeta({ links: links.filter((x) => x.id !== l.id) })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="font-mono text-[11px] text-muted-foreground underline"
              onClick={() =>
                p.onMeta({ links: [...links, { id: newItemId(), label: "", url: "" }] })
              }
            >
              + 외부 링크
            </button>
          </div>
        </Section>

        <Section
          title="연결 관계"
          defaultOpen={false}
          badge={`${p.parents.length + p.children.length + p.others.length}`}
        >
          {rel("부모", p.parents)}
          {rel("자식", p.children)}
          {p.others.length > 0 && rel("기타 연결", p.others)}
        </Section>

        <Section
          title="연결된 작업"
          badge={(meta.taskIds?.length ?? 0) ? String(meta.taskIds?.length) : undefined}
        >
          <LinkedWork
            boardId={p.boardId}
            nodeId={p.node.id}
            title={p.node.title}
            meta={meta}
            onMeta={p.onMeta}
            taskRequest={p.taskRequest}
          />
        </Section>
      </div>
      <footer className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={p.onDelete}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-destructive hover:underline"
        >
          <Trash2 className="h-3 w-3" /> 노드 삭제
        </button>
      </footer>
    </aside>
  );
}
