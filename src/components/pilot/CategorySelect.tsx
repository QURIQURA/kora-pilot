import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "@/lib/queries";
import { flattenCategories } from "@/lib/pilot";
import { selectClass } from "./ui";
import { CategoryCreateForm } from "./CategoryCreateForm";

const NEW_VALUE = "__new_category__";

/**
 * 카테고리 선택 드롭다운. 맨 아래 "+ NEW CATEGORY"로 즉석 생성 후 자동 선택.
 */
export function CategorySelect({
  value,
  onChange,
  emptyLabel = "NO CATEGORY",
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
}) {
  const categories = useQuery(categoriesQuery());
  const [creating, setCreating] = useState(false);

  return (
    <>
      <select
        className={className ?? selectClass}
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW_VALUE) {
            setCreating(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{emptyLabel}</option>
        {flattenCategories(categories.data ?? []).map(({ category, depth }) => (
          <option key={category.id} value={category.id}>
            {`${"— ".repeat(depth)}${category.name}`}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW CATEGORY</option>
      </select>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">NEW CATEGORY</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setCreating(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <CategoryCreateForm
                onCancel={() => setCreating(false)}
                onCreated={(id) => {
                  setCreating(false);
                  onChange(id);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
