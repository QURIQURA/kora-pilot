import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { costDashboardQuery, type CostDashboardRow } from "@/lib/queries";
import { fmtCurrency } from "@/lib/cost";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { SectionCard, selectClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/cost")({
  head: () => ({
    meta: [
      { title: "PILOT — Cost" },
      { name: "description", content: "Product × size cost comparison" },
      { property: "og:title", content: "PILOT — Cost" },
      { property: "og:description", content: "Product × size cost comparison" },
    ],
  }),
  component: CostDashboardPage,
});

type SortKey = "FULL_COST" | "MARGIN" | "MONTHLY_COST";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "FULL_COST", label: "케익 1개당 원가 높은 순" },
  { value: "MARGIN", label: "마진율 낮은 순 (효율 나쁜 순)" },
  { value: "MONTHLY_COST", label: "월 예상 원가 높은 순" },
];

function CostDashboardPage() {
  useSetBreadcrumb([{ label: "PILOT", path: "/" }, { label: "COST" }]);

  const dashboard = useQuery(costDashboardQuery());
  const [sortKey, setSortKey] = useState<SortKey>("FULL_COST");

  const rows = dashboard.data ?? [];

  const sorted = useMemo(() => {
    const withValue = rows.map((r) => r);
    withValue.sort((a, b) => {
      if (sortKey === "FULL_COST") return (b.fullCost ?? -Infinity) - (a.fullCost ?? -Infinity);
      if (sortKey === "MONTHLY_COST") return (b.monthlyCost ?? -Infinity) - (a.monthlyCost ?? -Infinity);
      // MARGIN — marginPct가 없는 행(판매가 미입력)은 맨 뒤로
      const aPct = a.marginPct ?? Infinity;
      const bPct = b.marginPct ?? Infinity;
      return aPct - bPct;
    });
    return withValue;
  }, [rows, sortKey]);

  const maxFullCost = Math.max(1, ...rows.map((r) => r.fullCost ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg">COST</h1>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            모든 PRODUCT × SIZE의 원가/마진을 한눈에 비교합니다. 사이즈가 등록된 항목만 표시됩니다.
          </p>
        </div>
        <label className="flex items-center gap-1.5">
          <span className="label-caps text-[10px] text-muted-foreground">정렬</span>
          <select
            className={selectClass + " w-auto"}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionCard title={`PRODUCT × SIZE (${sorted.length})`}>
        {dashboard.isLoading ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
        ) : sorted.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            등록된 사이즈가 없습니다. PRODUCT 상세 → SIZES에서 먼저 사이즈를 추가하세요.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {sorted.map((row) => (
              <CostDashboardRowItem key={row.sizeId} row={row} maxFullCost={maxFullCost} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function CostDashboardRowItem({
  row,
  maxFullCost,
}: {
  row: CostDashboardRow;
  maxFullCost: number;
}) {
  const barPct = row.fullCost != null ? Math.max(2, (row.fullCost / maxFullCost) * 100) : 0;
  const marginTone =
    row.marginPct == null
      ? "text-muted-foreground"
      : row.marginPct < 0
        ? "text-destructive"
        : row.marginPct < 30
          ? "text-muted-foreground"
          : "text-foreground";

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/products/$productId"
          params={{ productId: row.productId }}
          className="text-sm hover:underline"
        >
          {row.productName}
          <span className="ml-2 text-xs text-muted-foreground">{row.sizeLabel}</span>
          {row.isDefault && (
            <span className="label-caps ml-2 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              DEFAULT
            </span>
          )}
        </Link>
        <span className="font-mono text-sm">
          {row.fullCost != null ? fmtCurrency(row.fullCost) : "원가 정보 없음"}
          {row.hasMissingPrice ? "*" : ""}
          <span className="text-xs text-muted-foreground"> / 케익</span>
        </span>
      </div>

      {row.fullCost != null && (
        <div className="h-1.5 w-full bg-secondary">
          <div className="h-full bg-foreground" style={{ width: `${barPct}%` }} />
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        {row.rawCost != null && <span>RAW MATERIAL {fmtCurrency(row.rawCost)}</span>}
        {row.perCakeExtras > 0 && <span>UTIL/CONS/PKG/OH {fmtCurrency(row.perCakeExtras)}</span>}
        {row.sellingPrice != null && (
          <span className={marginTone}>
            판매가 {fmtCurrency(row.sellingPrice)}
            {row.margin != null &&
              ` · 마진 ${fmtCurrency(row.margin)}${row.marginPct != null ? ` (${row.marginPct.toFixed(0)}%)` : ""}`}
          </span>
        )}
        {row.monthlyUnitCount != null && (
          <span>
            월 {row.monthlyUnitCount}개
            {row.monthlyCost != null && ` · 월 예상 원가 ${fmtCurrency(row.monthlyCost)}`}
          </span>
        )}
      </div>
    </li>
  );
}
