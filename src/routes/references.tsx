import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/references")({
  head: () => ({
    meta: [
      { title: "PILOT — References" },
      { name: "description", content: "External references" },
      { property: "og:title", content: "PILOT — References" },
      { property: "og:description", content: "External references" },
    ],
  }),
  component: ReferencesPage,
});

function ReferencesPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">REFERENCES</h1>
      </div>
      <EmptyState
        message="NO REFERENCES YET"
        actionLabel="+ ADD REFERENCE"
      />
    </div>
  );
}
