import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { recentObservationsQuery } from "../lib/queries";
import { experimentLabel } from "../lib/experiment";
import { formatTime } from "../lib/datetime";
import type { WidgetDef } from "./types";

function RecentObservationsWidget() {
  const observations = useQuery(recentObservationsQuery());
  const rows = observations.data ?? [];

  if (observations.isLoading) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        LOADING…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        NO OBSERVATIONS YET
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((obs) => (
        <li key={obs.id}>
          <Link
            to="/experiments/$experimentId"
            params={{ experimentId: obs.experiment_id }}
            className="flex flex-wrap items-center gap-2 px-1 py-1.5 hover:bg-secondary"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {formatTime(obs.created_at)}
            </span>
            <span className="label-caps bg-foreground px-2 py-0.5 text-[11px] text-background">
              {(obs.label || "NOTE").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{obs.value}</span>
            <span className="label-caps text-muted-foreground">
              {experimentLabel(obs.experiments?.experiment_number)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export const recentObservationsWidget: WidgetDef = {
  id: "recent-observations",
  title: "RECENT OBSERVATIONS",
  size: "medium",
  component: RecentObservationsWidget,
};
