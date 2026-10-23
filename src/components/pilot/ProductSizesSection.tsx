import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cakeSizesQuery, currentUserId, productSizesQuery } from "@/lib/queries";
import {
  calcProductSize,
  cmToMm,
  formatAreaCm2,
  formatProductSizeLabel,
  formatVolumeCm3,
  mmToCm,
  PRODUCT_SIZE_SHAPES,
  type ProductSize,
  type ProductSizeShape,
} from "@/lib/product-size";
import { completeGeometry, sameGeometry, sizeLinkIssue } from "@/lib/size-configuration";
import { fmtCurrency } from "@/lib/cost";
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

/**
 * Product 상세 화면의 SIZES 섹션.
 * product_sizes는 products의 child table — Mould(생산 도구, 반죽량 기준)와는 완전히 다른 개념이다
 * (2026-10-12 사용자 정정). 여기서 말하는 SIZE는 시트/크림/필링을 전부 조립·아이싱한 "완성된
 * 제품"의 외형 치수 기준이라, 특정 Mould를 골라서 치수를 대신 채우는 식으로 만들면 안 된다 —
 * 이 폼에는 Mould 선택 자체가 없다. SHAPE/치수는 완성 제품 실측값을 직접 입력한다.
 * 총중량(g)은 이 폼에서 입력하지 않는다 — COMPONENTS 섹션에서 이 사이즈에 연결한 각 COMPONENT의
 * quantity_g를 합산해 read-time으로 자동 계산한다(sumUsageBySize, $productId.tsx).
 * DB canonical unit은 mm, 이 UI는 cm로 입력/표시하고 저장 직전 mm로 변환한다.
 * Area/Volume은 저장하지 않고 lib/product-size.ts로 read-time 계산한다.
 */
export function ProductSizesSection({
  productId,
  usageTotals,
  costTotals,
  perCakeExtras,
}: {
  productId: string;
  /** sizeId → 그 사이즈에 연결된 컴포넌트 사용량(g) 합산 — COMPONENTS 섹션에서 계산해 넘겨준다.
   * 형태/치수(area/volume)와는 별개 개념이라 참고용으로만 나란히 보여준다. */
  usageTotals?: Record<string, number>;
  /** sizeId → 그 사이즈의 예상 원가(Raw Material, AUD) 합산 — usageTotals와 같은 규칙, COST 계산용. */
  costTotals?: Record<string, number>;
  /**
   * 케익(제품) 1개당 고정으로 더해지는 추가 원가(AUD, 사이즈 무관) — UTILITY+CONSUMABLE+PACKAGING
   * (PRODUCTION COST 항목 섹션에서 Product 단위로 배정) + OVERHEAD 배분(월 고정비÷월 케익 개수) 합계.
   * "배치" 기준은 폐기(2026-09-23) — 케익 하나에 Component가 몇 개 들어가는지에 따라 배치 횟수가
   * 무한히 배수될 수 있어 고정 기준으로 쓰기 애매하다는 판단.
   */
  perCakeExtras?: number;
}) {
  const queryClient = useQueryClient();
  const sizes = useQuery(productSizesQuery(productId));
  const cakeSizes = useQuery(cakeSizesQuery());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product_sizes", productId] });
    await queryClient.invalidateQueries({ queryKey: ["cost_dashboard"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Refuse deletion if it could cascade component targets or clear history links.
      const results = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("product_size_id", id),
        supabase
          .from("work_sessions")
          .select("id", { count: "exact", head: true })
          .eq("product_size_id", id),
        supabase
          .from("product_components")
          .select("id", { count: "exact", head: true })
          .eq("product_size_id", id),
        supabase
          .from("stock_items")
          .select("id", { count: "exact", head: true })
          .eq("product_size_id", id),
      ]);
      for (const result of results) {
        if (result.error) throw result.error;
      }
      if (results.some((result) => (result.count ?? 0) > 0))
        throw new Error("오더·세션·컴포넌트·재고에서 사용 중인 사이즈는 삭제할 수 없습니다.");
      const { error } = await supabase
        .from("product_sizes")
        .delete()
        .eq("id", id)
        .eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // partial unique index(product_sizes_one_default_idx)가 product당 default 1개만 허용하므로
      // 기존 default를 먼저 내린 뒤 대상 row를 default로 올린다.
      const { error: clearError } = await supabase
        .from("product_sizes")
        .update({ is_default: false })
        .eq("product_id", productId)
        .eq("is_default", true);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from("product_sizes")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = sizes.data ?? [];

  return (
    <SectionCard
      title="SIZES"
      action={
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setEditingId(null);
            setAdding((v) => !v);
          }}
        >
          {adding ? "CLOSE" : "+ ADD SIZE"}
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          공용 완성 규격을 연결하고 제품별 목표량·판매가를 관리합니다. 기존 기록은 자동 매핑하지
          않습니다. 제품별 사용량은 COMPONENTS에서 입력하세요.
        </p>
        {adding && (
          <ProductSizeForm
            productId={productId}
            onDone={() => {
              setAdding(false);
            }}
          />
        )}

        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO SIZES YET</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {rows.map((size) => {
              const calc = calcProductSize(size);
              if (editingId === size.id) {
                return (
                  <li key={size.id} className="px-3 py-3">
                    <ProductSizeForm
                      productId={productId}
                      existing={size}
                      onDone={() => setEditingId(null)}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={size.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {size.is_default && (
                        <span className="label-caps border border-foreground bg-foreground px-2 py-0.5 text-[11px] text-background">
                          DEFAULT
                        </span>
                      )}
                      <span className="label-caps text-xs text-muted-foreground">{size.shape}</span>
                      <span className="text-sm">{formatProductSizeLabel(size)}</span>
                    </div>
                    {(() => {
                      const usageTotal = usageTotals?.[size.id];
                      // 2026-10-12 사용자 요청: "총중량"은 이 사이즈에 연결된 모든 COMPONENT(시트+크림+
                      // 필링 등)의 quantity_g 자동 합산값 — 직접 입력하는 값이 아니다(수동 입력은
                      // COMPONENTS 섹션의 사이즈별 사용량 칸에서 함). AREA/VOLUME과는 별개 줄로 분리해
                      // 눈에 띄게 보여준다.
                      const totalWeightLabel =
                        usageTotal != null
                          ? `구성 목표 합계 ${usageTotal.toFixed(1).replace(/\.0$/, "")}g (실측 완성 중량과 별도)`
                          : "구성 목표 미확정 — COMPONENTS에서 사용량을 확인하세요";
                      const costTotal = costTotals?.[size.id];
                      const costLabel =
                        costTotal != null ? `RAW MATERIAL ${fmtCurrency(costTotal)}` : null;
                      const fullCost = costTotal != null ? costTotal + (perCakeExtras ?? 0) : null;
                      const monthlyCount = size.monthly_unit_count;
                      const monthlyCost =
                        fullCost != null && monthlyCount != null && monthlyCount > 0
                          ? fullCost * monthlyCount
                          : null;
                      const sellingPrice = size.selling_price;
                      const margin =
                        fullCost != null && sellingPrice != null ? sellingPrice - fullCost : null;
                      const marginPct =
                        margin != null && sellingPrice && sellingPrice > 0
                          ? (margin / sellingPrice) * 100
                          : null;
                      return (
                        <>
                          <p className="font-mono text-xs text-muted-foreground">
                            {totalWeightLabel}
                          </p>
                          {calc ? (
                            <p className="font-mono text-xs text-muted-foreground">
                              AREA {formatAreaCm2(calc.areaCm2)} · VOLUME{" "}
                              {formatVolumeCm3(calc.volumeCm3)}
                              {costLabel ? ` · ${costLabel}` : ""}
                            </p>
                          ) : costLabel ? (
                            <p className="font-mono text-xs text-muted-foreground">{costLabel}</p>
                          ) : null}
                          {fullCost != null && (
                            <p className="font-mono text-xs text-muted-foreground">
                              FULL PRODUCTION COST {fmtCurrency(fullCost)}
                            </p>
                          )}
                          {sellingPrice != null && (
                            <p className="font-mono text-xs text-muted-foreground">
                              판매가 {fmtCurrency(sellingPrice)}
                              {margin != null
                                ? ` · 마진 ${fmtCurrency(margin)}${marginPct != null ? ` (${marginPct.toFixed(0)}%)` : ""}`
                                : ""}
                            </p>
                          )}
                          {monthlyCount != null && (
                            <p className="font-mono text-xs text-muted-foreground">
                              월 예상 생산 {monthlyCount}개
                              {monthlyCost != null
                                ? ` · 월 예상 원가 ${fmtCurrency(monthlyCost)}`
                                : ""}
                            </p>
                          )}
                        </>
                      );
                    })()}
                    <p className="text-xs text-muted-foreground">
                      공용 규격:{" "}
                      {(cakeSizes.data ?? []).find((c) => c.id === size.cake_size_id)?.name ??
                        "제품 전용"}
                    </p>
                    {size.cake_size_id &&
                      sizeLinkIssue(
                        size,
                        (cakeSizes.data ?? []).find((c) => c.id === size.cake_size_id),
                      ) && (
                        <p className="text-xs text-destructive">
                          {sizeLinkIssue(
                            size,
                            (cakeSizes.data ?? []).find((c) => c.id === size.cake_size_id),
                          )}
                        </p>
                      )}
                    {size.notes && <p className="text-xs text-muted-foreground">{size.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!size.is_default && (
                      <button
                        type="button"
                        className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setDefault.mutate(size.id)}
                      >
                        SET DEFAULT
                      </button>
                    )}
                    <button
                      type="button"
                      className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(size.id);
                      }}
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        if (confirm("DELETE THIS SIZE?")) remove.mutate(size.id);
                      }}
                    >
                      DELETE
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {(remove.isError || setDefault.isError) && (
          <p className="font-mono text-xs uppercase text-destructive">
            {((remove.error ?? setDefault.error) as Error).message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

// 2026-10-20 사용자 요청: ORDER 상세의 "최종 사이즈" 드롭다운도 MouldSelect처럼 그 자리에서
// "+ NEW SIZE"로 바로 만들 수 있어야 한다(ProductSizeSelect.tsx가 이 폼을 재사용) — 새로
// 만든 경우에만 onCreated로 새 id를 알려줘서 드롭다운이 바로 그 사이즈를 선택하게 한다.
export function ProductSizeForm({
  productId,
  existing,
  onDone,
  onCreated,
}: {
  productId: string;
  existing?: ProductSize;
  onDone: () => void;
  onCreated?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const cakeSizes = useQuery(cakeSizesQuery());
  const [cakeSizeId, setCakeSizeId] = useState(existing?.cake_size_id ?? "");
  const [shape, setShape] = useState<ProductSizeShape>(
    (existing?.shape as ProductSizeShape) ?? "ROUND",
  );
  const [diameterCm, setDiameterCm] = useState(
    existing?.diameter_mm != null ? String(mmToCm(existing.diameter_mm)) : "",
  );
  const [lengthCm, setLengthCm] = useState(
    existing?.length_mm != null ? String(mmToCm(existing.length_mm)) : "",
  );
  const [widthCm, setWidthCm] = useState(
    existing?.width_mm != null ? String(mmToCm(existing.width_mm)) : "",
  );
  const [heightCm, setHeightCm] = useState(
    existing?.height_mm != null ? String(mmToCm(existing.height_mm)) : "",
  );
  const [isDefault, setIsDefault] = useState(existing?.is_default ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [monthlyUnitCount, setMonthlyUnitCount] = useState(
    existing?.monthly_unit_count != null ? String(existing.monthly_unit_count) : "",
  );
  const [sellingPrice, setSellingPrice] = useState(
    existing?.selling_price != null ? String(existing.selling_price) : "",
  );

  const save = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const toMm = (v: string) => (v.trim() ? cmToMm(Number(v)) : null);

      const payload = {
        shape,
        cake_size_id: cakeSizeId || null,
        diameter_mm: shape === "ROUND" ? toMm(diameterCm) : null,
        length_mm: shape === "RECTANGLE" ? toMm(lengthCm) : null,
        width_mm: shape === "RECTANGLE" ? toMm(widthCm) : null,
        height_mm: toMm(heightCm),
        is_default: isDefault,
        notes: notes.trim() || null,
        monthly_unit_count: monthlyUnitCount.trim() ? Number(monthlyUnitCount) : null,
        selling_price: sellingPrice.trim() ? Number(sellingPrice) : null,
      };

      if (!completeGeometry(payload)) throw new Error("완성 형태와 양수 치수를 모두 입력하세요.");
      const picked = (cakeSizes.data ?? []).find((c) => c.id === cakeSizeId);
      const changedGeometry =
        !existing || !sameGeometry(existing, payload) || cakeSizeId !== existing.cake_size_id;
      if (cakeSizeId && changedGeometry && (!picked || !sameGeometry(payload, picked)))
        throw new Error(
          "공용 규격과 치수가 다르거나 누락됐습니다. 규격을 다시 선택하거나 제품 전용으로 분리하세요.",
        );
      if (existing) {
        // is_default를 켜는 경우: partial unique index 충돌을 피하기 위해 기존 default를 먼저 내린다.
        if (isDefault && !existing.is_default) {
          const { error: clearError } = await supabase
            .from("product_sizes")
            .update({ is_default: false })
            .eq("product_id", productId)
            .eq("is_default", true);
          if (clearError) throw clearError;
        }
        const { error } = await supabase
          .from("product_sizes")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        return existing.id;
      } else {
        if (isDefault) {
          const { error: clearError } = await supabase
            .from("product_sizes")
            .update({ is_default: false })
            .eq("product_id", productId)
            .eq("is_default", true);
          if (clearError) throw clearError;
        }
        const { data, error } = await supabase
          .from("product_sizes")
          .insert({
            user_id: userId,
            product_id: productId,
            ...payload,
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["product_sizes", productId] });
      await queryClient.invalidateQueries({ queryKey: ["cost_dashboard"] });
      if (!existing) onCreated?.(id);
      onDone();
    },
  });

  return (
    <form
      className="space-y-3 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="font-mono text-[11px] text-muted-foreground">
        시트/크림/필링을 전부 조립·아이싱한 완성 제품의 실측 외형 치수를 입력하세요 (MOULD 기준이
        아님 — MOULD는 FORMULA 배수 계산용 별개 개념입니다).
      </p>

      <Field label="공용 완성 규격 (선택하면 치수 불러오기)">
        <select
          className={selectClass}
          value={cakeSizeId}
          onChange={(e) => {
            const id = e.target.value;
            setCakeSizeId(id);
            const picked = (cakeSizes.data ?? []).find((c) => c.id === id);
            const dims = picked ? completeGeometry(picked) : null;
            if (!dims) return;
            setShape(dims.shape as ProductSizeShape);
            setDiameterCm(dims.diameter_mm != null ? String(mmToCm(dims.diameter_mm)) : "");
            setLengthCm(dims.length_mm != null ? String(mmToCm(dims.length_mm)) : "");
            setWidthCm(dims.width_mm != null ? String(mmToCm(dims.width_mm)) : "");
            setHeightCm(dims.height_mm != null ? String(mmToCm(dims.height_mm)) : "");
          }}
        >
          <option value="">— 제품 전용 치수 —</option>
          {(cakeSizes.data ?? []).map((c) => (
            <option key={c.id} value={c.id} disabled={!completeGeometry(c) && c.id !== cakeSizeId}>
              {c.name} · {formatProductSizeLabel({ ...c, shape: c.shape ?? "" })} · #
              {c.id.slice(0, 8)}
              {!completeGeometry(c) ? " · 치수 확인 필요" : ""}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-muted-foreground">
        기존 규격 치수를 수정해도 이 제품의 기록을 자동 변경하지 않습니다. 실제 치수가 다르면 제품
        전용으로 분리하거나 올바른 규격을 명시적으로 선택하세요.
      </p>
      <Field label="SHAPE">
        <select
          className={selectClass}
          value={shape}
          onChange={(e) => setShape(e.target.value as ProductSizeShape)}
        >
          {PRODUCT_SIZE_SHAPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {shape === "ROUND" ? (
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[8rem] flex-1">
            <Field label="DIAMETER (CM)">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className={inputClass}
                value={diameterCm}
                onChange={(e) => setDiameterCm(e.target.value)}
              />
            </Field>
          </div>
          <div className="min-w-[8rem] flex-1">
            <Field label="HEIGHT (CM)">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className={inputClass}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[7rem] flex-1">
            <Field label="LENGTH (CM)">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className={inputClass}
                value={lengthCm}
                onChange={(e) => setLengthCm(e.target.value)}
              />
            </Field>
          </div>
          <div className="min-w-[7rem] flex-1">
            <Field label="WIDTH (CM)">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className={inputClass}
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
              />
            </Field>
          </div>
          <div className="min-w-[7rem] flex-1">
            <Field label="HEIGHT (CM)">
              <input
                type="number"
                step="0.1"
                min="0"
                required
                className={inputClass}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[10rem] flex-1">
          <Field label="월 예상 생산개수 (OPTIONAL)">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              className={inputClass}
              value={monthlyUnitCount}
              onChange={(e) => setMonthlyUnitCount(e.target.value)}
            />
          </Field>
        </div>
        <div className="min-w-[10rem] flex-1">
          <Field label="판매가 (AUD, OPTIONAL)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputClass}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        SET AS DEFAULT
      </label>

      <Field label="NOTES (OPTIONAL)">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {save.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(save.error as Error).message}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={save.isPending}>
          {existing ? "SAVE" : "CREATE"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
