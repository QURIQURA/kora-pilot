import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { componentObservationsQuery, type ComponentObservationRow } from "@/lib/queries";
import { toLocalDateString } from "@/lib/datetime";
import { versionLabel } from "@/lib/formula";
import { SectionCard } from "./ui";

/**
 * COMPONENT DETAIL — OBSERVATION (2026-09-30).
 * RND(실험/observations 테이블)를 폐기하면서, "지난 생산은 어땠는지" 비교는 PRODUCTION
 * TASK LIST에서 기록하는 관찰값(work_session_tasks.observation_*)으로 대체한다. 이 COMPONENT의
 * FORMULA로 진행된 모든 PRODUCTION 세션의 관찰 기록을 날짜순으로 모아, 어느 FORMULA VERSION으로
 * 만들었는지도 함께 보여준다 — "지난주 생산은 버전 3이었고 높이가 낮았네" 같은 비교가 가능하도록.
 */
function hasAnyObservationValue(row: ComponentObservationRow): boolean {
  return (
    Boolean(row.observation_status) ||
    row.observation_height_start_mm != null ||
    row.observation_height_mid_mm != null ||
    row.observation_height_end_mm != null ||
    row.observation_temperature_c != null
  );
}

export function ComponentObservationsSection({ componentId }: { componentId: string }) {
  const observations = useQuery(componentObservationsQuery(componentId));
  const rows = (observations.data ?? []).filter(hasAnyObservationValue);

  return (
    <SectionCard title="OBSERVATION — PRODUCTION 관찰 기록">
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          아직 기록된 관찰값이 없습니다 — PRODUCTION TASK LIST에서 관찰값을 입력하면 여기 모입니다.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((row) => {
            const dateSource = row.actual_started_at ?? row.completed_at ?? row.created_at;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="w-24 font-mono text-xs text-muted-foreground">
                  {toLocalDateString(new Date(dateSource))}
                </span>
                {row.formula_versions && (
                  <span className="label-caps border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {versionLabel(row.formula_versions.version_number)}
                  </span>
                )}
                {row.task_type && (
                  <span className="label-caps border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {row.task_type.toUpperCase()}
                  </span>
                )}
                <span className="label-caps text-[10px] text-muted-foreground">{row.task_name}</span>
                <span className="min-w-[10rem] flex-1 text-sm">
                  {row.observation_status ? `${row.observation_status} · ` : ""}
                  {row.observation_height_start_mm ?? "-"}mm → {row.observation_height_mid_mm ?? "-"}mm →{" "}
                  {row.observation_height_end_mm ?? "-"}mm
                  {row.observation_temperature_c != null ? ` · ${row.observation_temperature_c}°C` : ""}
                </span>
                {row.work_sessions && (
                  <Link
                    to="/production/$sessionId"
                    params={{ sessionId: row.work_sessions.id }}
                    className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {row.work_sessions.name || "작업 보기"} →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
