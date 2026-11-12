import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, designMoodboardsQuery } from "@/lib/queries";
import { DesignMoodboardSection } from "@/components/pilot/OrderMoodboardSection";
import { DesignMindmap } from "@/components/pilot/DesignMindmap";
import { PageHeader, buttonClass, inputClass, primaryButtonClass } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/design-moodboard")({
  head: () => ({
    meta: [
      { title: "PILOT — Design Mood Board" },
      { name: "description", content: "Signature design mood boards" },
      { property: "og:title", content: "PILOT — Design Mood Board" },
      { property: "og:description", content: "Signature design mood boards" },
    ],
  }),
  component: DesignMoodboardPage,
});

/**
 * 시그니처 디자인 무드보드(2026-11-08) — 오더 하위가 아닌 독립 보드. 컨셉별로 보드를 여러 개 만들고
 * 목록에서 고른다(제목 수정/삭제 가능). 각 보드의 기능은 오더 무드보드와 동일.
 */
function DesignMoodboardPage() {
  const queryClient = useQueryClient();
  const boards = useQuery(designMoodboardsQuery());
  // Figma처럼 목적별 탭 — MOODBOARD(이미지·색·메모) / MINDMAP(자유 캔버스). 보드는 만들 때 종류가 정해진다.
  const [tab, setTab] = useState<"MOOD" | "MIND">("MOOD");
  const rows = (boards.data ?? []).filter((b) => b.kind === tab);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = rows.find((b) => b.id === selectedId) ?? rows[0] ?? null;
  useEffect(() => {
    setTitleDraft(selected?.title ?? "");
  }, [selected?.id, selected?.title]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["design_moodboards"] });

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error: e } = await supabase
        .from("design_moodboards")
        .insert({
          user_id: userId,
          kind: tab,
          title: `${tab === "MIND" ? "Mindmap" : "Board"} ${rows.length + 1}`,
        })
        .select("id")
        .single();
      if (e) throw e;
      return data.id;
    },
    onSuccess: async (id) => {
      await refresh();
      setSelectedId(id);
    },
    onError: (e) => setError((e as Error).message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error: e } = await supabase
        .from("design_moodboards")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (e) throw e;
    },
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("design_moodboards").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: async () => {
      setSelectedId(null);
      await refresh();
    },
    onError: (e) => setError((e as Error).message),
  });

  const commitTitle = () => {
    const title = titleDraft.trim();
    if (!selected) return;
    if (!title) return setTitleDraft(selected.title);
    if (title !== selected.title) rename.mutate({ id: selected.id, title });
  };

  return (
    <div className="space-y-3">
      <PageHeader title="DESIGN MOOD BOARD" />
      <div className="flex gap-1">
        {(
          [
            ["MOOD", "MOODBOARD"],
            ["MIND", "MINDMAP"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setSelectedId(null);
            }}
            className={cn(
              "border px-4 py-1.5 font-mono text-xs uppercase",
              tab === id ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <button
            type="button"
            className={cn(primaryButtonClass, "w-full")}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            + NEW {tab === "MIND" ? "MINDMAP" : "BOARD"}
          </button>
          {rows.length === 0 && !boards.isLoading && (
            <p className="font-mono text-xs text-muted-foreground">
              아직 없습니다. 위 NEW 버튼으로 첫 {tab === "MIND" ? "마인드맵" : "컨셉 보드"}를
              만드세요.
            </p>
          )}
          <ul className="space-y-1">
            {rows.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    "w-full border px-3 py-2 text-left font-mono text-xs uppercase",
                    b.id === selected?.id
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted",
                  )}
                >
                  {b.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected && (
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <input
                className={cn(inputClass, "flex-1")}
                value={titleDraft}
                placeholder="Board title"
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  if (window.confirm(`"${selected.title}" 를 안의 모든 내용과 함께 삭제할까요?`))
                    remove.mutate(selected.id);
                }}
              >
                DELETE
              </button>
            </div>
            {tab === "MOOD" ? (
              <DesignMoodboardSection
                key={selected.id}
                boardId={selected.id}
                title={selected.title}
              />
            ) : (
              <DesignMindmap key={selected.id} boardId={selected.id} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
