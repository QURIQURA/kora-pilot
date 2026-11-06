import { useQuery } from "@tanstack/react-query";
import { baseWeightsQuery } from "@/lib/queries";
import { fmtNumber } from "@/lib/formula";
import { selectClass } from "./ui";

/**
 * 기준중량 선택 드롭다운 — SETTINGS > BASE WEIGHTS에 등록된 목록에서만 고른다(2026-11-06).
 * 예전에는 포뮬라 화면에서 "+ NEW BASE WEIGHT"로 즉석 생성할 수 있었는데, 포뮬라마다 값이 따로 생겨
 * 혼선이 있어 없앴다. 새 기준중량은 SETTINGS에서만 추가한다.
 */
export function BaseWeightSelect({
  value,
  onChange,
  emptyLabel = "NO BASE WEIGHT",
  className,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const baseWeights = useQuery(baseWeightsQuery());

  return (
    <select
      className={className ?? selectClass}
      value={value}
      disabled={disabled}
      title="기준중량은 SETTINGS > BASE WEIGHTS에서 추가해요"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {(baseWeights.data ?? []).map((bw) => (
        <option key={bw.id} value={bw.id}>
          {bw.name} · {fmtNumber(bw.weight_g)}g
        </option>
      ))}
    </select>
  );
}
