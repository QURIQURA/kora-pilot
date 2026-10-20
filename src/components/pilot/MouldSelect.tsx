import { useState } from "react";
import { createPortal } from "react-dom";
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
  return mould.reference_weight_g != null ? `${label} (ref. ${mould.reference_weight_g}g)` : label;
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

      {creating &&
        createPortal(
          // 2026-10-12 사용자 버그 리포트: "new mould 생성하면 계속 에러나" — Production 화면의
          // AddFormulaVersionForm처럼 MouldSelect가 바깥쪽 <form> 안에 쓰이는 곳에서, 이 모달이
          // (예전처럼) 같은 DOM 트리 안에 그냥 렌더링되면 <form> 안에 <form>이 중첩된다. 브라우저가
          // 이 중첩을 허용하지 않아 안쪽 CREATE 버튼이 안쪽 폼 대신 바깥쪽 폼을 제출해버려서,
          // 네이티브 폼 제출(페이지 새로고침 — "화면이 하얗게 깜빡") 후 바깥쪽 화면(PRODUCT 등)으로
          // 튕기는 증상이었다. document.body로 포탈링해서 어떤 부모 <form> 안에서 쓰이든 항상
          // DOM 트리 바깥에 독립적으로 뜨도록 고쳤다.
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
          </div>,
          document.body,
        )}
    </>
  );
}
