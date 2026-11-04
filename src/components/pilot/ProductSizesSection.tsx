import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cakeSizesQuery, currentUserId, productSizesQuery } from "@/lib/queries";
import { ensureStandardProfile } from "@/lib/standard-profile";
import { formatProductSizeLabel, type ProductSize } from "@/lib/product-size";
import { fmtCurrency } from "@/lib/cost";
import { SectionCard, Field, inputClass, primaryButtonClass } from "./ui";

/** Dimensions belong exclusively to cake_sizes. These rows edit business values only. */
export function ProductSizesSection({
  productId,
  usageTotals,
  costTotals,
  perCakeExtras = 0,
}: {
  productId: string;
  usageTotals?: Record<string, number>;
  costTotals?: Record<string, number>;
  perCakeExtras?: number;
}) {
  const sizes = useQuery(productSizesQuery(productId));
  const standards = useQuery(cakeSizesQuery());
  return (
    <SectionCard title="공용 완성 규격 · 제품별 판매가">
      <p className="mb-3 text-xs text-muted-foreground">
        모든 제품이 SETTINGS의 공용 완성 규격을 사용합니다. 이곳에서는 판매가·월 예상 수량만
        수정하며, 컴포넌트 사용량은 아래 구성에서 지정합니다.
      </p>
      {sizes.isError && (
        <p role="alert" className="text-destructive">
          {sizes.error.message}
        </p>
      )}
      {sizes.isLoading && <p className="text-sm">불러오는 중…</p>}
      <ul className="divide-y divide-border border border-border">
        {(sizes.data ?? []).map((size) => (
          <li key={size.id} className="p-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>
                {(standards.data ?? []).find((s) => s.id === size.cake_size_id)?.name ??
                  formatProductSizeLabel(size)}
              </span>
              <span>
                {size.selling_price == null ? "판매가 미지정" : fmtCurrency(size.selling_price)}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {usageTotals?.[size.id] != null
                ? `구성 목표 ${usageTotals[size.id]}g`
                : "구성 목표 미확정"}
              {costTotals?.[size.id] != null
                ? ` · 총원가 ${fmtCurrency(costTotals[size.id]! + perCakeExtras)}`
                : ""}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs underline">
                판매가 · 월 예상 수량 수정
              </summary>
              <StandardPricing
                key={`${size.id}:${size.updated_at}`}
                productId={productId}
                size={size}
              />
            </details>
          </li>
        ))}
      </ul>
      {!sizes.isLoading && !sizes.data?.length && (
        <p className="text-sm">SETTINGS에서 공용 완성 규격을 등록하세요.</p>
      )}
    </SectionCard>
  );
}

function StandardPricing({ productId, size }: { productId: string; size: ProductSize }) {
  const client = useQueryClient();
  const [price, setPrice] = useState(size.selling_price == null ? "" : String(size.selling_price));
  const [count, setCount] = useState(
    size.monthly_unit_count == null ? "" : String(size.monthly_unit_count),
  );
  const save = useMutation({
    mutationFn: async () => {
      const selling_price = price.trim() ? Number(price) : null;
      const monthly_unit_count = count.trim() ? Number(count) : null;
      if (selling_price != null && (!Number.isFinite(selling_price) || selling_price < 0))
        throw new Error("판매가는 0 이상으로 입력하세요");
      if (
        monthly_unit_count != null &&
        (!Number.isInteger(monthly_unit_count) || monthly_unit_count < 0)
      )
        throw new Error("월 예상 수량은 0 이상의 정수로 입력하세요");
      const uid = await currentUserId();
      const id = await ensureStandardProfile(productId, size.cake_size_id ?? "", size.id);
      if (!id) throw new Error("SETTINGS에서 공용 규격의 형태를 지정하세요");
      let request = supabase
        .from("product_sizes")
        .update({ selling_price, monthly_unit_count })
        .eq("id", id)
        .eq("user_id", uid);
      if (id === size.id) request = request.eq("updated_at", size.updated_at);
      const { error } = await request.select("id").single();
      if (error) throw new Error(`저장 실패 — 최신 값을 확인하세요: ${error.message}`);
    },
    onSuccess: async () => {
      await Promise.all(
        ["product_sizes", "cost_dashboard", "stock_candidates"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="판매가 (AUD)">
        <input
          aria-label="판매가 (AUD)"
          className={`${inputClass} !w-32`}
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>
      <Field label="월 예상 수량">
        <input
          aria-label="월 예상 수량"
          className={`${inputClass} !w-32`}
          type="number"
          min="0"
          step="1"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </Field>
      <button type="submit" className={primaryButtonClass} disabled={save.isPending}>
        {save.isPending ? "저장 중…" : "저장"}
      </button>
      {save.isError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {save.error.message}
        </p>
      )}
    </form>
  );
}
