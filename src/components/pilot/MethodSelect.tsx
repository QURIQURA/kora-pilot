import { useQuery } from "@tanstack/react-query";
import { methodsByTechniqueCategoryQuery } from "@/lib/queries";
import { methodLabel } from "@/lib/method";
import { selectClass } from "./ui";

/**
 * METHOD 선택 — 선택된 TECHNIQUE CATEGORY에 속한 METHOD만 보여준다.
 * techniqueCategoryId가 없으면 비활성화("기법 먼저 선택").
 */
export function MethodSelect({
  techniqueCategoryId,
  value,
  onChange,
  className,
}: {
  techniqueCategoryId: string;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const methods = useQuery(methodsByTechniqueCategoryQuery(techniqueCategoryId || null));
  const list = methods.data ?? [];
  const disabled = !techniqueCategoryId;

  return (
    <select
      className={className ?? selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">
        {disabled ? "기법 먼저 선택" : list.length === 0 ? "등록된 METHOD 없음" : "METHOD 없음"}
      </option>
      {list.map((method) => (
        <option key={method.id} value={method.id}>
          {methodLabel(method)}
        </option>
      ))}
    </select>
  );
}
