import { balanceTotals, type BalanceTotals } from "@/lib/formula-calc";
import { fmtNumber } from "@/lib/formula";
import type { VersionIngredientRow } from "@/lib/queries";
import { CollapsibleSection } from "@/components/pilot/ui";

/** 두 힘의 상대 비율 막대 — 정답 범위는 없다. 판단 도구일 뿐 검사 도구가 아님 */
export function BalanceRatioBar({
  leftLabel,
  rightLabel,
  leftGrams,
  rightGrams,
}: {
  leftLabel: string;
  rightLabel: string;
  leftGrams: number;
  rightGrams: number;
}) {
  const total = leftGrams + rightGrams;
  if (total <= 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {leftLabel} : {rightLabel} — 데이터 없음
      </p>
    );
  }
  const leftPct = (leftGrams / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full border border-border">
        <div className="bg-foreground/70" style={{ width: `${leftPct}%` }} />
        <div className="bg-foreground/20" style={{ width: `${100 - leftPct}%` }} />
      </div>
      <p className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>
          {leftLabel} {fmtNumber(leftPct, 0)}% ({fmtNumber(leftGrams)}g)
        </span>
        <span>
          {rightLabel} {fmtNumber(100 - leftPct, 0)}% ({fmtNumber(rightGrams)}g)
        </span>
      </p>
    </div>
  );
}

/** 균형 요약 한 줄 — 버전 비교 등에 재사용 */
export function balanceSummaryLine(b: BalanceTotals): string {
  const parts: string[] = [];
  if (b.toughenTender)
    parts.push(`강화 ${fmtNumber(b.toughenTender.left, 0)}:연화 ${fmtNumber(b.toughenTender.right, 0)}`);
  if (b.moistenDry)
    parts.push(`습윤 ${fmtNumber(b.moistenDry.left, 0)}:건조 ${fmtNumber(b.moistenDry.right, 0)}`);
  return parts.join(" · ") || "—";
}

export function BalancePanel({
  rows,
  batch,
}: {
  rows: VersionIngredientRow[];
  batch: number;
}) {
  const b = balanceTotals(rows, batch);
  if (!b.toughenTender && !b.moistenDry) return null;

  return (
    <CollapsibleSection
      title={`BALANCE — 배합 균형${batch !== 1 ? ` (×${fmtNumber(batch, 2)})` : ""}`}
      defaultOpen
    >
      <div className="space-y-4">
        <BalanceRatioBar
          leftLabel="강화 TOUGHENER"
          rightLabel="연화 TENDERIZER"
          leftGrams={b.toughener}
          rightGrams={b.tenderizer}
        />
        <BalanceRatioBar
          leftLabel="습윤 MOISTENER"
          rightLabel="건조 DRIER"
          leftGrams={b.moistener}
          rightGrams={b.drier}
        />
        <p className="font-mono text-[11px] uppercase text-muted-foreground">
          판단 도구 — 절대적 정답 범위는 없습니다
        </p>
      </div>
    </CollapsibleSection>
  );
}
