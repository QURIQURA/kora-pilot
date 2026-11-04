import { useQuery } from "@tanstack/react-query";
import { versionIngredientsQuery, type WorkSessionFormulaVersionRow } from "@/lib/queries";
import { sumBaseGrams } from "@/lib/work-session";
import { fmtNumber } from "@/lib/formula";

export function ComponentPlanReadout({ row }: { row: WorkSessionFormulaVersionRow }) {
  const ingredients = useQuery(versionIngredientsQuery(row.formula_version_id));
  const grams = sumBaseGrams(ingredients.data ?? []) * Number(row.multiplier);
  return (
    <span>
      V{row.formula_versions.version_number} · ×{fmtNumber(Number(row.multiplier), 4)}
      {ingredients.isSuccess
        ? ` · 생산 ${fmtNumber(grams)}g`
        : ingredients.isError
          ? " · 생산량 조회 실패"
          : ""}
      {` · 사용 목표 ${row.target_quantity_g == null ? "미지정" : `${fmtNumber(row.target_quantity_g)}g`}`}
      {row.version_pinned ? " · 버전 고정" : ""}
    </span>
  );
}
