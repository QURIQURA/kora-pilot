import type { WidgetDef } from "./types";

function RecentExperimentsWidget() {
  return (
    <div>
      <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
        NO ACTIVE EXPERIMENTS
      </p>
    </div>
  );
}

export const recentExperimentsWidget: WidgetDef = {
  id: "recent-experiments",
  title: "RECENT EXPERIMENTS",
  size: "medium",
  component: RecentExperimentsWidget,
};
