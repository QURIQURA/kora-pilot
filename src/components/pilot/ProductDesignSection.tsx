import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  ingredientsQuery,
  productAllergenIngredientsQuery,
  productPreferredIngredientsQuery,
  type ProductIngredientTagRow,
} from "@/lib/queries";
import type { Product } from "@/lib/pilot";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { Field, SectionCard, inputClass } from "./ui";

/**
 * PRODUCT DESIGN — 타겟 고객 디테일 + 선호 재료 + 알레르기 유무/재료.
 * "Secret Husband Cake"류(예: Weekly Surprise Cake) 제품군처럼 매 Product가 특정 고객
 * 한 명(부부/가족)을 위한 맞춤 케이크일 때 주로 쓰인다 — 일반 레시피 R&D와는 다른,
 * Product 개별 고객 정보 저장용 섹션. PRODUCT TARGET(맛/질감 목표)과는 별개 개념이다.
 */
export function ProductDesignSection({ productId, product }: { productId: string; product: Product }) {
  const queryClient = useQueryClient();
  const preferred = useQuery(productPreferredIngredientsQuery(productId));
  const allergens = useQuery(productAllergenIngredientsQuery(productId));

  const updateProduct = useMutation({
    mutationFn: async (patch: TablesUpdate<"products">) => {
      const { error } = await supabase.from("products").update(patch).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products", productId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const [customerDraft, setCustomerDraft] = useState(product.target_customer_notes ?? "");
  useEffect(() => setCustomerDraft(product.target_customer_notes ?? ""), [product.target_customer_notes]);

  const [allergyNotesDraft, setAllergyNotesDraft] = useState(product.allergy_notes ?? "");
  useEffect(() => setAllergyNotesDraft(product.allergy_notes ?? ""), [product.allergy_notes]);

  return (
    <SectionCard title="PRODUCT DESIGN">
      <div className="space-y-4">
        <Field label="TARGET CUSTOMER (타겟 고객 디테일)">
          <textarea
            rows={3}
            className={inputClass}
            value={customerDraft}
            onChange={(e) => setCustomerDraft(e.target.value)}
            onBlur={() => {
              if (customerDraft !== (product.target_customer_notes ?? ""))
                updateProduct.mutate({ target_customer_notes: customerDraft.trim() || null });
            }}
            placeholder="예: 결혼기념일 서프라이즈, 아내 취향(과일 케이크 선호), 자녀 이름 등"
          />
        </Field>

        <div className="space-y-2">
          <p className="label-caps text-xs text-muted-foreground">선호 재료</p>
          <IngredientTagEditor
            productId={productId}
            table="product_preferred_ingredients"
            queryKeyName="product_preferred_ingredients"
            rows={preferred.data ?? []}
            emptyMessage="등록된 선호 재료 없음"
          />
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={product.has_allergies}
              onChange={(e) => updateProduct.mutate({ has_allergies: e.target.checked })}
            />
            알러지 있음
          </label>
          {product.has_allergies && (
            <>
              <IngredientTagEditor
                productId={productId}
                table="product_allergen_ingredients"
                queryKeyName="product_allergen_ingredients"
                rows={allergens.data ?? []}
                emptyMessage="등록된 알레르기 재료 없음"
              />
              <Field label="ALLERGY NOTES">
                <textarea
                  rows={2}
                  className={inputClass}
                  value={allergyNotesDraft}
                  onChange={(e) => setAllergyNotesDraft(e.target.value)}
                  onBlur={() => {
                    if (allergyNotesDraft !== (product.allergy_notes ?? ""))
                      updateProduct.mutate({ allergy_notes: allergyNotesDraft.trim() || null });
                  }}
                  placeholder="예: 견과류 알러지, 교차오염 주의"
                />
              </Field>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** 선호 재료/알레르기 재료 공용 태그 편집기 — 항상 Ingredient Master에서 정확히 일치하는
 * 이름만 추가한다(모호한 매칭 금지, 앱 전체 컨벤션과 동일). */
function IngredientTagEditor({
  productId,
  table,
  queryKeyName,
  rows,
  emptyMessage,
}: {
  productId: string;
  table: "product_preferred_ingredients" | "product_allergen_ingredients";
  queryKeyName: string;
  rows: ProductIngredientTagRow[];
  emptyMessage: string;
}) {
  const queryClient = useQueryClient();
  const ingredients = useQuery(ingredientsQuery());
  const [name, setName] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: [queryKeyName, productId] });
  };

  const linkedIds = rows.map((r) => r.ingredient_id);

  const add = useMutation({
    mutationFn: async (ingredientId: string) => {
      const userId = await currentUserId();
      const { error } = await supabase
        .from(table)
        .insert({ user_id: userId, product_id: productId, ingredient_id: ingredientId });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const datalistId = `${table}-datalist-${productId}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {rows.map((r) => (
          <span
            key={r.id}
            className="label-caps inline-flex items-center gap-2 border border-border px-2 py-1 text-[11px]"
          >
            {r.ingredients?.name ?? "—"}
            <button type="button" onClick={() => remove.mutate(r.id)}>
              ×
            </button>
          </span>
        ))}
        {rows.length === 0 && (
          <p className="font-mono text-xs uppercase text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const match = (ingredients.data ?? []).find(
            (i) => i.name.toLowerCase() === name.trim().toLowerCase(),
          );
          if (!match) return; // Ingredient Master에 정확히 일치하는 이름이 없으면 추가하지 않는다
          if (!linkedIds.includes(match.id)) add.mutate(match.id);
          setName("");
        }}
      >
        <input
          list={datalistId}
          className={inputClass + " w-56"}
          placeholder="재료 검색해서 추가"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id={datalistId}>
          {(ingredients.data ?? []).map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        <button type="submit" className="label-caps px-2 text-xs">
          + ADD
        </button>
      </form>
    </div>
  );
}
