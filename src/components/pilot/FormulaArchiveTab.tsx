import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { archivedVersionsQuery, formulaExperimentsQuery } from "@/lib/queries";
import { versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge, buttonClass } from "@/components/pilot/ui";

/** 보관 탭 — 이전 버전(SUPERSEDED), 옛 초안·실험 기록·폐기(ARCHIVED). ARCHIVED는 DRAFT로 되살릴 수 있다. */
export function FormulaArchiveTab() {
  const queryClient = useQueryClient();
  const versions = useQuery(archivedVersionsQuery());
  const experiments = useQuery(formulaExperimentsQuery());
  const experimentByVersion = new Map(
    (experiments.data ?? []).filter((e) => e.version_id).map((e) => [e.version_id as string, e]),
  );

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formula_versions")
        .update({ status: "DRAFT" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formula_versions"] });
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
    },
  });

  const rows = versions.data ?? [];
  if (rows.length === 0) return <EmptyState message="보관된 버전이 없어요" />;

  return (
    <div className="border border-border bg-card">
      {restore.isError && (
        <p role="alert" className="border-b border-border px-4 py-2 text-xs text-destructive">
          {restore.error.message}
        </p>
      )}
      <ul className="divide-y divide-border">
        {rows.map((v) => {
          const exp = experimentByVersion.get(v.id);
          const kind =
            exp?.status === "KEPT"
              ? "실험 기록"
              : exp?.status === "DISCARDED"
                ? "폐기한 실험"
                : v.status === "SUPERSEDED"
                  ? "이전 버전"
                  : "보관";
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <Link
                to="/formulas/$formulaId"
                params={{ formulaId: v.formula_id }}
                search={{ version: v.id }}
                className="min-w-0 flex-1 hover:underline"
              >
                <span className="text-sm">{v.formulas?.name ?? "—"}</span>{" "}
                <span className="font-mono text-xs">{versionLabel(v.version_number)}</span>
                {(exp?.title || v.change_summary) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {exp?.title ?? v.change_summary}
                    {exp?.result_height_mm != null &&
                      ` · 구운 높이 ${Number(exp.result_height_mm) / 10}cm`}
                  </span>
                )}
              </Link>
              <span className="font-mono text-xs uppercase text-muted-foreground">
                {v.formulas?.components?.name ?? ""}
              </span>
              <span className="label-caps text-[10px] text-muted-foreground">{kind}</span>
              <StatusBadge status={v.status} />
              <span className="font-mono text-xs text-muted-foreground">
                {formatDateTime(v.updated_at)}
              </span>
              {v.status === "ARCHIVED" && (
                <button
                  type="button"
                  className={buttonClass}
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(v.id)}
                >
                  되살리기
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
