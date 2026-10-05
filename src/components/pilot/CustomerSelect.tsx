import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersQuery } from "@/lib/queries";
import { selectClass } from "./ui";
import { CustomerCreateForm } from "./CustomerCreateForm";

const NEW_VALUE = "__new_customer__";

/** 고객 선택 드롭다운. 맨 아래 "+ NEW CUSTOMER"로 즉석 생성 후 자동 선택. */
export function CustomerSelect({
  value,
  onChange,
  emptyLabel = "NO CUSTOMER",
  className,
  initialNameForCreate,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  /** DM 추출로 고객 이름이 이미 있을 때, "+ NEW CUSTOMER" 눌렀을 때 그 이름을 미리 채워줌 */
  initialNameForCreate?: string;
}) {
  const customers = useQuery(customersQuery());
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
        {(customers.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.instagram_handle || "(이름 없음)"}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW CUSTOMER</option>
      </select>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">NEW CUSTOMER</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setCreating(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <CustomerCreateForm
                initialName={initialNameForCreate ?? ""}
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
