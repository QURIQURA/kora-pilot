import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentsQuery,
  currentUserId,
  formulaExperimentsQuery,
  formulasQuery,
  type FormulaListRow,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { FormulaExperimentsTab } from "@/components/pilot/FormulaExperimentsTab";
import { FormulaArchiveTab } from "@/components/pilot/FormulaArchiveTab";
import { FORMULA_STATUSES, versionLabel } from "@/lib/formula";
import { confirmBaseFormula } from "@/lib/technique-actions";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import { MethodSelect } from "@/components/pilot/MethodSelect";
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
export function headlineVersion(row: FormulaListRow, hiddenVersionIds?: Set<string>) {
  const versions = [...(row.formula_versions ?? [])]
    .filter((v) => !hiddenVersionIds?.has(v.id))
    .sort((a, b) => b.version_number - a.version_number);
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
  // 2026-11-06: 생산용 / R&D 실험 / 보관 탭 — 선택한 탭은 기억한다.
  type FormulaTab = "PRODUCTION" | "RND" | "ARCHIVE";
  const [tab, setTabState] = useState<FormulaTab>("PRODUCTION");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kora-pilot:formulas-tab");
      if (saved === "RND" || saved === "ARCHIVE") setTabState(saved);
    } catch {
      /* 저장소를 못 쓰면 기본 탭 */
    }
  }, []);
  const setTab = (next: FormulaTab) => {
    setTabState(next);
    try {
      localStorage.setItem("kora-pilot:formulas-tab", next);
    } catch {
      /* 무시 */
    }
  };
  const experiments = useQuery(formulaExperimentsQuery());
  const openExperiments = (experiments.data ?? []).filter((e) => e.status === "OPEN");
  // 진행 중인 실험 버전은 생산용 목록의 대표 버전으로 보이지 않게 한다.
  const hiddenVersionIds = new Set(
    openExperiments.map((e) => e.version_id).filter((id): id is string => Boolean(id)),
  );

  const rows = (formulas.data ?? []).filter((row) => {
    if (componentFilter && row.component_id !== componentFilter) return false;
    // 생산용: 보관/이전 버전뿐인 포뮬라는 보관 탭으로 간다
    const live = (row.formula_versions ?? []).filter(
      (v) => !["ARCHIVED", "SUPERSEDED"].includes(v.status) && !hiddenVersionIds.has(v.id),
    );
    if (live.length === 0 && (row.formula_versions ?? []).length > 0) return false;
    if (statusFilter) {
      const head = headlineVersion(row, hiddenVersionIds);
      if ((head?.status ?? "DRAFT") !== statusFilter) return false;
    }
    return true;
  });

  const create = useMutation({
    mutationFn: async ({
      name,
      componentId,
      techniqueId,
      methodId,
      isBase,
    }: {
      name: string;
      componentId: string;
      techniqueId: string;
      methodId: string;
      isBase: boolean;
    }) => {
      if (!componentId) {
        throw new Error("COMPONENT IS REQUIRED");
      }
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
          component_id: componentId,
          technique_category_id: techniqueId || null,
          method_id: methodId || null,
          is_base_formula: base,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: versionError } = await supabase.from("formula_versions").insert({
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
    <div className="space-y-3">
      <PageHeader
        title="FORMULAS"
        action={
          <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
            + NEW FORMULA
          </button>
        }
      />

      <div role="tablist" className="flex border-b border-border">
        {(
          [
            ["PRODUCTION", "생산용", rows.length],
            ["RND", "R&D 실험", openExperiments.length],
            ["ARCHIVE", "보관", null],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "label-caps -mb-px min-h-[30px] border-b-2 px-3 text-xs transition-colors",
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label} {count != null && <span className="font-mono text-[10px]">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "RND" && <FormulaExperimentsTab formulas={formulas.data ?? []} />}
      {tab === "ARCHIVE" && <FormulaArchiveTab />}

      {tab === "PRODUCTION" && (
        <div className="grid grid-cols-1 gap-3 border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-3">
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
      )}

      {tab === "PRODUCTION" &&
        (rows.length === 0 ? (
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
            <div className="hidden grid-cols-12 gap-2 border-b border-border px-3 py-2 md:grid">
              <span className="label-caps col-span-4 text-xs text-muted-foreground">NAME</span>
              <span className="label-caps col-span-3 text-xs text-muted-foreground">COMPONENT</span>
              <span className="label-caps col-span-1 text-xs text-muted-foreground">VERSION</span>
              <span className="label-caps col-span-2 text-xs text-muted-foreground">STATUS</span>
              <span className="label-caps col-span-2 text-xs text-muted-foreground">UPDATED</span>
            </div>
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const head = headlineVersion(row, hiddenVersionIds);
                return (
                  <li key={row.id}>
                    <Link
                      to="/formulas/$formulaId"
                      params={{ formulaId: row.id }}
                      className="grid grid-cols-1 gap-1 px-3 py-2 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2"
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
        ))}

      {creating && (
        <NewFormulaModal
          components={(components.data ?? []).map((c) => ({
            id: c.id,
            name: c.name,
          }))}
          pending={create.isPending}
          onCancel={() => setCreating(false)}
          onCreate={(name, componentId, techniqueId, methodId, isBase) =>
            create.mutate({ name, componentId, techniqueId, methodId, isBase })
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
    methodId: string,
    isBase: boolean,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [componentId, setComponentId] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [isBase, setIsBase] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-3">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="label-caps">NEW FORMULA</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && componentId)
              onCreate(name.trim(), componentId, techniqueId, methodId, isBase);
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
          <Field label="COMPONENT">
            <select
              className={selectClass}
              value={componentId}
              required
              onChange={(e) => setComponentId(e.target.value)}
            >
              <option value="" disabled>
                SELECT A COMPONENT
              </option>
              {components.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.name}
                </option>
              ))}
            </select>
            {components.length === 0 && (
              <p className="mt-1 font-mono text-[10px] uppercase text-destructive">
                NO COMPONENTS YET — CREATE A COMPONENT FIRST
              </p>
            )}
          </Field>
          <Field label="기법 분류 TECHNIQUE (OPTIONAL)">
            <TechniqueSelect
              value={techniqueId}
              onChange={(id) => {
                setTechniqueId(id);
                setMethodId(""); // 기법이 바뀌면 이전에 고른 METHOD는 더 이상 맞지 않을 수 있음 — 초기화
              }}
            />
          </Field>
          <Field label="METHOD (OPTIONAL)">
            <MethodSelect
              techniqueCategoryId={techniqueId}
              value={methodId}
              onChange={setMethodId}
            />
          </Field>
          <label className="flex min-h-[32px] items-center gap-2">
            <input
              type="checkbox"
              className="h-5 w-5 border border-input"
              checked={isBase}
              disabled={!techniqueId}
              onChange={(e) => setIsBase(e.target.checked)}
            />
            <span className="label-caps text-xs">이 배합을 기준(Base Formula)으로 지정</span>
          </label>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            V1 DRAFT WILL BE CREATED
          </p>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={pending || !componentId}>
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
