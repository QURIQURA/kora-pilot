import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mouldsQuery } from "@/lib/queries";
import type { Mould } from "@/lib/formula";
import { selectClass } from "./ui";
import { MouldCreateForm } from "./MouldCreateForm";

const NEW_VALUE = "__new_mould__";

// 2026-10-06 사용자 요청: "몰드 기준이라 되어있는데 어떤 용량의 몰드 기준인지는 안적혀있어" —
// 드롭다운/표시 어디서도 몰드의 기준중량(reference_weight_g, SETTINGS > MOULDS에서 등록)이
// 안 보여서 어떤 용량 기준인지 알 수 없었던 문제. 이 라벨 포맷을 한 곳에 모아서 MouldSelect와
// 그걸 쓰는 화면(FORMULA 상세, Component CURRENT FORMULA 요약 등) 전체에서 공유한다.
export function mouldOptionLabel(mould: Pick<Mould, "name" | "shape_size" | "reference_weight_g">): string {
  const parts = [mould.name];
  if (mould.shape_size) parts.push(mould.shape_size);
  const label = parts.join(" · ");
  return mould.reference_weight_g != null ? `${label} (${mould.reference_weight_g}g 기준)` : label;
}

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
            {mouldOptionLabel(mould)}
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
