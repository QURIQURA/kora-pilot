import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentsQuery,
  currentUserId,
  formulasQuery,
  type FormulaListRow,
} from "@/lib/queries";
import { FORMULA_STATUSES, versionLabel } from "@/lib/formula";
import { confirmBaseFormula } from "@/lib/technique-actions";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import {
  Field,
  PageHeader,
  StatusBadge,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/formulas/")({
  head: () => ({
    meta: [
      { title: "PILOT — Formulas" },
      { name: "description", content: "Formula library with versioned ratios" },
      { property: "og:title", content: "PILOT — Formulas" },
      {
        property: "og:description",
        content: "Formula library with versioned ratios",
      },
    ],
  }),
  component: FormulasPage,
});

/** 해당 formula에서 대표로 보여줄 버전 (CURRENT > 최신) */
export function headlineVersion(row: FormulaListRow) {
  const versions = [...(row.formula_versions ?? [])].sort(
    (a, b) => b.version_number - a.version_number
  );
  return versions.find((v) => v.status === "CURRENT") ?? versions[0] ?? null;
}

function FormulasPage() {
  const formulas = useQuery(formulasQuery());
  const components = useQuery(componentsQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [componentFilter, setComponentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const rows = (formulas.data ?? []).filter((row) => {
    if (componentFilter && row.component_id !== componentFilter) return false;
    if (statusFilter) {
      const head = headlineVersion(row);
      if ((head?.status ?? "DRAFT") !== statusFilter) return false;
    }
    return true;
  });

  const create = useMutation({
    mutationFn: async ({
      name,
      componentId,
      techniqueId,
      isBase,
    }: {
      name: string;
      componentId: string;
      techniqueId: string;
      isBase: boolean;
    }) => {
      const user_id = await currentUserId();
      const base = await confirmBaseFormula({
        techniqueId: techniqueId || null,
        isBase,
      });
      const { data, error } = await supabase
        .from("formulas")
        .insert({
          user_id,
          name,
          component_id: componentId || null,
          technique_category_id: techniqueId || null,
          is_base_formula: base,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: versionError } = await supabase
        .from("formula_versions")
        .insert({
          user_id,
          formula_id: data.id,
          version_number: 1,
          status: "DRAFT",
        });
      if (versionError) throw versionError;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      await queryClient.invalidateQueries({ queryKey: ["formulas_by_technique"] });
      setCreating(false);
      void navigate({ to: "/formulas/$formulaId", params: { formulaId: id } });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="FORMULAS"
        action={
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setCreating(true)}
          >
            + NEW FORMULA
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="COMPONENT">
          <select
            className={selectClass}
            value={componentFilter}
            onChange={(e) => setComponentFilter(e.target.value)}
          >
            <option value="">ALL COMPONENTS</option>
            {(components.data ?? []).map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="STATUS">
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">ALL STATUSES</option>
            {FORMULA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message={
            (formulas.data ?? []).length === 0
              ? "NO FORMULAS YET"
              : "NO FORMULAS MATCH THESE FILTERS"
          }
          actionLabel="+ NEW FORMULA"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="border border-border bg-card">
          <div className="hidden grid-cols-12 gap-2 border-b border-border px-4 py-2 md:grid">
            <span className="label-caps col-span-4 text-xs text-muted-foreground">
              NAME
            </span>
            <span className="label-caps col-span-3 text-xs text-muted-foreground">
              COMPONENT
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              VERSION
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              STATUS
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              UPDATED
            </span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const head = headlineVersion(row);
              return (
                <li key={row.id}>
                  <Link
                    to="/formulas/$formulaId"
                    params={{ formulaId: row.id }}
                    className="grid grid-cols-1 gap-1 px-4 py-3 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2"
                  >
                    <span className="col-span-4 text-sm">{row.name}</span>
                    <span className="col-span-3 font-mono text-xs uppercase text-muted-foreground">
                      {row.components?.name ?? "—"}
                    </span>
                    <span className="col-span-1 font-mono text-xs">
                      {head ? versionLabel(head.version_number) : "—"}
                    </span>
                    <span className="col-span-2">
                      <StatusBadge status={head?.status ?? "DRAFT"} />
                    </span>
                    <span className="col-span-2 font-mono text-xs text-muted-foreground">
                      {formatDateTime(row.updated_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {creating && (
        <NewFormulaModal
          components={(components.data ?? []).map((c) => ({
            id: c.id,
            name: c.name,
          }))}
          pending={create.isPending}
          onCancel={() => setCreating(false)}
          onCreate={(name, componentId, techniqueId, isBase) =>
            create.mutate({ name, componentId, techniqueId, isBase })
          }
        />
      )}
    </div>
  );
}

function NewFormulaModal({
  components,
  pending,
  onCancel,
  onCreate,
}: {
  components: { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onCreate: (
    name: string,
    componentId: string,
    techniqueId: string,
    isBase: boolean
  ) => void;
}) {
  const [name, setName] = useState("");
  const [componentId, setComponentId] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [isBase, setIsBase] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW FORMULA</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim())
              onCreate(name.trim(), componentId, techniqueId, isBase);
          }}
        >
          <Field label="NAME">
            <input
              className={inputClass}
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="COMPONENT (OPTIONAL)">
            <select
              className={selectClass}
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
            >
              <option value="">NO COMPONENT</option>
              {components.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="기법 분류 TECHNIQUE (OPTIONAL)">
            <TechniqueSelect value={techniqueId} onChange={setTechniqueId} />
          </Field>
          <label className="flex min-h-[44px] items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 border border-input"
              checked={isBase}
              disabled={!techniqueId}
              onChange={(e) => setIsBase(e.target.checked)}
            />
            <span className="label-caps text-xs">
              이 배합을 기준(Base Formula)으로 지정
            </span>
          </label>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            V1 DRAFT WILL BE CREATED
          </p>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              CREATE
            </button>
            <button type="button" className={buttonClass} onClick={onCancel}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
