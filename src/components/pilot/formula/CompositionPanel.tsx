import { Link } from "@tanstack/react-router";
import { compositionTotals } from "@/lib/formula-calc";
import { fmtNumber } from "@/lib/formula";
import type { VersionIngredientRow } from "@/lib/queries";
import { CollapsibleSection } from "@/components/pilot/ui";

/** 배합 전체의 실제 조성 집계 — 조성 미입력 재료가 있으면 반드시 경고한다 */
export function CompositionPanel({
  rows,
  batch,
}: {
  rows: VersionIngredientRow[];
  batch: number;
}) {
  const totals = compositionTotals(rows, batch);
  if (totals.totalWeight <= 0) return null;

  const pct = (g: number) =>
    totals.totalWeight > 0 ? (g / totals.totalWeight) * 100 : 0;

  const segments = [
    { key: "water", label: "수분 WATER", grams: totals.water, shade: "bg-foreground/15" },
    { key: "sugar", label: "당 SUGAR", grams: totals.sugar, shade: "bg-foreground/30" },
    { key: "fat", label: "지방 FAT", grams: totals.fat, shade: "bg-foreground/50" },
    { key: "protein", label: "단백질 PROTEIN", grams: totals.protein, shade: "bg-foreground/65" },
    { key: "other", label: "기타 고형분 OTHER", grams: totals.otherSolids, shade: "bg-foreground/80" },
    { key: "alcohol", label: "알코올 ALCOHOL", grams: totals.alcohol, shade: "bg-foreground/95" },
  ].filter((s) => s.grams > 0.005);

  return (
    <CollapsibleSection
      title={`COMPOSITION — 조성 집계${batch !== 1 ? ` (×${fmtNumber(batch, 2)})` : ""}`}
      defaultOpen
      badge={
        totals.missing.length > 0 ? (
          <span className="label-caps border border-dashed border-foreground px-2 py-0.5 text-[10px]">
            미입력 {totals.missing.length}
          </span>
        ) : undefined
      }
    >
      {/* 100% 누적 막대 */}
      <div className="flex h-3 w-full border border-border">
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.shade}
            style={{ width: `${pct(s.grams)}%` }}
            title={`${s.label} ${fmtNumber(pct(s.grams), 1)}%`}
          />
        ))}
      </div>

      {/* 조성 표 */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              {["COMPONENT", "g", "%"].map((h) => (
                <th key={h} className="label-caps px-2 py-2 text-xs text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-sm tabular-nums">
            {segments.map((s) => (
              <tr key={s.key} className="border-b border-border">
                <td className="label-caps px-2 py-2 text-xs">{s.label}</td>
                <td className="px-2 py-2">{fmtNumber(s.grams)}g</td>
                <td className="px-2 py-2">{fmtNumber(pct(s.grams), 1)}%</td>
              </tr>
            ))}
            <tr className="border-b border-border">
              <td className="label-caps px-2 py-2 text-xs">총 고형분 TOTAL SOLIDS</td>
              <td className="px-2 py-2">{fmtNumber(totals.totalSolids)}g</td>
              <td className="px-2 py-2">{fmtNumber(pct(totals.totalSolids), 1)}%</td>
            </tr>
            <tr>
              <td className="label-caps px-2 py-2 text-xs">총 중량 TOTAL</td>
              <td className="px-2 py-2">{fmtNumber(totals.totalWeight)}g</td>
              <td className="px-2 py-2">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 파생 지표 */}
      <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">
        수분율(수분÷밀가루) {totals.hydrationPct != null ? `${fmtNumber(totals.hydrationPct, 1)}%` : "—"}
        {" · "}물:지방 {totals.waterFatRatio != null ? `${fmtNumber(totals.waterFatRatio, 2)} : 1` : "—"}
        {" · "}지방율 {totals.fatPct != null ? `${fmtNumber(totals.fatPct, 1)}%` : "—"}
      </p>

      {/* 미입력 경고 — 조용히 틀린 숫자를 보여주지 않는다 */}
      {totals.missing.length > 0 && (
        <div className="mt-3 border border-dashed border-foreground px-3 py-3">
          <p className="font-mono text-xs uppercase">
            재료 {totals.missing.length}개의 조성 미입력 — 계산이 실제보다 낮게 나옵니다
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {totals.missing.map((m) => (
              <li key={m.ingredientId}>
                <Link
                  to="/ingredients/$ingredientId"
                  params={{ ingredientId: m.ingredientId }}
                  className="font-mono text-xs underline hover:bg-secondary"
                >
                  {m.name} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleSection>
  );
}
