import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  categoriesQuery,
  componentQuery,
  componentUsageQuery,
} from "@/lib/queries";
import { categoryPath } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { ComponentFormulasSection } from "@/components/pilot/FormulaSummary";
import {
  NextPhaseSection,
  SectionCard,
  StatusBadge,
  buttonClass,
  inputClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/components/$componentId")({
  head: () => ({
    meta: [
      { title: "PILOT — Component Detail" },
      { name: "description", content: "Reusable component and where it is used" },
      { property: "og:title", content: "PILOT — Component Detail" },
      {
        property: "og:description",
        content: "Reusable component and where it is used",
      },
    ],
  }),
  component: ComponentDetailPage,
});

function ComponentDetailPage() {
  const { componentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const component = useQuery(componentQuery(componentId));
  const categories = useQuery(categoriesQuery());
  const usage = useQuery(componentUsageQuery(componentId));

  const categoryList = categories.data ?? [];
  const path = categoryPath(categoryList, component.data?.category_id ?? null);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "COMPONENTS", path: "/components" },
    ...path.map((c) => ({ label: c.name })),
    { label: (component.data?.name ?? "…").toUpperCase() },
  ]);

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"components">) => {
      const { error } = await supabase
        .from("components")
        .update(patch)
        .eq("id", componentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      await queryClient.invalidateQueries({
        queryKey: ["components", componentId],
      });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("components")
        .delete()
        .eq("id", componentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      void navigate({ to: "/components" });
    },
  });

  if (!component.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {component.isLoading ? "LOADING…" : "COMPONENT NOT FOUND"}
      </p>
    );
  }

  const data = component.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineText
            value={data.name}
            className="text-lg"
            onSave={(name) => update.mutate({ name })}
          />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <CategorySelect
          className={selectClass + " w-auto"}
          value={data.category_id ?? ""}
          onChange={(id) => update.mutate({ category_id: id || null })}
          emptyLabel="NO CATEGORY"
        />
      </div>

      <SectionCard title="DESCRIPTION">
        <TextArea
          value={data.description ?? ""}
          onSave={(description) => update.mutate({ description })}
        />
      </SectionCard>

      <SectionCard title="USED IN">
        {(usage.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NOT LINKED TO ANY PRODUCT
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(usage.data ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  to="/products/$productId"
                  params={{ productId: row.products.id }}
                  className="flex items-center justify-between gap-2 px-3 py-3 hover:bg-secondary"
                >
                  <span className="text-sm">{row.products.name}</span>
                  <StatusBadge status={row.products.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="NOTES">
        <TextArea
          value={data.notes ?? ""}
          onSave={(notes) => update.mutate({ notes })}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ComponentFormulasSection componentId={componentId} />
        <NextPhaseSection title="EXPERIMENTS" />
      </div>

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (confirm("DELETE THIS COMPONENT?")) remove.mutate();
        }}
      >
        DELETE COMPONENT
      </button>
    </div>
  );
}

function InlineText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-foreground outline-none hover:border-border focus:border-foreground ${className ?? ""}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
    />
  );
}

function TextArea({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      rows={4}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}
