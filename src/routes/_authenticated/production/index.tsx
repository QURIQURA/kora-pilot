import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, workSessionsQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import {
  Field,
  PageHeader,
  buttonClass,
  inputClass,
  primaryButtonClass,
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
    <div className="space-y-6">
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
                <Link
                  to="/production/$sessionId"
                  params={{ sessionId: session.id }}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 hover:bg-secondary"
                >
                  <div className="space-y-1">
                    <p className="text-sm">{session.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      CREATED {formatDateTime(session.created_at)}
                    </p>
                  </div>
                  <span className="label-caps border border-foreground px-2 py-0.5 text-[11px]">
                    {STATUS_LABEL[session.status] ?? session.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WorkSessionCreateForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("work_sessions")
        .insert({ user_id, name: name.trim(), status: "PLANNED" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
      setName("");
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
