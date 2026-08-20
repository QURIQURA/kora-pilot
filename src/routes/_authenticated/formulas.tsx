import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/formulas")({
  head: () => ({
    meta: [
      { title: "PILOT — Formulas" },
      { name: "description", content: "Formula library" },
      { property: "og:title", content: "PILOT — Formulas" },
      { property: "og:description", content: "Formula library" },
    ],
  }),
  component: FormulasPage,
});

function FormulasPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">FORMULAS</h1>
      </div>
      <EmptyState
        message="NO FORMULAS YET"
        actionLabel="+ CREATE FORMULA"
      />
    </div>
  );
}
