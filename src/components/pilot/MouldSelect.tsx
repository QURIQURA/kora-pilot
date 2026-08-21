import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mouldsQuery } from "@/lib/queries";
import { selectClass } from "./ui";
import { MouldCreateForm } from "./MouldCreateForm";

const NEW_VALUE = "__new_mould__";

/** 몰드 선택 드롭다운. 맨 아래 "+ NEW MOULD"로 즉석 생성 후 자동 선택. */
export function MouldSelect({
  value,
  onChange,
  emptyLabel = "NO MOULD",
  className,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const moulds = useQuery(mouldsQuery());
  const [creating, setCreating] = useState(false);

  return (
    <>
      <select
        className={className ?? selectClass}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === NEW_VALUE) {
            setCreating(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{emptyLabel}</option>
        {(moulds.data ?? []).map((mould) => (
          <option key={mould.id} value={mould.id}>
            {mould.shape_size ? `${mould.name} · ${mould.shape_size}` : mould.name}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW MOULD</option>
      </select>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">NEW MOULD</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setCreating(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <MouldCreateForm
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
