import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { customersQuery, customerOrderCountsQuery, type Customer } from "@/lib/queries";
import { EmptyState } from "@/components/EmptyState";
import { CustomerCreateForm } from "@/components/pilot/CustomerCreateForm";
import { PageHeader, primaryButtonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [{ title: "PILOT — Customers" }, { name: "description", content: "SHCS customers" }],
  }),
  component: CustomersPage,
});

// 2026-10-06 사용자 요청: 등급(단골/일반고객)은 저장하지 않고 주문 2회 이상이면 항상 단골로 계산.
const REGULAR_MIN_ORDERS = 2;

function CustomersPage() {
  const customers = useQuery(customersQuery());
  const orderCounts = useQuery(customerOrderCountsQuery());
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("customers").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const rows = customers.data ?? [];
  const counts = orderCounts.data ?? {};

  // 핀고정 = 단골(주문 2회 이상) 고객에게만 허용되는 정렬용 고정(2026-10-06 사용자 확인).
  // 단골 섹션: 핀고정 먼저, 그다음 주문 많은 순, 그다음 이름. 일반고객 섹션: 이름순(기존 정렬 유지).
  const { regulars, generals } = useMemo(() => {
    const withCount = rows.map((c) => ({ customer: c, orderCount: counts[c.id] ?? 0 }));
    const regulars = withCount
      .filter((r) => r.orderCount >= REGULAR_MIN_ORDERS)
      .sort((a, b) => {
        if (a.customer.pinned !== b.customer.pinned) return a.customer.pinned ? -1 : 1;
        if (a.orderCount !== b.orderCount) return b.orderCount - a.orderCount;
        return (a.customer.name ?? "").localeCompare(b.customer.name ?? "");
      });
    const generals = withCount.filter((r) => r.orderCount < REGULAR_MIN_ORDERS);
    return { regulars, generals };
  }, [rows, counts]);

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
        <div className="space-y-6">
          <CustomerSection
            title="단골 REGULAR"
            count={regulars.length}
            entries={regulars}
            showPin
            onTogglePin={(id, pinned) => togglePin.mutate({ id, pinned })}
          />
          <CustomerSection title="일반고객 GENERAL" count={generals.length} entries={generals} showPin={false} />
        </div>
      )}
    </div>
  );
}

function CustomerSection({
  title,
  count,
  entries,
  showPin,
  onTogglePin,
}: {
  title: string;
  count: number;
  entries: { customer: Customer; orderCount: number }[];
  showPin: boolean;
  onTogglePin?: (id: string, pinned: boolean) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="label-caps text-xs text-muted-foreground">
        {title} ({count})
      </h2>
      {entries.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">—</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(({ customer: c, orderCount }) => (
            <Link
              key={c.id}
              to="/customers/$customerId"
              params={{ customerId: c.id }}
              className="relative block border border-border bg-card p-3 hover:bg-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{c.name || "(이름 없음)"}</span>
                {showPin && onTogglePin && (
                  <button
                    type="button"
                    aria-label={c.pinned ? "핀고정 해제" : "핀고정"}
                    className={`label-caps shrink-0 border px-1.5 py-0.5 text-[11px] ${
                      c.pinned
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTogglePin(c.id, !c.pinned);
                    }}
                  >
                    📌
                  </button>
                )}
              </div>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {[c.instagram_handle, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">주문 {orderCount}회</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
