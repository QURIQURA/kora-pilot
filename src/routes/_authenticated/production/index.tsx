import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, productsQuery, workSessionsQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import {
  Field,
  PageHeader,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/production/")({
  head: () => ({
    meta: [
      { title: "PILOT — Production" },
      { name: "description", content: "Production / Weighing work sessions" },
      { property: "og:title", content: "PILOT — Production" },
      { property: "og:description", content: "Production / Weighing work sessions" },
    ],
  }),
  component: ProductionDashboardPage,
});

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN PROGRESS",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

function ProductionDashboardPage() {
  const sessions = useQuery(workSessionsQuery());
  const [creating, setCreating] = useState(false);

  const rows = sessions.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="PRODUCTION / WEIGHING"
        action={
          <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
            + CREATE WORK SESSION
          </button>
        }
      />

      {creating && <WorkSessionCreateForm onDone={() => setCreating(false)} />}

      {sessions.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          message="NO WORK SESSIONS YET"
          actionLabel="+ CREATE WORK SESSION"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="border border-border bg-card">
          <ul>
            {rows.map((session) => (
              <li key={session.id} className="border-b border-border last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 hover:bg-secondary">
                  <Link
                    to="/production/$sessionId"
                    params={{ sessionId: session.id }}
                    className="flex-1 space-y-1"
                  >
                    <p className="text-sm">{session.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      CREATED {formatDateTime(session.created_at)}
                    </p>
                  </Link>
                  <span className="label-caps border border-foreground px-2 py-0.5 text-[11px]">
                    {STATUS_LABEL[session.status] ?? session.status}
                  </span>
                  <WorkSessionDeleteButton sessionId={session.id} sessionName={session.name} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 작업 세션 삭제(2026-09-23) — work_session_formula_versions/progress/multiplier_history/tasks는
 * DB FK가 ON DELETE CASCADE라 함께 삭제된다.
 */
function WorkSessionDeleteButton({
  sessionId,
  sessionName,
}: {
  sessionId: string;
  sessionName: string;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("work_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    },
  });

  return (
    <button
      type="button"
      className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
      disabled={remove.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          confirm(
            `"${sessionName}" 작업 세션을 삭제할까요? 계량 진행 상태/배수 히스토리도 함께 삭제되며 되돌릴 수 없습니다.`,
          )
        )
          remove.mutate();
      }}
    >
      DELETE
    </button>
  );
}

function WorkSessionCreateForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const products = useQuery(productsQuery());
  const [name, setName] = useState("");
  // PRODUCTION EFFICIENCY(2026-10-06) — 생성 시점에 바로 Product/Batch를 연결할 수 있게
  // 옵션으로 열어둔다. 비워두면 지금까지와 동일한 순수 R&D/계량 세션이 된다.
  const [productId, setProductId] = useState("");
  const [batchSize, setBatchSize] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("work_sessions")
        .insert({
          user_id,
          name: name.trim(),
          status: "PLANNED",
          product_id: productId || null,
          target_unit_count: productId && batchSize.trim() ? Number(batchSize) : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
      setName("");
      setProductId("");
      setBatchSize("");
      onDone();
    },
  });

  return (
    <form
      className="space-y-4 border border-dashed border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          required
          placeholder="2026-09-02 Afternoon Production"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="PRODUCT (EFFICIENCY, 선택)">
          <select
            className={selectClass + " !w-56"}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">— 연결 안 함 —</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        {productId && (
          <Field label="BATCH SIZE(개)">
            <input
              type="number"
              className={inputClass + " !w-24"}
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
            />
          </Field>
        )}
      </div>
      {create.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(create.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          CREATE
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
