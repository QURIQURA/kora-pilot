import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/ingredients")({
  head: () => ({
    meta: [
      { title: "PILOT — Ingredients" },
      { name: "description", content: "Ingredient master data" },
      { property: "og:title", content: "PILOT — Ingredients" },
      { property: "og:description", content: "Ingredient master data" },
    ],
  }),
  component: IngredientsPage,
});

function IngredientsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">INGREDIENTS</h1>
      </div>
      <EmptyState
        message="NO INGREDIENTS YET"
        actionLabel="+ ADD INGREDIENT"
      />
    </div>
  );
}
