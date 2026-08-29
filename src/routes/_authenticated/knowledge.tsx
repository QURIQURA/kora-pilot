import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  componentsQuery,
  ingredientsQuery,
  knowledgeEntriesQuery,
  productsQuery,
  techniqueCategoriesQuery,
} from "@/lib/queries";
import { leafTechniques, techniquePath } from "@/lib/technique";
import { isGeneralKnowledge } from "@/lib/knowledge";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { KnowledgeCreateForm, KnowledgeList } from "@/components/pilot/KnowledgeSection";
import { Field, buttonClass, selectClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "PILOT — Knowledge" },
      { name: "description", content: "Accumulated baking knowledge" },
      { property: "og:title", content: "PILOT — Knowledge" },
      { property: "og:description", content: "Accumulated baking knowledge" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgePage,
});

type Scope = "ALL" | "GENERAL" | "PRODUCT" | "COMPONENT" | "INGREDIENT" | "TECHNIQUE";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "GENERAL", label: "일반 원칙" },
  { key: "PRODUCT", label: "PRODUCT" },
  { key: "COMPONENT", label: "COMPONENT" },
  { key: "INGREDIENT", label: "INGREDIENT" },
  { key: "TECHNIQUE", label: "TECHNIQUE" },
];

function KnowledgePage() {
  useSetBreadcrumb([{ label: "PILOT", path: "/" }, { label: "KNOWLEDGE" }]);

  const entries = useQuery(knowledgeEntriesQuery());
  const products = useQuery(productsQuery());
  const components = useQuery(componentsQuery());
  const ingredients = useQuery(ingredientsQuery());
  const techniques = useQuery(techniqueCategoriesQuery());

  const [scope, setScope] = useState<Scope>("ALL");
  const [targetId, setTargetId] = useState("");
  const [creating, setCreating] = useState(false);

  const list = entries.data ?? [];

  const filtered = useMemo(() => {
    return list.filter((entry) => {
      switch (scope) {
        case "ALL":
          return true;
        case "GENERAL":
          return isGeneralKnowledge(entry);
        case "PRODUCT":
          return targetId ? entry.product_id === targetId : Boolean(entry.product_id);
        case "COMPONENT":
          return targetId ? entry.component_id === targetId : Boolean(entry.component_id);
        case "INGREDIENT":
          return targetId ? entry.ingredient_id === targetId : Boolean(entry.ingredient_id);
        case "TECHNIQUE":
          return targetId
            ? entry.technique_category_id === targetId
            : Boolean(entry.technique_category_id);
        default:
          return true;
      }
    });
  }, [list, scope, targetId]);

  const techniqueList = techniques.data ?? [];
  const targetOptions: { id: string; name: string }[] =
    scope === "PRODUCT"
      ? (products.data ?? []).map((p) => ({ id: p.id, name: p.name }))
      : scope === "COMPONENT"
        ? (components.data ?? []).map((c) => ({ id: c.id, name: c.name }))
        : scope === "INGREDIENT"
          ? (ingredients.data ?? []).map((i) => ({ id: i.id, name: i.name }))
          : scope === "TECHNIQUE"
            ? leafTechniques(techniqueList).map(({ category }) => {
                const prefix = techniquePath(techniqueList, category.id)
                  .slice(0, -1)
                  .map((p) => p.name)
                  .join(" / ");
                return {
                  id: category.id,
                  name: `${prefix ? `${prefix} / ` : ""}${category.name}`,
                };
              })
            : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h1 className="label-caps text-foreground">KNOWLEDGE</h1>
        <button type="button" className={buttonClass} onClick={() => setCreating((v) => !v)}>
          {creating ? "CLOSE" : "+ ADD KNOWLEDGE"}
        </button>
      </div>

      {creating && <KnowledgeCreateForm onDone={() => setCreating(false)} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="FILTER">
          <select
            className={selectClass}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTargetId("");
            }}
          >
            {SCOPES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {targetOptions.length > 0 && (
          <Field label="대상 선택">
            <select
              className={selectClass}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">전체</option>
              {targetOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <p className="font-mono text-xs uppercase text-muted-foreground">
        {filtered.length} ENTR{filtered.length === 1 ? "Y" : "IES"}
      </p>

      {entries.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : (
        <KnowledgeList entries={filtered} />
      )}
    </div>
  );
}
