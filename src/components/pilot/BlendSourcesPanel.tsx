import { Link } from "@tanstack/react-router";
import { readBlendSources } from "@/lib/component-blend";
import { fmtNumber } from "@/lib/formula";
import { SectionCard } from "./ui";

export function BlendSourcesPanel({
  sources,
  multiplier = 1,
}: {
  sources: unknown;
  multiplier?: number;
}) {
  const rows = readBlendSources(sources);
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.amount_g, 0);
  return (
    <SectionCard title="COMPONENT MIX · 생성 당시 구성">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.version_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <Link
              to="/formulas/$formulaId"
              params={{ formulaId: r.formula_id }}
              search={{ version: r.version_id }}
              className="underline"
            >
              {r.component_name} · V{r.version_number}
            </Link>
            <span>
              {fmtNumber(r.amount_g * multiplier, 2)}g · {fmtNumber((r.amount_g / total) * 100)}%
            </span>
            {r.notes && (
              <details className="w-full text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  저장 당시 제조 메모
                </summary>
                <p className="whitespace-pre-wrap pt-2">{r.notes}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        각 컴포넌트를 따로 만든 뒤 혼합하세요. 원본 수정은 자동 반영되지 않으며, 아래 원재료를 직접
        수정하면 생성 당시 구성과 달라질 수 있습니다.
      </p>
    </SectionCard>
  );
}
