import { useQuery } from "@tanstack/react-query";
import {
  baseWeightsQuery,
  mouldsQuery,
  versionIngredientsQuery,
  type WorkSessionFormulaVersionRow,
} from "@/lib/queries";
import { mouldAbbr } from "@/lib/component-size";
import { sumBaseGrams } from "@/lib/work-session";
import { fmtNumber } from "@/lib/formula";

export function ComponentPlanReadout({ row }: { row: WorkSessionFormulaVersionRow }) {
  const ingredients = useQuery(versionIngredientsQuery(row.formula_version_id));
  const moulds = useQuery(mouldsQuery());
  const presets = useQuery(baseWeightsQuery());
  const baseGrams = sumBaseGrams(ingredients.data ?? []);
  const grams = baseGrams * Number(row.multiplier);
  // 사이즈: SHEET는 몰드 기준, 그 외(CREAM/FILLING)는 기준중량(프리셋 값, 없으면 레시피 BASE 합계)
  const mould = row.mould_id ? (moulds.data ?? []).find((m) => m.id === row.mould_id) : undefined;
  const preset = row.base_weight_id
    ? (presets.data ?? []).find((p) => p.id === row.base_weight_id)
    : undefined;
  const sizeText =
    row.slot === "SHEET"
      ? mould
        ? `${mouldAbbr(mould)} ×${fmtNumber(Number(row.mould_qty ?? row.multiplier), 2)}`
        : null
      : (preset?.weight_g ?? (ingredients.isSuccess && baseGrams > 0 ? baseGrams : null)) != null
        ? `기준 ${fmtNumber(Number(preset?.weight_g ?? baseGrams))}g ×${fmtNumber(Number(row.base_weight_qty ?? row.multiplier), 2)}`
        : null;
  return (
    <span>
      {sizeText && <strong className="mr-1 font-medium">{sizeText} ·</strong>}V
      {row.formula_versions.version_number} · ×{fmtNumber(Number(row.multiplier), 4)}
      {ingredients.isSuccess
        ? ` · 생산 ${fmtNumber(grams)}g`
        : ingredients.isError
          ? " · 생산량 조회 실패"
          : ""}
      {row.version_pinned ? " · 버전 고정" : ""}
    </span>
  );
}
