import { createFileRoute, Link } from "@tanstack/react-router";
import { widgets } from "@/widgets/registry";
import { PageHeader, buttonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "PILOT — Dashboard" },
      { name: "description", content: "PILOT dashboard for personal pastry R&D" },
      { property: "og:title", content: "PILOT — Dashboard" },
      {
        property: "og:description",
        content: "PILOT dashboard for personal pastry R&D",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="DASHBOARD"
        action={
          <Link to="/products" className={buttonClass}>
            GO TO PRODUCTS
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            className="border border-border bg-card p-4 md:p-5"
          >
            <h2 className="label-caps mb-4 text-muted-foreground">
              {widget.title}
            </h2>
            <widget.component />
          </div>
        ))}
      </div>
    </div>
  );
}
