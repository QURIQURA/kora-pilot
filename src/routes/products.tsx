import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "PILOT — Products" },
      { name: "description", content: "Products in development" },
      { property: "og:title", content: "PILOT — Products" },
      { property: "og:description", content: "Products in development" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">PRODUCTS</h1>
      </div>
      <EmptyState
        message="NO PRODUCTS YET"
        actionLabel="+ CREATE PRODUCT"
      />
    </div>
  );
}
