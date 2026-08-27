import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  formulasByTechniqueQuery,
  techniqueCategoriesQuery,
  versionIngredientsBulkQuery,
  type FormulaListRow,
  type VersionIngredientRow,
} from "@/lib/queries";
import { techniquePath } from "@/lib/technique";
import { fmtNumber, versionLabel } from "@/lib/formula";
import { balanceTotals, compositionTotals } from "@/lib/formula-calc";
import { formatDateTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { headlineVersion } from "./formulas/index";
import { SectionCard, StatusBadge } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/settings_/calibration/$techniqueId"
)({
  head: () => ({
    meta: [
      { title: "PILOT — Technique Calibration" },
      {
        name: "description",
        content: "Observed composition and balance across formulas of one technique",
      },
      { property: "og:title", content: "PILOT — Technique Calibration" },
      {
        property: "og:description",
        content: "Observed composition and balance across formulas of one technique",
      },
    ],
  }),
  component: CalibrationPage,
});

interface MetricRow {
  label: string;
  values: (number | null)[];
  digits?: number;
  suffix?: string;
}

function CalibrationPage() {
  const { techniqueId } = Route.useParams();
  const categories = useQuery(techniqueCategoriesQuery());
  const formulas = useQuery(formulasByTechniqueQuery(techniqueId));

  const list = categories.data ?? [];
  const path = techniquePath(list, techniqueId);
  const technique = path[path.length - 1] ?? null;

  const rows: FormulaListRow[] = [...(formulas.data ?? [])].sort((a, b) => {
    const base = Number(b.is_base_formula) - Number(a.is_base_formula);
    if (base !== 0) return base;
    return a.name.localeCompare(b.name);
  });

  const versionIds = rows
    .map((row) => headlineVersion(row)?.id)
    .filter((id): id is string => Boolean(id));
  const bulk = useQuery(versionIngredientsBulkQuery(versionIds));

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "SETTINGS", path: "/settings" },
    { label: "CALIBRATION" },
    { label: (technique?.name ?? "…").toUpperCase() },
  ]);

  if (!technique) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {categories.isLoading ? "LOADING…" : "TECHNIQUE NOT FOUND"}
      </p>
    );
  }

  const ingredientsByFormula = new Map<string, VersionIngredientRow[]>();
  for (const row of rows) {
    const head = headlineVersion(row);
    ingredientsByFormula.set(
      row.id,
      (head ? bulk.data?.[head.id] : undefined) ?? []
    );
  }

  /* ── 지표 계산 — P2가 쓰는 함수를 그대로 사용 (새 계산 없음) ── */
  const columns = rows.map((row) => {
    const ing = ingredientsByFormula.get(row.id) ?? [];
    const comp = compositionTotals(ing, 1);
    const bal = balanceTotals(ing, 1);
    const pct = (g: number) =>
      comp.totalWeight > 0 ? (g / comp.totalWeight) * 100 : null;
    return {
      formula: row,
      empty: ing.length === 0 || comp.totalWeight <= 0,
      metrics: {
        total: comp.totalWeight || null,
        water: pct(comp.water),
        fat: pct(comp.fat),
        sugar: pct(comp.sugar),
        protein: pct(comp.protein),
        other: pct(comp.otherSolids),
        solids: pct(comp.totalSolids),
        hydration: comp.hydrationPct,
        toughen: bal.toughenTender?.left ?? null,
        moisten: bal.moistenDry?.left ?? null,
      },
      missing: comp.missing.length,
    };
  });

  const metricRows: MetricRow[] = [
    { label: "총 중량 TOTAL", values: columns.map((c) => c.metrics.total), digits: 0, suffix: "g" },
    { label: "수분 WATER %", values: columns.map((c) => c.metrics.water) },
    { label: "지방 FAT %", values: columns.map((c) => c.metrics.fat) },
    { label: "당 SUGAR %", values: columns.map((c) => c.metrics.sugar) },
    { label: "단백질 PROTEIN %", values: columns.map((c) => c.metrics.protein) },
    { label: "기타 고형분 OTHER %", values: columns.map((c) => c.metrics.other) },
    { label: "총 고형분 SOLIDS %", values: columns.map((c) => c.metrics.solids) },
    { label: "수분율 HYDRATION %", values: columns.map((c) => c.metrics.hydration) },
    { label: "강화 TOUGHENER %", values: columns.map((c) => c.metrics.toughen) },
    { label: "습윤 MOISTENER %", values: columns.map((c) => c.metrics.moisten) },
  ];

  const baseIndex = columns.findIndex((c) => c.formula.is_base_formula);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="space-y-2 border-b border-border pb-4">
        <p className="label-caps text-xs text-muted-foreground">
          {path.map((p) => p.name).join(" / ")}
        </p>
        <h1 className="text-lg">
          {technique.name}
          {technique.name_en && (
            <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">
              {technique.name_en}
            </span>
          )}
        </h1>
        {technique.suggested_base_formula && (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            참고 기준 배합 — {technique.suggested_base_formula}
          </p>
        )}
        {technique.notes && (
          <p className="font-body text-sm text-foreground">{technique.notes}</p>
        )}
        <Link
          to="/settings"
          className="label-caps inline-block text-xs text-muted-foreground underline"
        >
          ← SETTINGS
        </Link>
      </div>

      {/* 연결된 배합 */}
      <SectionCard title={`연결된 배합 — ${rows.length}`}>
        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            아직 연결된 배합이 없습니다. 배합 작성 시 이 기법군으로 지정하면 여기 나타납니다
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {rows.map((row) => {
              const head = headlineVersion(row);
              return (
                <li key={row.id}>
                  <Link
                    to="/formulas/$formulaId"
                    params={{ formulaId: row.id }}
                    className={cn(
                      "grid grid-cols-1 gap-1 px-4 py-3 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2",
                      row.is_base_formula && "bg-secondary/60"
                    )}
                  >
                    <span className="col-span-4 text-sm">
                      {row.is_base_formula && <span className="mr-1">⭐</span>}
                      {row.name}
                    </span>
                    <span className="col-span-3 font-mono text-xs uppercase text-muted-foreground">
                      {row.components?.name ?? "—"}
                    </span>
                    <span className="col-span-1 font-mono text-xs">
                      {head ? versionLabel(head.version_number) : "—"}
                    </span>
                    <span className="col-span-2">
                      <StatusBadge status={head?.status ?? "DRAFT"} />
                    </span>
                    <span className="col-span-2 font-mono text-xs text-muted-foreground">
                      {formatDateTime(row.updated_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* 실측 비교 */}
      {rows.length === 1 && columns[0] && (
        <SectionCard title="실측값 — 관찰값, 아직 CONTEXT WEIGHT 아님">
          <div className="space-y-2">
            <p className="label-caps text-xs">
              {columns[0].formula.is_base_formula && "⭐ "}
              {columns[0].formula.name}
            </p>
            {columns[0].empty ? (
              <p className="font-mono text-xs uppercase text-muted-foreground">
                재료가 아직 없습니다
              </p>
            ) : (
              <ul className="font-mono text-xs tabular-nums text-muted-foreground">
                {metricRows.map((m) => (
                  <li key={m.label}>
                    {m.label} {formatMetric(m.values[0] ?? null, m)}
                  </li>
                ))}
              </ul>
            )}
            <FootNote formulaId={columns[0].formula.id} />
          </div>
        </SectionCard>
      )}

      {rows.length >= 2 && (
        <SectionCard title="실측 비교 — 관찰값, 아직 CONTEXT WEIGHT 아님">
          <p className="mb-3 border border-dashed border-border px-3 py-2 font-mono text-[11px] uppercase text-muted-foreground">
            관찰값 — 아직 Context Weight 아님. 실제 배합에서 계산된 값일 뿐, 이 기법군의
            Function/Balance Weight가 아닙니다
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label-caps sticky left-0 bg-card px-2 py-2 text-xs text-muted-foreground">
                    지표
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.formula.id}
                      className={cn(
                        "label-caps px-2 py-2 text-xs",
                        c.formula.is_base_formula && "bg-secondary"
                      )}
                    >
                      {c.formula.is_base_formula && "⭐ "}
                      {c.formula.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-sm tabular-nums">
                {metricRows.map((m) => {
                  const baseValue =
                    baseIndex >= 0 ? m.values[baseIndex] ?? null : null;
                  return (
                    <tr key={m.label} className="border-b border-border">
                      <td className="label-caps sticky left-0 bg-card px-2 py-2 text-xs">
                        {m.label}
                      </td>
                      {m.values.map((value, i) => {
                        const off =
                          i !== baseIndex && isOff(value, baseValue, m.label);
                        return (
                          <td
                            key={columns[i]?.formula.id ?? i}
                            className={cn(
                              "px-2 py-2",
                              columns[i]?.formula.is_base_formula && "bg-secondary",
                              off && "border border-dashed border-foreground"
                            )}
                          >
                            {formatMetric(value, m)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <td className="label-caps sticky left-0 bg-card px-2 py-2 text-xs">
                    조성 미입력
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.formula.id}
                      className={cn(
                        "px-2 py-2 text-xs",
                        c.formula.is_base_formula && "bg-secondary"
                      )}
                    >
                      {c.missing > 0 ? `${c.missing}개` : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[11px] uppercase text-muted-foreground">
            점선 표시 = 기준 배합과 차이가 큼 (판정 아님 — 반복되는 차이인지 보는 용도)
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {columns.map((c) => (
              <FootNote key={c.formula.id} formulaId={c.formula.id} label={c.formula.name} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function FootNote({ formulaId, label }: { formulaId: string; label?: string }) {
  return (
    <Link
      to="/formulas/$formulaId"
      params={{ formulaId }}
      className="font-mono text-xs underline hover:bg-secondary"
    >
      {label ? `${label} — ` : ""}정확한 계산은 FORMULA DETAIL에서 확인 →
    </Link>
  );
}

function formatMetric(value: number | null, m: MetricRow): string {
  if (value == null) return "—";
  return `${fmtNumber(value, m.digits ?? 1)}${m.suffix ?? ""}`;
}

/** 기준 배합과 눈에 띄게 다른 값인지 — 판정이 아니라 표시용 */
function isOff(
  value: number | null,
  base: number | null,
  label: string
): boolean {
  if (value == null || base == null) return false;
  if (label.startsWith("총 중량")) return false;
  const diff = Math.abs(value - base);
  const relative = base !== 0 ? diff / Math.abs(base) : 0;
  return diff >= 5 && relative >= 0.25;
}
