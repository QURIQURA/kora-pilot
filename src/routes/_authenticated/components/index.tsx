import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { componentsQuery, techniqueCategoriesQuery } from "@/lib/queries";
import { buildTechniqueTree, techniquePath, type TechniqueCategory } from "@/lib/technique";
import { formatDateTime } from "@/lib/datetime";
import type { Component } from "@/lib/pilot";
import { EmptyState } from "@/components/EmptyState";
import { ComponentCreateModal } from "@/components/pilot/ComponentCreateModal";
import { Field, PageHeader, inputClass, primaryButtonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/components/")({
  head: () => ({
    meta: [
      { title: "PILOT — Components" },
      { name: "description", content: "Reusable product components" },
      { property: "og:title", content: "PILOT — Components" },
      { property: "og:description", content: "Reusable product components" },
    ],
  }),
  component: ComponentsPage,
});

function ComponentsPage() {
  const components = useQuery(componentsQuery());
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("components").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
    },
  });

  // 기본 정렬(UPDATED 최신순)은 유지하되, 📌 고정한 COMPONENT는 지금 작업 중인 레시피이므로
  // 그 순서와 무관하게 항상 맨 위에 온다(2026-09-22).
  const rows = (components.data ?? [])
    .filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));

  // 2026-10-12 사용자 요청: TECHNIQUE CATEGORY(최상위 그룹) 기준으로 묶어서 보여준다 — 그룹 순서는
  // SETTINGS → TECHNIQUE CATEGORIES와 동일(sort_order), TECHNIQUE CATEGORY가 없는 COMPONENT는
  // 맨 아래 "미분류" 그룹으로 모은다. 그룹 안에서는 기존처럼 📌 고정 → UPDATED 최신순.
  const techList = techniqueCategories.data ?? [];
  const rootOrder = buildTechniqueTree(techList).map((n) => n.category);
  const groups = new Map<string, { category: TechniqueCategory | null; items: Component[] }>();
  for (const c of rows) {
    const path = techniquePath(techList, c.technique_category_id);
    const root = path[0] ?? null;
    const key = root?.id ?? "__unassigned";
    if (!groups.has(key)) groups.set(key, { category: root, items: [] });
    groups.get(key)!.items.push(c);
  }
  const groupedRows = [...rootOrder.map((r) => r.id), "__unassigned"]
    .map((key) => groups.get(key))
    .filter((g): g is { category: TechniqueCategory | null; items: Component[] } => !!g);

  /** 그룹 헤더로 이미 보여준 최상위 TECHNIQUE CATEGORY 이름은 빼고, 그 아래 경로만 라벨로 표시 */
  const subPathLabel = (componentId: string | null): string => {
    const path = techniquePath(techList, componentId);
    return path.length > 1 ? path.slice(1).map((p) => p.name).join(" / ") : "—";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="COMPONENTS"
        action={
          <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
            + CREATE COMPONENT
          </button>
        }
      />
      <div className="border border-border bg-card p-4">
        <Field label="SEARCH">
          <input
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message={
            (components.data ?? []).length === 0
              ? "NO COMPONENTS YET"
              : "NO COMPONENTS MATCH THIS SEARCH"
          }
          actionLabel="+ CREATE COMPONENT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="space-y-4">
          {groupedRows.map(({ category, items }) => (
            <div key={category?.id ?? "__unassigned"} className="border border-border bg-card">
              <div className="label-caps flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
                <span>
                  {category ? category.name : "미분류"}
                  {category?.name_en && (
                    <span className="ml-2 text-[11px] normal-case">{category.name_en}</span>
                  )}
                </span>
                <span>{items.length}</span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((component) => (
                  <li key={component.id} className="flex items-stretch">
                    <button
                      type="button"
                      title={component.pinned ? "고정 해제" : "목록 맨 위에 고정"}
                      className={`flex shrink-0 items-center px-3 hover:bg-secondary ${
                        component.pinned ? "text-foreground" : "text-muted-foreground/40"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        togglePin.mutate({ id: component.id, pinned: !component.pinned });
                      }}
                    >
                      <Pin className="h-4 w-4" fill={component.pinned ? "currentColor" : "none"} />
                    </button>
                    <Link
                      to="/components/$componentId"
                      params={{ componentId: component.id }}
                      className="flex flex-1 flex-wrap items-center justify-between gap-2 py-3 pr-4 hover:bg-secondary"
                    >
                      <span className="text-sm">{component.name}</span>
                      <span className="font-mono text-xs uppercase text-muted-foreground">
                        {subPathLabel(component.technique_category_id)} ·{" "}
                        {formatDateTime(component.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {creating && <ComponentCreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}
