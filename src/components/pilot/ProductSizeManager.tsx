import { useState } from "react";
import { ProductSelect } from "./ProductSelect";
import { ProductSizesSection } from "./ProductSizesSection";
import { Field } from "./ui";

/**
 * SETTINGS의 PRODUCT SIZES 관리 섹션.
 * 2026-10-20 사용자 요청: "최종케익사이즈도 몰드 관리하는 것처럼 설정에서 관리하도록" — 다만
 * product_sizes는 moulds와 달리 PRODUCT별 child table(제품마다 자기 사이즈 목록을 가짐)이라,
 * MouldManager처럼 전체를 한 목록에 바로 보여줄 수는 없다. 여기서 먼저 PRODUCT를 고르면, 그
 * PRODUCT의 SIZES 섹션(PRODUCT 상세 페이지와 완전히 동일한 컴포넌트, ProductSizesSection)이
 * 그대로 나타난다 — 생성/수정/삭제/DEFAULT 지정 전부 PRODUCT 상세에 갈 필요 없이 여기서 가능.
 */
export function ProductSizeManager() {
  const [productId, setProductId] = useState("");

  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] text-muted-foreground">
        사이즈는 PRODUCT별로 관리됩니다 — 먼저 PRODUCT를 고르세요.
      </p>
      <Field label="PRODUCT">
        <ProductSelect value={productId} onChange={setProductId} emptyLabel="— PRODUCT 선택 —" />
      </Field>
      {productId ? (
        <ProductSizesSection productId={productId} />
      ) : (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          PRODUCT를 고르면 그 제품의 SIZES가 여기 나타납니다.
        </p>
      )}
    </div>
  );
}
