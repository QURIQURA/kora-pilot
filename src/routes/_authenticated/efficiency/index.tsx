import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  allEfficiencySessionsQuery,
  productComponentGramsRowsQuery,
  type WorkSessionEfficiencyWithProductRow,
} from "@/lib/queries";
import {
  aggregateProductEfficiency,
  buildGramsPerUnitMap,
  fmtMinutes,
  fmtUnitsPerHour,
  summarizeSessionEfficiency,
  type SessionEfficiencySummary,
} from "@/lib/production-efficiency";
import { PageHeader, SectionCard } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/efficiency/")({
  head: () => ({
    meta: [
      { title: "PILOT — Efficiency" },
      { name: "description", content: "Production efficiency across products" },
    ],
  }),
  component: EfficiencyDashboardPage,
});

/**
 * EFFICIENCY 대시보드 — Batch size가 연결된 모든 Work Session을 Product별로 묶어서
 * Minutes/Unit·Units/Hour를 한눈에 비교한다. 노동비 계산이 아니라 "어느 제품이 시간당 몇 개
 * 나오는지 / 어디서 시간을 줄일 수 있는지" 판단용(2026-10-06).
 *
 * 각 Product마다 g/unit 매핑(product_components)이 달라서, Product별로 각자 useQuery를 또
 * 돌 수 없다(hooks 규칙) — 대신 세션들을 Product별로 묶은 뒤, 이 화면에서는 Formula
 * Version→g 매핑 없이 "이미 output_unit이 완제품 개수였던 Step들"만으로도 집계가 되므로,
 * g 환산이 필요한 Product는 PRODUCTS 상세의 EFFICIENCY 섹션(정확한 매핑 포함)에서 본다.
 * 여기서는 Product 하나를 선택해 그 Product만 정확히 환산해서 보여준다.
 */
function EfficiencyDashboardPage() {
  const sessions = useQuery(allEfficiencySessionsQuery());
  const rows = sessions.data ?? [];

  const byProduct = new Map<
    string,
    { name: string; rows: WorkSessionEfficiencyWithProductRow[] }
  >();
  for (const row of rows) {
    if (!row.product_id || !row.products) continue;
    const entry = byProduct.get(row.product_id) ?? { name: row.products.name, rows: [] };
    entry.rows.push(row);
    byProduct.set(row.product_id, entry);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="EFFICIENCY" />
      <p className="font-mono text-xs text-muted-foreground">
        Minutes/Unit · Units/Hour 등 — 노동비 계산이 아니라 시간당 몇 개 만드는지, 어디서 시간을
        줄일 수 있는지 비교하는 화면입니다. PRODUCTION 작업 세션에 PRODUCT/BATCH SIZE를 연결하고
        WORKFLOW에서 TASK별 실제 작업시간/생산량을 입력하면 여기 쌓입니다.
      </p>

      {byProduct.size === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          아직 BATCH SIZE가 연결된 생산 기록이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[...byProduct.entries()].map(([productId, entry]) => (
            <ProductCard key={productId} productId={productId} name={entry.name} rows={entry.rows} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({
  productId,
  name,
  rows,
}: {
  productId: string;
  name: string;
  rows: WorkSessionEfficiencyWithProductRow[];
}) {
  const gramsRows = useQuery(productComponentGramsRowsQuery(productId));

  const summaries: SessionEfficiencySummary[] = rows.map((s) =>
    summarizeSessionEfficiency(s, s.work_session_tasks, buildGramsPerUnitMap(gramsRows.data ?? [], s.product_size_id)),
  );
  const stats = aggregateProductEfficiency(summaries);

  return (
    <SectionCard
      title={name}
      action={
        <Link
          to="/products/$productId"
          params={{ productId }}
          className="label-caps text-xs text-muted-foreground hover:text-foreground"
        >
          PRODUCT →
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat label="평균 MIN/UNIT" value={fmtMinutes(stats.avgMinutesPerUnit)} />
        <Stat label="평균 UNITS/HOUR" value={fmtUnitsPerHour(stats.avgUnitsPerHour)} />
        <Stat label="BEST" value={fmtMinutes(stats.bestMinutesPerUnit)} />
        <Stat label="최근 기록" value={fmtMinutes(stats.recentMinutesPerUnit)} />
      </div>
      {stats.stepTimeShare[0] && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          가장 시간 많이 걸리는 STEP: {stats.stepTimeShare[0].label} (
          {Math.round(stats.stepTimeShare[0].share * 100)}%)
        </p>
      )}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{stats.sessionCount}회 기록</p>
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
