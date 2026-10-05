import { useQuery } from "@tanstack/react-query";
import { efficiencySessionsByProductQuery, productComponentGramsRowsQuery } from "@/lib/queries";
import {
  aggregateProductEfficiency,
  buildGramsPerUnitMap,
  fmtMinutes,
  fmtUnitsPerHour,
  summarizeSessionEfficiency,
} from "@/lib/production-efficiency";
import { formatDateTime } from "@/lib/datetime";
import { SectionCard } from "./ui";

/**
 * PRODUCT 상세 "EFFICIENCY" 섹션 — 이 Product에 연결된(Batch size 지정된) Work Session들로
 * Minutes/Unit, Units/Hour, Best/최근 기록, Step별 시간 비중, Batch size별 효율을 보여준다.
 * 노동비 계산이 아니라 "시간당 몇 개 만드는지 / 어디서 시간을 줄일 수 있는지" 판단용.
 */
export function ProductEfficiencySection({ productId }: { productId: string }) {
  const sessions = useQuery(efficiencySessionsByProductQuery(productId));
  // Size별로 g/unit이 다를 수 있어서, 세션마다 그때 실제로 쓴 product_size_id 기준으로
  // 각자 계산한다(buildGramsPerUnitMap을 세션별로 호출) — 원본 행만 한 번 받아온다.
  const gramsRows = useQuery(productComponentGramsRowsQuery(productId));

  if (sessions.isLoading) {
    return (
      <SectionCard title="EFFICIENCY">
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      </SectionCard>
    );
  }

  const rows = sessions.data ?? [];
  if (rows.length === 0) {
    return (
      <SectionCard title="EFFICIENCY">
        <p className="font-mono text-xs uppercase text-muted-foreground">
          아직 이 PRODUCT로 기록된 생산 데이터가 없습니다. PRODUCTION에서 작업 세션을 만들 때 이
          PRODUCT와 BATCH SIZE를 연결하고, WORKFLOW에서 TASK별 실제 작업시간/생산량을 입력하면
          여기에 집계됩니다.
        </p>
      </SectionCard>
    );
  }

  const summaries = rows.map((s) =>
    summarizeSessionEfficiency(
      s,
      s.work_session_tasks,
      buildGramsPerUnitMap(gramsRows.data ?? [], s.product_size_id),
    ),
  );
  const stats = aggregateProductEfficiency(summaries);

  return (
    <SectionCard title="EFFICIENCY">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="평균 MIN/UNIT" value={fmtMinutes(stats.avgMinutesPerUnit)} />
        <Stat label="평균 UNITS/HOUR" value={fmtUnitsPerHour(stats.avgUnitsPerHour)} />
        <Stat label="BEST" value={fmtMinutes(stats.bestMinutesPerUnit)} />
        <Stat label="최근 기록" value={fmtMinutes(stats.recentMinutesPerUnit)} />
      </div>

      {stats.stepTimeShare.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="label-caps text-[11px] text-muted-foreground">STEP별 시간 비중</p>
          {stats.stepTimeShare.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs">{s.label}</span>
              <div className="h-2 flex-1 bg-secondary">
                <div className="h-2 bg-foreground" style={{ width: `${Math.round(s.share * 100)}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                {s.minutes.toFixed(0)}분 ({Math.round(s.share * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {stats.batchSizeEfficiency.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="label-caps text-[11px] text-muted-foreground">BATCH SIZE별 효율</p>
          <ul className="divide-y divide-border border border-border">
            {stats.batchSizeEfficiency.map((b) => (
              <li key={b.batchSize} className="flex justify-between px-2 py-1 font-mono text-[11px]">
                <span>{b.batchSize}개</span>
                <span className="text-muted-foreground">
                  평균 {fmtMinutes(b.avgMinutesPerUnit)}/unit · {b.sessionCount}회
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-1">
        <p className="label-caps text-[11px] text-muted-foreground">최근 기록</p>
        <ul className="divide-y divide-border border border-border">
          {summaries.slice(0, 8).map((s) => (
            <li key={s.sessionId} className="flex justify-between px-2 py-1 font-mono text-[11px]">
              <span className="truncate">{s.sessionName}</span>
              <span className="text-muted-foreground">
                {s.completedAt ? formatDateTime(s.completedAt) : "미완료"} · BATCH {s.targetUnitCount ?? "—"} ·{" "}
                {fmtMinutes(s.minutesPerUnit)}/unit
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-2">
      <p className="label-caps text-[10px] text-muted-foreground">{label}</p>
      <p className="font-mono text-base">{value}</p>
    </div>
  );
}
