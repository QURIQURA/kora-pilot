import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ingredientsQuery } from "@/lib/queries";
import { readBlendSources } from "@/lib/component-blend";
import { fmtNumber } from "@/lib/formula";

interface SnapshotIngredient {
  ingredient_id: string;
  amount_g: number;
  note?: string | null;
}

/**
 * 합성(블렌드) 컴포넌트의 재료를 원본 컴포넌트별로 따로 보여준다(읽기 전용, 2026-11-06).
 * 합산 표에서는 같은 재료(예: 생크림)가 한 줄로 합쳐져 어느 원본에서 얼마가 들어가는지 안 보였다.
 * 각 원본의 재료량 = 원본 재료 g × (사용량 ÷ 원본 기준 총량) × 배수.
 */
export function BlendIngredientBreakdown({
  sources,
  multiplier,
}: {
  sources: unknown;
  multiplier: number;
}) {
  const ingredients = useQuery(ingredientsQuery());
  const nameOf = (id: string) => {
    const i = (ingredients.data ?? []).find((x) => x.id === id);
    return i ? (i.name_en ? `${i.name} (${i.name_en})` : i.name) : "…";
  };
  const rows = readBlendSources(sources);
  const raw = Array.isArray(sources)
    ? (sources as { version_id?: string; ingredients?: unknown }[])
    : [];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const snap =
          (raw.find((s) => s.version_id === r.version_id)?.ingredients as
            SnapshotIngredient[] | undefined) ?? [];
        const factor = (r.amount_g / r.base_weight_g) * multiplier;
        return (
          <div key={r.version_id} className="border border-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-secondary px-3 py-1.5 text-sm">
              <Link
                to="/formulas/$formulaId"
                params={{ formulaId: r.formula_id }}
                search={{ version: r.version_id }}
                className="underline"
              >
                {r.component_name} · V{r.version_number}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">
                {fmtNumber(r.amount_g * multiplier, 2)}g (원본 {fmtNumber(r.base_weight_g, 2)}g ×
                {fmtNumber(factor, 4)})
              </span>
            </div>
            <ul className="divide-y divide-border">
              {snap.map((i, idx) => (
                <li
                  key={`${i.ingredient_id}-${idx}`}
                  className="flex justify-between gap-2 px-3 py-1 text-sm"
                >
                  <span>{nameOf(i.ingredient_id)}</span>
                  <span className="font-mono tabular-nums">
                    {fmtNumber(i.amount_g * factor, 2)}g
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
