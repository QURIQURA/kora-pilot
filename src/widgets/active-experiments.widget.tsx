import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { activeExperimentsQuery } from "../lib/queries";
import { experimentLabel } from "../lib/experiment";
import { versionLabel } from "../lib/formula";
import { StatusBadge } from "../components/pilot/ui";
import type { WidgetDef } from "./types";

function ActiveExperimentsWidget() {
  const experiments = useQuery(activeExperimentsQuery());
  const rows = experiments.data ?? [];

  if (experiments.isLoading) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        LOADING…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        NO ACTIVE EXPERIMENTS
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((exp) => (
        <li key={exp.id}>
          <Link
            to="/experiments/$experimentId"
            params={{ experimentId: exp.id }}
            className="flex flex-wrap items-center gap-2 px-1 py-1.5 hover:bg-secondary"
          >
            <span className="label-caps">
              {experimentLabel(exp.experiment_number)}
            </span>
            <StatusBadge status={exp.status} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase text-muted-foreground">
              {exp.products?.name ??
                (exp.formula_versions
                  ? `${exp.formula_versions.formulas?.name ?? "FORMULA"} · ${versionLabel(exp.formula_versions.version_number)}`
                  : "—")}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {exp.date}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const activeExperimentsWidget: WidgetDef = {
  id: "active-experiments",
  title: "ACTIVE EXPERIMENTS",
  size: "medium",
  component: ActiveExperimentsWidget,
};
