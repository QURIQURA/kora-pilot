import { cn } from "@/lib/utils";

/**
 * 권장 범위 막대 — 회색 띠(권장 범위) + 세로 눈금(현재 값).
 * 범위 안이면 실선, 벗어나면 점선 눈금을 가장자리에 표시하고 방향 화살표를 붙인다.
 * 조성 대시보드(P3) 등 다른 패널에서도 같은 시각 언어로 재사용한다.
 */
export function RangeBar({
  value,
  min,
  max,
  className,
}: {
  value: number | null;
  min: number | null;
  max: number | null;
  className?: string;
}) {
  if (min == null || max == null || max <= 0) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>;
  }

  const scaleMax = Math.max(max, value ?? 0) * 1.25;
  const left = (min / scaleMax) * 100;
  const width = ((max - min) / scaleMax) * 100;

  const out = value != null && (value < min || value > max);
  const direction = value == null ? null : value < min ? "left" : value > max ? "right" : null;
  const tick = value == null ? null : Math.min(Math.max((value / scaleMax) * 100, 0), 100);

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="relative inline-block h-2 w-20 bg-secondary">
        <span
          className="absolute inset-y-0 bg-muted-foreground/30"
          style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
        />
        {tick != null && (
          <span
            className={cn(
              "absolute inset-y-0 w-0 border-l",
              out ? "border-dashed border-foreground" : borderSolid
            )}
            style={{ left: `${tick}%` }}
          />
        )}
      </span>
      {direction === "left" && (
        <span className="font-mono text-[10px] text-muted-foreground">◀ LOW</span>
      )}
      {direction === "right" && (
        <span className="font-mono text-[10px] text-muted-foreground">HIGH ▶</span>
      )}
    </span>
  );
}

const borderSolid = "border-foreground";
