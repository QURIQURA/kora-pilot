import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { productSizesQuery } from "@/lib/queries";
import { formatProductSizeLabel } from "@/lib/product-size";
import { selectClass } from "./ui";
import { ProductSizeForm } from "./ProductSizesSection";

const NEW_VALUE = "__new_product_size__";

// 2026-10-20 사용자 요청: "최종 케익 사이즈도 몰드 관리하는 것처럼 관리할 수 있게" — MouldSelect와
// 똑같은 패턴으로, PRODUCT SIZE 드롭다운 맨 아래 "+ NEW SIZE"를 넣어 그 자리에서 바로 새 사이즈를
// 만들고 자동 선택할 수 있게 한다(그동안은 PRODUCT 상세 페이지의 SIZES 섹션에 먼저 가서 만들어야
// 했음). 생성/수정/삭제의 전체 관리는 여전히 PRODUCT 상세의 SIZES 섹션이 맡는다 — 여긴 빠른 생성만.
export function ProductSizeSelect({
  productId,
  value,
  onChange,
  emptyLabel = "— 미지정 —",
  className,
  disabled,
}: {
  productId: string;
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const sizes = useQuery({ ...productSizesQuery(productId), enabled: Boolean(productId) });
  const [creating, setCreating] = useState(false);

  return (
    <>
      <select
        className={className ?? selectClass}
        value={value}
        disabled={disabled || !productId}
        onChange={(e) => {
          if (e.target.value === NEW_VALUE) {
            setCreating(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{emptyLabel}</option>
        {(sizes.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {formatProductSizeLabel(s)}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW SIZE</option>
      </select>

      {creating &&
        productId &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="label-caps">NEW SIZE</span>
                <button
                  type="button"
                  className="label-caps px-2 py-2"
                  onClick={() => setCreating(false)}
                >
                  CLOSE
                </button>
              </div>
              <div className="p-4">
                <ProductSizeForm
                  productId={productId}
                  onDone={() => setCreating(false)}
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
