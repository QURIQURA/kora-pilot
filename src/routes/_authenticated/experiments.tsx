import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/experiments")({
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
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">EXPERIMENTS</h1>
      </div>
      <EmptyState
        message="NO EXPERIMENTS YET"
        actionLabel="+ CREATE EXPERIMENT"
      />
    </div>
  );
}
