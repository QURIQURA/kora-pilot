import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { experimentsQuery, productsQuery } from "@/lib/queries";
import { EXPERIMENT_STATUSES, experimentLabel } from "@/lib/experiment";
import { versionLabel } from "@/lib/formula";
import { developmentOutcomeLabel } from "@/lib/development";
import { toLocalDateString } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { ExperimentCreateModal } from "@/components/pilot/ExperimentCreateForm";
import {
  PageHeader,
  StatusBadge,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/experiments/")({
  head: () => ({
    meta: [
      { title: "PILOT — R&D Dashboard" },
      { name: "description", content: "Development entries across all Components" },
      { property: "og:title", content: "PILOT — R&D Dashboard" },
      { property: "og:description", content: "Development entries across all Components" },
    ],
  }),
  component: ExperimentsPage,
});

type QuickFilter = "all" | "in_progress" | "today" | "failed" | "keep";

function ExperimentsPage() {
  const navigate = useNavigate();
  const experiments = useQuery(experimentsQuery());
  const products = useQuery(productsQuery());

  const [creating, setCreating] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [productFilter, setProductFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"recent" | "number">("recent");

  const all = experiments.data ?? [];
  const today = toLocalDateString();
  const counts = useMemo(
    () => ({
      inProgress: all.filter((e) => e.status === "PLANNED" || e.status === "RUNNING").length,
      today: all.filter((e) => e.date === today).length,
      failed: all.filter((e) => e.outcome === "FAILED").length,
      keep: all.filter((e) => e.outcome === "KEEP").length,
    }),
    [all, today],
  );

  const rows = useMemo(() => {
    let list = all;
    if (quickFilter === "in_progress")
      list = list.filter((e) => e.status === "PLANNED" || e.status === "RUNNING");
    else if (quickFilter === "today") list = list.filter((e) => e.date === today);
    else if (quickFilter === "failed") list = list.filter((e) => e.outcome === "FAILED");
    else if (quickFilter === "keep") list = list.filter((e) => e.outcome === "KEEP");
    if (productFilter)
      list = list.filter((e) => e.product_id === productFilter);
    if (statusFilter) list = list.filter((e) => e.status === statusFilter);
    // date는 "YYYY-MM-DD" 문자열 — 사전식 비교로 안전 (datetime.ts 규칙)
    if (from) list = list.filter((e) => e.date >= from);
    if (to) list = list.filter((e) => e.date <= to);
    if (sort === "number") {
      list = [...list].sort(
        (a, b) => (b.experiment_number ?? 0) - (a.experiment_number ?? 0)
      );
    }
    return list;
  }, [all, quickFilter, today, productFilter, statusFilter, from, to, sort]);

  const quickFilters: { key: QuickFilter; label: string; count: number }[] = [
    { key: "all", label: "ALL", count: all.length },
    { key: "in_progress", label: "IN PROGRESS", count: counts.inProgress },
    { key: "today", label: "TODAY", count: counts.today },
    { key: "keep", label: "RECENTLY KEEP", count: counts.keep },
    { key: "failed", label: "FAILED", count: counts.failed },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="R&D DASHBOARD"
        action={
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setCreating(true)}
          >
            + NEW DEVELOPMENT
          </button>
        }
      />

      <p className="font-mono text-[11px] uppercase text-muted-foreground">
        여기는 최종 저장 장소가 아닙니다 — Development는 항상 COMPONENT의 Current
        Formula/Development History에도 함께 남습니다.
      </p>

      {/* 요약 위젯 — 전체 데이터를 한 번에 쏟아내지 않고 카테고리별 개수만 먼저 보여준다 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {quickFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setQuickFilter(f.key)}
            className={`border px-3 py-3 text-left transition-colors ${
              quickFilter === f.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:bg-secondary"
            }`}
          >
            <span className="label-caps block text-[10px] opacity-80">{f.label}</span>
            <span className="font-mono text-lg tabular-nums">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${selectClass} w-auto`}
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
        >
          <option value="">ALL PRODUCTS</option>
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={`${selectClass} w-auto`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">ALL STATUSES</option>
          {EXPERIMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="FROM DATE"
          className={`${inputClass} w-auto`}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="font-mono text-xs text-muted-foreground">→</span>
        <input
          type="date"
          aria-label="TO DATE"
          className={`${inputClass} w-auto`}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <select
          className={`${selectClass} w-auto`}
          value={sort}
          onChange={(e) => setSort(e.target.value as "recent" | "number")}
        >
          <option value="recent">SORT: RECENT</option>
          <option value="number">SORT: NUMBER</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message="NO DEVELOPMENT ENTRIES YET"
          actionLabel="+ NEW DEVELOPMENT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                {["#", "PRODUCT", "COMPONENT", "FORMULA", "STATUS", "OUTCOME", "DATE"].map(
                  (header) => (
                    <th
                      key={header}
                      className="label-caps px-3 py-2 text-xs text-muted-foreground"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((exp) => (
                <tr
                  key={exp.id}
                  className="border-b border-border hover:bg-secondary"
                >
                  <td className="px-3 py-3">
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: exp.id }}
                      className="label-caps hover:underline"
                    >
                      {experimentLabel(exp.experiment_number)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {exp.products ? (
                      <Link
                        to="/products/$productId"
                        params={{ productId: exp.products.id }}
                        className="hover:underline"
                      >
                        {exp.products.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {exp.components ? (
                      <Link
                        to="/components/$componentId"
                        params={{ componentId: exp.components.id }}
                        className="hover:underline"
                      >
                        {exp.components.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {exp.formula_versions ? (
                      <Link
                        to="/formulas/$formulaId"
                        params={{ formulaId: exp.formula_versions.formula_id }}
                        className="hover:underline"
                      >
                        {exp.formula_versions.formulas?.name ?? "FORMULA"} ·{" "}
                        {versionLabel(exp.formula_versions.version_number)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={exp.status} />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {exp.outcome ? developmentOutcomeLabel(exp.outcome) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {exp.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ExperimentCreateModal
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void navigate({
              to: "/experiments/$experimentId",
              params: { experimentId: id },
            });
          }}
        />
      )}
    </div>
  );
}
