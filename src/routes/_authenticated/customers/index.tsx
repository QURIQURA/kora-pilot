import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { customersQuery } from "@/lib/queries";
import { EmptyState } from "@/components/EmptyState";
import { CustomerCreateForm } from "@/components/pilot/CustomerCreateForm";
import { PageHeader, primaryButtonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [{ title: "PILOT — Customers" }, { name: "description", content: "SHCS customers" }],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const customers = useQuery(customersQuery());
  const [creating, setCreating] = useState(false);

  const rows = customers.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="CUSTOMERS"
        action={
          <button type="button" className={primaryButtonClass} onClick={() => setCreating((v) => !v)}>
            {creating ? "CLOSE" : "+ NEW CUSTOMER"}
          </button>
        }
      />

      {creating && (
        <div className="border border-border bg-card p-4">
          <CustomerCreateForm onCancel={() => setCreating(false)} onCreated={() => setCreating(false)} />
        </div>
      )}

      {customers.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          message="NO CUSTOMERS YET"
          actionLabel="+ NEW CUSTOMER"
          onAction={() => setCreating(true)}
        />
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to="/customers/$customerId"
                params={{ customerId: c.id }}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 hover:bg-secondary"
              >
                <span className="text-sm">{c.name || "(이름 없음)"}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {[c.instagram_handle, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
