import { Link } from "@tanstack/react-router";
import { experimentLabel } from "@/lib/experiment";
import { StatusBadge } from "./ui";

export interface ExperimentListItem {
  id: string;
  experiment_number: number | null;
  status: string;
  date: string;
  hypothesis: string | null;
}

/** 실험 목록(공용) — 번호/상태/가설/날짜, 클릭 시 상세로 이동 */
export function ExperimentListItems({ items }: { items: ExperimentListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        NO EXPERIMENTS YET
      </p>
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
