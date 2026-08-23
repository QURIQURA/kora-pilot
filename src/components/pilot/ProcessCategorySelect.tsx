import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { processCategoriesQuery } from "@/lib/queries";
import { selectClass } from "./ui";
import { ProcessCategoryCreateForm } from "./ProcessCategoryCreateForm";

const NEW_VALUE = "__new_process_category__";

/** 프로세스 카테고리 선택 드롭다운. 맨 아래 "+ NEW CATEGORY"로 즉석 생성 후 자동 선택. */
export function ProcessCategorySelect({
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
  const categories = useQuery(processCategoriesQuery());
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
        {(categories.data ?? []).map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW CATEGORY</option>
      </select>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">NEW PROCESS CATEGORY</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setCreating(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <ProcessCategoryCreateForm
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
