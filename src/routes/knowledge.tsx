import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "PILOT — Knowledge" },
      { name: "description", content: "Accumulated baking knowledge" },
      { property: "og:title", content: "PILOT — Knowledge" },
      { property: "og:description", content: "Accumulated baking knowledge" },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">KNOWLEDGE</h1>
      </div>
      <EmptyState
        message="NO KNOWLEDGE ENTRIES YET"
        actionLabel="+ ADD KNOWLEDGE"
      />
    </div>
  );
}
