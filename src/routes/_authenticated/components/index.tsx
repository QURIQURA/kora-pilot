import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { componentsQuery, techniqueCategoriesQuery } from "@/lib/queries";
import { techniquePathLabel } from "@/lib/technique";
import { formatDateTime } from "@/lib/datetime";
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
        <ul className="divide-y divide-border border border-border bg-card">
          {rows.map((component) => (
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
                  {techniquePathLabel(
                    techniqueCategories.data ?? [],
                    component.technique_category_id,
                  )}{" "}
                  · {formatDateTime(component.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && <ComponentCreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}
