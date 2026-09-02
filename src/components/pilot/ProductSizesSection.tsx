import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, productSizesQuery } from "@/lib/queries";
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
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

/**
 * Product 상세 화면의 SIZES 섹션.
 * product_sizes는 products의 child table — Mould(생산 도구)와는 독립적인 개념.
 * DB canonical unit은 mm, 이 UI는 cm로 입력/표시하고 저장 직전 mm로 변환한다.
 * Area/Volume은 저장하지 않고 lib/product-size.ts로 read-time 계산한다.
 */
export function ProductSizesSection({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const sizes = useQuery(productSizesQuery(productId));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product_sizes", productId] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_sizes").delete().eq("id", id);
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
                      <span className="label-caps text-xs text-muted-foreground">
                        {size.shape}
                      </span>
                      <span className="text-sm">{formatProductSizeLabel(size)}</span>
                    </div>
                    {calc && (
                      <p className="font-mono text-xs text-muted-foreground">
                        AREA {formatAreaCm2(calc.areaCm2)} · VOLUME {formatVolumeCm3(calc.volumeCm3)}
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

function ProductSizeForm({
  productId,
  existing,
  onDone,
}: {
  productId: string;
  existing?: ProductSize;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [shape, setShape] = useState<ProductSizeShape>((existing?.shape as ProductSizeShape) ?? "ROUND");
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

  const save = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const toMm = (v: string) => (v.trim() ? cmToMm(Number(v)) : null);

      const payload = {
        shape,
        diameter_mm: shape === "ROUND" ? toMm(diameterCm) : null,
        length_mm: shape === "RECTANGLE" ? toMm(lengthCm) : null,
        width_mm: shape === "RECTANGLE" ? toMm(widthCm) : null,
        height_mm: toMm(heightCm),
        is_default: isDefault,
        notes: notes.trim() || null,
      };

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
        const { error } = await supabase.from("product_sizes").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        if (isDefault) {
          const { error: clearError } = await supabase
            .from("product_sizes")
            .update({ is_default: false })
            .eq("product_id", productId)
            .eq("is_default", true);
          if (clearError) throw clearError;
        }
        const { error } = await supabase.from("product_sizes").insert({
          user_id: userId,
          product_id: productId,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product_sizes", productId] });
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

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        SET AS DEFAULT
      </label>

      <Field label="NOTES (OPTIONAL)">
        <input
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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
