import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { baseWeightsQuery } from "@/lib/queries";
import { fmtNumber } from "@/lib/formula";
import { selectClass } from "./ui";
import { BaseWeightCreateForm } from "./BaseWeightCreateForm";

const NEW_VALUE = "__new_base_weight__";

/** 기준중량 프리셋 선택 드롭다운 — MouldSelect와 대응. 맨 아래 "+ NEW BASE WEIGHT"로 즉석 생성 후 자동 선택. */
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
        {(baseWeights.data ?? []).map((bw) => (
          <option key={bw.id} value={bw.id}>
            {bw.name} · {fmtNumber(bw.weight_g)}g
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW BASE WEIGHT</option>
      </select>

      {creating &&
        createPortal(
          // 2026-10-12: MouldSelect와 같은 버그 — 바깥쪽 <form> 안에서 쓰이는 자리(예: FORMULA
          // 배수 입력 폼)에서 이 모달이 같은 DOM 트리에 렌더링되면 <form> 중첩으로 CREATE가
          // 바깥쪽 폼을 제출해버린다. document.body로 포탈링해서 방지.
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
            <div className="w-full max-w-md border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="label-caps">NEW BASE WEIGHT</span>
                <button
                  type="button"
                  className="label-caps px-2 py-2"
                  onClick={() => setCreating(false)}
                >
                  CLOSE
                </button>
              </div>
              <div className="p-4">
                <BaseWeightCreateForm
                  onCancel={() => setCreating(false)}
                  onCreated={(id) => {
                    setCreating(false);
                    onChange(id);
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
