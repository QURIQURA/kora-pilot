import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery, componentsQuery } from "@/lib/queries";
import { categoryPathLabel } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { Field, PageHeader, inputClass } from "@/components/pilot/ui";

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
  const categories = useQuery(categoriesQuery());
  const [search, setSearch] = useState("");

  const rows = (components.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="COMPONENTS" />
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
        <EmptyState message="NO COMPONENTS YET" />
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {rows.map((component) => (
            <li key={component.id}>
              <Link
                to="/components/$componentId"
                params={{ componentId: component.id }}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-secondary"
              >
                <span className="text-sm">{component.name}</span>
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {categoryPathLabel(categories.data ?? [], component.category_id)}{" "}
                  · {formatDateTime(component.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
