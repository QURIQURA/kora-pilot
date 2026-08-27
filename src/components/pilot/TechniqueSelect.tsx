import { useQuery } from "@tanstack/react-query";
import { techniqueCategoriesQuery } from "@/lib/queries";
import { leafTechniques, techniquePath } from "@/lib/technique";
import { selectClass } from "./ui";

/**
 * 기법 분류 선택 — 리프 항목만 선택 가능(그룹·중간 노드는 목록에서 제외).
 * 비워두면 null.
 */
export function TechniqueSelect({
  value,
  onChange,
  emptyLabel = "기법 분류 없음",
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
}) {
  const categories = useQuery(techniqueCategoriesQuery());
  const list = categories.data ?? [];

  return (
    <select
      className={className ?? selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {leafTechniques(list).map(({ category }) => {
        const path = techniquePath(list, category.id);
        const prefix = path
          .slice(0, -1)
          .map((p) => p.name)
          .join(" / ");
        return (
          <option key={category.id} value={category.id}>
            {prefix ? `${prefix} / ` : ""}
            {category.name}
            {category.name_en ? ` (${category.name_en})` : ""}
          </option>
        );
      })}
    </select>
  );
}
