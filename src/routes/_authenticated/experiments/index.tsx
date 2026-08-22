import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { experimentsQuery, productsQuery } from "@/lib/queries";
import { EXPERIMENT_STATUSES, experimentLabel } from "@/lib/experiment";
import { versionLabel } from "@/lib/formula";
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
      { title: "PILOT — Experiments" },
      { name: "description", content: "Experiment log" },
      { property: "og:title", content: "PILOT — Experiments" },
      { property: "og:description", content: "Experiment log" },
    ],
  }),
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const navigate = useNavigate();
  const experiments = useQuery(experimentsQuery());
  const products = useQuery(productsQuery());

  const [creating, setCreating] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"recent" | "number">("recent");

  const rows = useMemo(() => {
    let list = experiments.data ?? [];
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
  }, [experiments.data, productFilter, statusFilter, from, to, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="EXPERIMENTS"
        action={
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setCreating(true)}
          >
            + NEW EXPERIMENT
          </button>
        }
      />

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
          message="NO EXPERIMENTS YET"
          actionLabel="+ CREATE EXPERIMENT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[780px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                {["#", "PRODUCT", "COMPONENT", "FORMULA", "STATUS", "DATE"].map(
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
