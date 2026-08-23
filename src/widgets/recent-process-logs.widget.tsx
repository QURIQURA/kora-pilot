import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { recentProcessEventsQuery } from "../lib/queries";
import { experimentLabel } from "../lib/experiment";
import { eventDurationSeconds } from "../lib/process";
import { formatDuration, formatTime } from "../lib/datetime";
import type { WidgetDef } from "./types";

function RecentProcessLogsWidget() {
  const events = useQuery(recentProcessEventsQuery());
  const rows = events.data ?? [];

  if (events.isLoading) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        LOADING…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
        NO PROCESS LOGS YET
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((event) => {
        const duration = eventDurationSeconds(event);
        return (
          <li key={event.id}>
            <Link
              to="/experiments/$experimentId"
              params={{ experimentId: event.experiment_id }}
              className="flex flex-wrap items-center gap-2 px-1 py-1.5 hover:bg-secondary"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(event.started_at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm uppercase">
                {event.action}
              </span>
              {event.process_categories && (
                <span className="label-caps bg-foreground px-2 py-0.5 text-[11px] text-background">
                  {event.process_categories.name}
                </span>
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {duration === null
                  ? "LOG"
                  : event.ended_at
                    ? formatDuration(duration)
                    : `${formatDuration(duration)}…`}
              </span>
              <span className="label-caps text-muted-foreground">
                {experimentLabel(event.experiments?.experiment_number)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const recentProcessLogsWidget: WidgetDef = {
  id: "recent-process-logs",
  title: "RECENT PROCESS LOGS",
  size: "medium",
  component: RecentProcessLogsWidget,
};
