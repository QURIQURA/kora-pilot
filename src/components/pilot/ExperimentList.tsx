import { Link } from "@tanstack/react-router";
import { experimentLabel } from "@/lib/experiment";
import { developmentOutcomeLabel, type DevelopmentOutcome } from "@/lib/development";
import { StatusBadge } from "./ui";

export interface ExperimentListItem {
  id: string;
  experiment_number: number | null;
  status: string;
  date: string;
  hypothesis: string | null;
  /** R&D 판정 — Save Development가 기록한다. 없으면 아직 판정 전(진행 중/과거 데이터). */
  outcome?: DevelopmentOutcome | string | null;
}

/** Development Entry(=Experiment) 목록(공용) — 번호/상태/판정/가설/날짜, 클릭 시 상세로 이동 */
export function ExperimentListItems({
  items,
  emptyLabel = "NO DEVELOPMENT ENTRIES YET",
}: {
  items: ExperimentListItem[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">{emptyLabel}</p>
    );
  }
  return (
    <ul className="divide-y divide-border border border-border">
      {items.map((exp) => (
        <li key={exp.id}>
          <Link
            to="/experiments/$experimentId"
            params={{ experimentId: exp.id }}
            className="flex flex-wrap items-center gap-2 px-3 py-3 hover:bg-secondary"
          >
            <span className="label-caps min-w-[3.5rem]">
              {experimentLabel(exp.experiment_number)}
            </span>
            <StatusBadge status={exp.status} />
            {exp.outcome && (
              <span className="label-caps border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {developmentOutcomeLabel(exp.outcome)}
              </span>
            )}
            <span className="min-w-[8rem] flex-1 truncate text-sm">
              {exp.hypothesis || "—"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {exp.date}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
