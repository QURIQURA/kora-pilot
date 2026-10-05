import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { customerOrdersQuery, customerQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/datetime";
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({
    meta: [{ title: "PILOT — Customer" }, { name: "description", content: "Customer detail" }],
  }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const customer = useQuery(customerQuery(customerId));
  const orders = useQuery(customerOrdersQuery(customerId));

  const [name, setName] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  // 수정사항 저장 여부를 시각적으로 보여주기 위한 "저장된 상태" 스냅샷(2026-10-06, 사용자
  // 요청 — FORMULA 페이지의 isDirty 패턴과 동일) — SAVE 누르면 다시 수정 전까지 비활성화.
  const [savedSnapshot, setSavedSnapshot] = useState("");

  const hydrateFromCustomer = (c: { name: string | null; instagram_handle: string | null; phone: string | null; email: string | null; notes: string | null }) => {
    setName(c.name ?? "");
    setInstagramHandle(c.instagram_handle ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setNotes(c.notes ?? "");
  };

  useEffect(() => {
    if (!customer.data) return;
    hydrateFromCustomer(customer.data);
    setSavedSnapshot(
      JSON.stringify({
        name: customer.data.name ?? "",
        instagramHandle: customer.data.instagram_handle ?? "",
        phone: customer.data.phone ?? "",
        email: customer.data.email ?? "",
        notes: customer.data.notes ?? "",
      }),
    );
  }, [customer.data]);

  const currentSnapshot = JSON.stringify({ name, instagramHandle, phone, email, notes });
  const isDirty = Boolean(customer.data) && currentSnapshot !== savedSnapshot;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .update({
          name: name.trim() || null,
          instagram_handle: instagramHandle.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["customers", customerId] });
    },
  });

  const handleSave = () => {
    const snapshotAtSave = currentSnapshot;
    save.mutate(undefined, { onSuccess: () => setSavedSnapshot(snapshotAtSave) });
  };

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").delete().eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      void navigate({ to: "/customers" });
    },
  });

  if (!customer.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {customer.isLoading ? "LOADING…" : "CUSTOMER NOT FOUND"}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <Link to="/customers" className="label-caps text-xs text-muted-foreground hover:text-foreground">
          ← CUSTOMERS
        </Link>
        <h1 className="label-caps text-lg text-foreground">{name || "(이름 없음)"}</h1>
      </div>

      <SectionCard title="CUSTOMER INFO">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="NAME">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="INSTAGRAM">
            <input className={inputClass} value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} />
          </Field>
          <Field label="PHONE">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="EMAIL">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="NOTES">
            <textarea rows={3} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {save.isError && (
          <p className="mt-2 font-mono text-xs uppercase text-destructive">{(save.error as Error).message}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!isDirty || save.isPending}
            onClick={handleSave}
          >
            {save.isPending ? "SAVING…" : "SAVE"}
          </button>
          {isDirty && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => customer.data && hydrateFromCustomer(customer.data)}
            >
              되돌리기
            </button>
          )}
          <span className="label-caps text-[10px] text-muted-foreground">
            {save.isPending ? "저장 중…" : isDirty ? "변경 사항이 있습니다 — 저장하려면 SAVE" : "✓ SAVED"}
          </span>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              if (confirm("DELETE THIS CUSTOMER?")) remove.mutate();
            }}
          >
            DELETE CUSTOMER
          </button>
        </div>
      </SectionCard>

      <SectionCard title="ORDER HISTORY">
        {(orders.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO ORDERS YET</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(orders.data ?? []).map((o) => (
              <li key={o.id}>
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 hover:bg-secondary"
                >
                  <span className="font-mono text-sm">{o.order_number}</span>
                  <span className="text-sm text-muted-foreground">{o.occasion || "—"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatDateTime(o.created_at)}</span>
                  <span className="label-caps text-xs text-muted-foreground">{o.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
