import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import {
  categoriesQuery,
  componentCostsQuery,
  componentsQuery,
  currentUserId,
  experimentsByProductQuery,
  formulasByComponentQuery,
  ingredientsQuery,
  knowledgeEntriesByProductQuery,
  observationsByProductQuery,
  pilotSettingsQuery,
  productComponentsQuery,
  productCostItemsQuery,
  productQuery,
  productSizesQuery,
  productTagsQuery,
  tagsQuery,
  versionIngredientsQuery,
  type ComponentCostInfo,
  type ProductComponentRow,
} from "@/lib/queries";
import { costPerGram, fmtCurrency, overheadPerUnit, sumCostItemAssignments } from "@/lib/cost";
import { ProductCostItemsSection } from "@/components/pilot/ProductCostItemsSection";
import { fmtNumber, toGrams } from "@/lib/formula";
import { KnowledgeCreateForm, KnowledgeList } from "@/components/pilot/KnowledgeSection";
import {
  categoryPath,
  DEFAULT_TARGET_KEYS,
  parseTarget,
  type TargetAttribute,
} from "@/lib/pilot";
import { formatProductSizeLabel, type ProductSize } from "@/lib/product-size";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { experimentLabel } from "@/lib/experiment";
import { formatDateTime, formatTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { ProductFormulasSection } from "@/components/pilot/FormulaSummary";
import { ProductSizesSection } from "@/components/pilot/ProductSizesSection";
import { ProductDesignSection } from "@/components/pilot/ProductDesignSection";
import { ProductImagesSection } from "@/components/pilot/ProductImagesSection";
import { ExperimentListItems } from "@/components/pilot/ExperimentList";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/products/$productId")({
  head: () => ({
    meta: [
      { title: "PILOT — Product Detail" },
      { name: "description", content: "Product target, components and notes" },
      { property: "og:title", content: "PILOT — Product Detail" },
      {
        property: "og:description",
        content: "Product target, components and notes",
      },
    ],
  }),
  component: ProductDetailPage,
});

/** COMPONENTS 섹션에 묶여 표시되는 한 그룹 — COMPONENT 링크 또는 재료(원물) 직접 링크(2026-09-23). */
interface LinkGroup {
  key: string;
  kind: "component" | "ingredient";
  /** kind==="component"일 때만 값 있음 */
  componentId: string | null;
  /** kind==="ingredient"일 때만 값 있음 */
  ingredientId: string | null;
  name: string;
  rows: ProductComponentRow[];
}

/** COMPONENTS 목록을 컴포넌트(또는 재료 직접 링크)별로 묶는다 — 사이즈별 사용량 행이 여러 개여도 한 그룹으로 표시. */
function groupComponentLinks(rows: ProductComponentRow[]): LinkGroup[] {
  const byKey = new Map<string, LinkGroup>();
  for (const row of rows) {
    const isIngredient = row.component_id == null;
    const key = isIngredient ? `ingredient:${row.ingredient_id}` : `component:${row.component_id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      byKey.set(key, {
        key,
        kind: isIngredient ? "ingredient" : "component",
        componentId: row.component_id,
        ingredientId: row.ingredient_id,
        name: isIngredient ? (row.ingredients?.name ?? "—") : (row.components?.name ?? "—"),
        rows: [row],
      });
    }
  }
  // 사이즈 미지정(null) 행을 먼저, 그다음 sort_order 순
  for (const group of byKey.values()) {
    group.rows.sort((a, b) => {
      if ((a.product_size_id == null) !== (b.product_size_id == null)) {
        return a.product_size_id == null ? -1 : 1;
      }
      return a.sort_order - b.sort_order;
    });
  }
  return [...byKey.values()];
}

function sizeLabelFor(sizes: ProductSize[], sizeId: string): string {
  const size = sizes.find((s) => s.id === sizeId);
  return size ? formatProductSizeLabel(size) : "삭제된 사이즈";
}

/** 각 Product Size별 재료 합산 총중량(g) — 사이즈에 연결된 모든 컴포넌트의 quantity_g 합.
 * 사이즈 미지정 행은 특정 사이즈에 속하지 않으므로 합산에서 제외한다. */
function sumUsageBySize(rows: ProductComponentRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    if (row.product_size_id && row.quantity_g != null) {
      totals[row.product_size_id] = (totals[row.product_size_id] ?? 0) + Number(row.quantity_g);
    }
  }
  return totals;
}

/** 이 사용량 행 1개의 예상 원가(원) — 사용량(g) × g당 단가.
 * COMPONENT 링크는 그 COMPONENT의 CURRENT FORMULA 기준, 재료 직접 링크는 그 재료의 구입가 기준(2026-09-23).
 * 정보가 없으면 null. */
function rowCost(
  row: ProductComponentRow,
  costsByComponent: Record<string, ComponentCostInfo>,
): number | null {
  if (row.quantity_g == null) return null;
  const cpg =
    row.component_id != null
      ? (costsByComponent[row.component_id]?.costPerGram ?? null)
      : costPerGram(row.ingredients);
  if (cpg == null) return null;
  return Number(row.quantity_g) * cpg;
}

/** 사이즈별 예상 원가 합산(원) — sumUsageBySize와 같은 규칙으로 사이즈 지정 행만 합산. */
function sumCostBySize(
  rows: ProductComponentRow[],
  costsByComponent: Record<string, ComponentCostInfo>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    if (!row.product_size_id) continue;
    const cost = rowCost(row, costsByComponent);
    if (cost == null) continue;
    totals[row.product_size_id] = (totals[row.product_size_id] ?? 0) + cost;
  }
  return totals;
}

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const product = useQuery(productQuery(productId));
  const categories = useQuery(categoriesQuery());
  const links = useQuery(productComponentsQuery(productId));
  const sizes = useQuery(productSizesQuery(productId));
  const tags = useQuery(tagsQuery());
  const productTags = useQuery(productTagsQuery(productId));
  const experiments = useQuery(experimentsByProductQuery(productId));
  const observations = useQuery(observationsByProductQuery(productId));
  const componentIds = [
    ...new Set((links.data ?? []).map((l) => l.component_id).filter((id): id is string => id != null)),
  ];
  const componentCosts = useQuery(componentCostsQuery(componentIds));
  const costsByComponent = componentCosts.data ?? {};

  // FULL PRODUCTION COST(2026-09-23) — UTILITY/CONSUMABLE/PACKAGING은 전부 케익(제품) 1개당
  // 고정 배정(Product 단위)이고, OVERHEAD도 월 고정비÷월 케익 개수로 케익 1개당 동일하게 더해진다.
  // "배치" 기준(Component별로 배수됨)은 폐기 — 사용자 판단(케익에 들어가는 Component 개수만큼
  // 배치 횟수가 무한히 늘어나 고정 기준으로 쓰기 애매함).
  const pilotSettings = useQuery(pilotSettingsQuery());
  const overheadPerCake =
    overheadPerUnit(
      pilotSettings.data
        ? {
            monthly_overhead: pilotSettings.data.monthly_overhead,
            monthly_unit_count: pilotSettings.data.monthly_unit_count,
          }
        : null,
    ) ?? 0;
  const productCostItems = useQuery(productCostItemsQuery(productId));
  const perCakeExtras = sumCostItemAssignments(productCostItems.data ?? []) + overheadPerCake;

  const categoryList = categories.data ?? [];
  const path = categoryPath(categoryList, product.data?.category_id ?? null);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "PRODUCTS", path: "/products" },
    ...path.map((c) => ({ label: c.name })),
    { label: (product.data?.name ?? "…").toUpperCase() },
  ]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["products", productId] });
  };

  const updateProduct = useMutation({
    mutationFn: async (patch: TablesUpdate<"products">) => {
      const { error } = await supabase.from("products").update(patch).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const invalidateLinks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product_components", productId] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  // 그룹 전체 UNLINK — 사이즈별로 나뉜 사용량 행이 여러 개여도 그 그룹(COMPONENT 또는 재료)의 모든 행을 지운다.
  const unlink = useMutation({
    mutationFn: async (group: { componentId: string | null; ingredientId: string | null }) => {
      let query = supabase.from("product_components").delete().eq("product_id", productId);
      query = group.componentId != null
        ? query.eq("component_id", group.componentId)
        : query.eq("ingredient_id", group.ingredientId as string);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: invalidateLinks,
  });

  const updateUsage = useMutation({
    mutationFn: async ({
      linkId,
      patch,
    }: {
      linkId: string;
      patch: { formula_version_id?: string | null; quantity_g?: number | null };
    }) => {
      const { error } = await supabase.from("product_components").update(patch).eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
    },
  });

  // 사이즈별 사용량 행 하나만 제거 (컴포넌트 전체 UNLINK와 달리 다른 사이즈 행은 남긴다)
  const removeUsageRow = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("product_components").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: invalidateLinks,
  });

  // 이미 링크된 그룹(COMPONENT 또는 재료)에 특정 Product Size 전용 사용량 행을 추가한다
  const addSizeUsage = useMutation({
    mutationFn: async ({
      componentId,
      ingredientId,
      productSizeId,
      sortOrder,
    }: {
      componentId: string | null;
      ingredientId: string | null;
      productSizeId: string | null;
      sortOrder: number;
    }) => {
      const userId = await currentUserId();
      const { error } = await supabase.from("product_components").insert({
        user_id: userId,
        product_id: productId,
        component_id: componentId,
        ingredient_id: ingredientId,
        product_size_id: productSizeId,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidateLinks,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      void navigate({ to: "/products" });
    },
  });

  const [adding, setAdding] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);

  if (product.isLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }
  if (!product.data) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">PRODUCT NOT FOUND</p>;
  }

  const data = product.data;
  const linkedTagIds = (productTags.data ?? []).map((t) => t.tag_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineName value={data.name} onSave={(name) => updateProduct.mutate({ name })} />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            CREATED {formatDateTime(data.created_at)} · UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CategorySelect
            className={selectClass + " w-auto"}
            value={data.category_id ?? ""}
            onChange={(id) => updateProduct.mutate({ category_id: id || null })}
            emptyLabel="NO CATEGORY"
          />
        </div>
      </div>

      <ProductImagesSection productId={productId} product={data} />

      <ProductDesignSection productId={productId} product={data} />

      <TargetSection
        target={parseTarget(data.product_target)}
        onSave={(next) => updateProduct.mutate({ product_target: next })}
      />

      <TagEditor productId={productId} allTags={tags.data ?? []} linkedTagIds={linkedTagIds} />

      <SectionCard
        title="COMPONENTS & PRODUCT-SPECIFIC ADJUSTMENT"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setAdding((v) => !v);
                setAddingIngredient(false);
              }}
            >
              {adding ? "CLOSE" : "+ ADD COMPONENT"}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setAddingIngredient((v) => !v);
                setAdding(false);
              }}
            >
              {addingIngredient ? "CLOSE" : "+ ADD INGREDIENT"}
            </button>
          </div>
        }
      >
        {adding && (
          <AddComponentPanel
            productId={productId}
            linkedIds={[
              ...new Set(
                (links.data ?? []).map((l) => l.component_id).filter((id): id is string => id != null),
              ),
            ]}
            onDone={() => setAdding(false)}
          />
        )}
        {addingIngredient && (
          <AddIngredientPanel
            productId={productId}
            linkedIds={[
              ...new Set(
                (links.data ?? []).map((l) => l.ingredient_id).filter((id): id is string => id != null),
              ),
            ]}
            onDone={() => setAddingIngredient(false)}
          />
        )}
        {(links.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO COMPONENTS LINKED</p>
        ) : (
          <>
          <ul className="divide-y divide-border border border-border">
            {groupComponentLinks(links.data ?? []).map((group) => {
              // 예상원가 합계는 사이즈가 지정된 행만 합산한다 — 사이즈 미지정 행은 어느 사이즈의
              // 원가에도 속하지 않아 합산에 넣으면 SIZES 섹션의 사이즈별 원가와 안 맞게 된다.
              const sizedRows = group.rows.filter((r) => r.product_size_id != null);
              const groupCosts = sizedRows.map((r) => rowCost(r, costsByComponent));
              const groupTotal = groupCosts.some((c) => c != null)
                ? groupCosts.reduce((sum: number, c) => sum + (c ?? 0), 0)
                : null;
              const groupHasMissingPrice =
                group.kind === "component"
                  ? (costsByComponent[group.componentId as string]?.hasMissingPrice ?? false)
                  : costPerGram(group.rows[0]?.ingredients) == null;
              return (
              <li key={group.key} className="space-y-3 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {group.kind === "component" ? (
                    <Link
                      to="/components/$componentId"
                      params={{ componentId: group.componentId as string }}
                      className="text-sm hover:underline"
                    >
                      {group.name}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-sm">
                      <Link
                        to="/ingredients/$ingredientId"
                        params={{ ingredientId: group.ingredientId as string }}
                        className="hover:underline"
                      >
                        {group.name}
                      </Link>
                      <span className="label-caps text-[10px] text-muted-foreground">재료 직접 링크</span>
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {groupTotal != null && (
                      <span className="label-caps text-xs text-muted-foreground">
                        예상원가 {fmtCurrency(groupTotal)}
                        {groupHasMissingPrice ? "*" : ""}
                      </span>
                    )}
                  <button
                    type="button"
                    className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (
                        confirm(
                          group.kind === "component"
                            ? "이 COMPONENT의 모든 사이즈별 사용량이 함께 삭제됩니다. UNLINK 할까요?"
                            : "이 재료의 모든 사이즈별 사용량이 함께 삭제됩니다. UNLINK 할까요?",
                        )
                      )
                        unlink.mutate({ componentId: group.componentId, ingredientId: group.ingredientId });
                    }}
                  >
                    UNLINK
                  </button>
                  </div>
                </div>
                {group.rows.map((link) => (
                  <div key={link.id} className="space-y-1.5 border-l-2 border-border pl-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="label-caps text-[11px] text-muted-foreground">
                        {link.product_size_id
                          ? sizeLabelFor(sizes.data ?? [], link.product_size_id)
                          : "전체 (사이즈 미지정)"}
                      </span>
                      {group.rows.length > 1 && (
                        <button
                          type="button"
                          className="label-caps px-1 text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => removeUsageRow.mutate(link.id)}
                        >
                          이 사이즈 행 제거
                        </button>
                      )}
                    </div>
                    <ComponentUsageEditor
                      link={link}
                      onSave={(patch) => updateUsage.mutate({ linkId: link.id, patch })}
                    />
                    {(() => {
                      if (link.product_size_id == null) {
                        return (
                          <p className="font-mono text-[11px] text-destructive">
                            ⚠ 사이즈 미지정 — 원가 계산에서 제외됩니다. 사이즈를 지정하세요.
                          </p>
                        );
                      }
                      const cost = rowCost(link, costsByComponent);
                      if (link.quantity_g == null) return null;
                      return (
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {cost != null
                            ? `예상원가 ${fmtCurrency(cost)}`
                            : link.component_id != null
                              ? "원가 정보 없음 — COMPONENT에 CURRENT FORMULA/재료 구입가를 확인하세요"
                              : "원가 정보 없음 — 이 재료에 구입가를 확인하세요"}
                        </p>
                      );
                    })()}
                  </div>
                ))}
                {(() => {
                  const availableSizes = (sizes.data ?? []).filter(
                    (s) => !group.rows.some((r) => r.product_size_id === s.id),
                  );
                  if (availableSizes.length === 0) return null;
                  return (
                    <select
                      className={selectClass + " w-auto"}
                      value=""
                      onChange={(e) => {
                        const sizeId = e.target.value;
                        if (!sizeId) return;
                        addSizeUsage.mutate({
                          componentId: group.componentId,
                          ingredientId: group.ingredientId,
                          productSizeId: sizeId,
                          sortOrder: group.rows.length,
                        });
                      }}
                    >
                      <option value="">+ 사이즈별 사용량 추가…</option>
                      {availableSizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatProductSizeLabel(s)}
                          {s.is_default ? " (DEFAULT)" : ""}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </li>
              );
            })}
          </ul>
          </>
        )}
      </SectionCard>

      <SectionCard title="NOTES">
        <NotesEditor value={data.notes ?? ""} onSave={(notes) => updateProduct.mutate({ notes })} />
      </SectionCard>

      <ProductSizesSection
        productId={productId}
        usageTotals={sumUsageBySize(links.data ?? [])}
        costTotals={sumCostBySize(links.data ?? [], costsByComponent)}
        perCakeExtras={perCakeExtras}
      />

      <ProductCostItemsSection productId={productId} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProductFormulasSection productId={productId} />
        <SectionCard
          title="DEVELOPMENT HISTORY"
          action={
            <Link to="/experiments" className="label-caps px-2 py-2 text-xs hover:bg-secondary">
              VIEW ALL
            </Link>
          }
        >
          <ExperimentListItems items={experiments.data ?? []} />
        </SectionCard>
        <SectionCard title="OBSERVATIONS">
          {(observations.data ?? []).length === 0 ? (
            <p className="font-mono text-xs uppercase text-muted-foreground">NO OBSERVATIONS YET</p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {(observations.data ?? []).map((obs) => (
                <li key={obs.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-14 font-mono text-xs text-muted-foreground">
                    {formatTime(obs.created_at)}
                  </span>
                  <span className="label-caps bg-foreground px-2 py-0.5 text-[11px] text-background">
                    {(obs.label || "NOTE").toUpperCase()}
                  </span>
                  <span className="min-w-[8rem] flex-1 text-sm">{obs.value}</span>
                  {obs.experiments && (
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: obs.experiments.id }}
                      className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {experimentLabel(obs.experiments.experiment_number)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <ProductKnowledgeSection productId={productId} />
      </div>

      <div className="pt-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            if (confirm("DELETE THIS PRODUCT?")) remove.mutate();
          }}
        >
          DELETE PRODUCT
        </button>
      </div>
    </div>
  );
}

function InlineName({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-lg text-foreground outline-none hover:border-border focus:border-foreground"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
    />
  );
}

function NotesEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      rows={5}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      placeholder="NOTES"
    />
  );
}

function TargetSection({
  target,
  onSave,
}: {
  target: TargetAttribute[];
  onSave: (next: TargetAttribute[]) => void;
}) {
  const rows = useMemo(() => {
    const existing = new Map(target.map((t) => [t.key, t]));
    const base = DEFAULT_TARGET_KEYS.map(
      (key) => existing.get(key) ?? { key, value: "", note: "" },
    );
    const custom = target.filter((t) => !DEFAULT_TARGET_KEYS.includes(t.key as never));
    return [...base, ...custom];
  }, [target]);

  const [newKey, setNewKey] = useState("");

  const commit = (key: string, patch: Partial<TargetAttribute>) => {
    const next = rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
    onSave(next.filter((row) => row.value || row.note));
  };

  return (
    <SectionCard
      title="PRODUCT TARGET"
      action={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const key = newKey.trim().toUpperCase();
            if (!key || rows.some((r) => r.key === key)) return;
            onSave([...rows.filter((r) => r.value || r.note), { key, value: "", note: "" }]);
            setNewKey("");
          }}
        >
          <input
            className="min-h-[36px] w-32 border border-input bg-background px-2 font-mono text-xs uppercase outline-none focus:border-foreground"
            placeholder="ATTRIBUTE"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <button type="submit" className="label-caps px-2 text-xs">
            + ADD
          </button>
        </form>
      }
    >
      <ul className="divide-y divide-border border border-border">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-1 gap-2 px-3 py-2 md:grid-cols-12 md:items-center"
          >
            <span className="label-caps col-span-3 text-xs text-muted-foreground">{row.key}</span>
            <input
              className="col-span-4 min-h-[40px] border border-input bg-background px-2 text-sm outline-none focus:border-foreground"
              defaultValue={row.value}
              placeholder="VALUE"
              onBlur={(e) => {
                if (e.target.value !== row.value) commit(row.key, { value: e.target.value });
              }}
            />
            <input
              className="col-span-5 min-h-[40px] border border-input bg-background px-2 text-sm outline-none focus:border-foreground"
              defaultValue={row.note ?? ""}
              placeholder="NOTE"
              onBlur={(e) => {
                if (e.target.value !== (row.note ?? "")) commit(row.key, { note: e.target.value });
              }}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function TagEditor({
  productId,
  allTags,
  linkedTagIds,
}: {
  productId: string;
  allTags: { id: string; name: string }[];
  linkedTagIds: string[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["product_tags", productId] });
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const addTag = useMutation({
    mutationFn: async (raw: string) => {
      const userId = await currentUserId();
      const label = raw.trim().toUpperCase();
      let tag = allTags.find((t) => t.name === label);
      if (!tag) {
        const { data, error } = await supabase
          .from("tags")
          .insert({ user_id: userId, name: label })
          .select("id, name")
          .single();
        if (error) throw error;
        tag = data;
      }
      const { error: linkError } = await supabase
        .from("product_tags")
        .insert({ user_id: userId, product_id: productId, tag_id: tag.id });
      if (linkError && linkError.code !== "23505") throw linkError;
    },
    onSuccess: invalidate,
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from("product_tags")
        .delete()
        .eq("product_id", productId)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const linked = allTags.filter((t) => linkedTagIds.includes(t.id));

  return (
    <SectionCard title="TAGS">
      <div className="flex flex-wrap items-center gap-2">
        {linked.map((tag) => (
          <span
            key={tag.id}
            className="label-caps inline-flex items-center gap-2 border border-foreground bg-foreground px-2 py-1 text-[11px] text-background"
          >
            {tag.name}
            <button type="button" onClick={() => removeTag.mutate(tag.id)}>
              ×
            </button>
          </span>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              addTag.mutate(name);
              setName("");
            }
          }}
        >
          <input
            list="pilot-tags"
            className="min-h-[36px] w-40 border border-input bg-background px-2 font-mono text-xs uppercase outline-none focus:border-foreground"
            placeholder="+ TAG"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="pilot-tags">
            {allTags.map((t) => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </form>
      </div>
    </SectionCard>
  );
}

function AddComponentPanel({
  productId,
  linkedIds,
  onDone,
}: {
  productId: string;
  linkedIds: string[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const components = useQuery(componentsQuery());
  const [search, setSearch] = useState("");
  const [techniqueCategoryId, setTechniqueCategoryId] = useState("");

  const results = (components.data ?? []).filter(
    (c) => !linkedIds.includes(c.id) && c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const link = useMutation({
    mutationFn: async (componentId: string) => {
      const userId = await currentUserId();
      const { error } = await supabase.from("product_components").insert({
        user_id: userId,
        product_id: productId,
        component_id: componentId,
        sort_order: linkedIds.length,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("components")
        .insert({
          user_id: userId,
          name: search.trim(),
          technique_category_id: techniqueCategoryId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase.from("product_components").insert({
        user_id: userId,
        product_id: productId,
        component_id: data.id,
        sort_order: linkedIds.length,
      });
      if (linkError) throw linkError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
  });

  return (
    <div className="mb-4 space-y-3 border border-dashed border-border p-3">
      <Field label="SEARCH EXISTING COMPONENT">
        <input
          autoFocus
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="LEMON CURD"
        />
      </Field>
      {results.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {results.slice(0, 8).map((component) => (
            <li key={component.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm">{component.name}</span>
              <button
                type="button"
                className="label-caps px-2 py-1 text-xs"
                onClick={() => link.mutate(component.id)}
              >
                LINK
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.trim() && results.length === 0 && (
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">NO MATCH</p>
          <Field label="TECHNIQUE CATEGORY (OPTIONAL)">
            <TechniqueSelect
              className={selectClass}
              value={techniqueCategoryId}
              onChange={setTechniqueCategoryId}
              emptyLabel="—"
            />
          </Field>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={createAndLink.isPending}
            onClick={() => createAndLink.mutate()}
          >
            {`CREATE "${search.trim().toUpperCase()}"`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 원물 재료(예: 바나나 슬라이스)를 배합/Component 없이 바로 Product에 링크(2026-09-23).
 * Ingredient Master를 검색해서 링크만 하고, 없으면 그 자리서 새 재료를 만들어 링크한다.
 */
function AddIngredientPanel({
  productId,
  linkedIds,
  onDone,
}: {
  productId: string;
  linkedIds: string[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const ingredients = useQuery(ingredientsQuery());
  const [search, setSearch] = useState("");

  const results = (ingredients.data ?? []).filter(
    (i) => !linkedIds.includes(i.id) && i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const link = useMutation({
    mutationFn: async (ingredientId: string) => {
      const userId = await currentUserId();
      const { error } = await supabase.from("product_components").insert({
        user_id: userId,
        product_id: productId,
        ingredient_id: ingredientId,
        sort_order: linkedIds.length,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("ingredients")
        .insert({ user_id: userId, name: search.trim() })
        .select("id")
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase.from("product_components").insert({
        user_id: userId,
        product_id: productId,
        ingredient_id: data.id,
        sort_order: linkedIds.length,
      });
      if (linkError) throw linkError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onDone();
    },
  });

  return (
    <div className="mb-4 space-y-3 border border-dashed border-border p-3">
      <Field label="SEARCH INGREDIENT MASTER">
        <input
          autoFocus
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="바나나"
        />
      </Field>
      {results.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {results.slice(0, 8).map((ingredient) => (
            <li key={ingredient.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm">{ingredient.name}</span>
              <button
                type="button"
                className="label-caps px-2 py-1 text-xs"
                onClick={() => link.mutate(ingredient.id)}
              >
                LINK
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.trim() && results.length === 0 && (
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">NO MATCH</p>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={createAndLink.isPending}
            onClick={() => createAndLink.mutate()}
          >
            {`CREATE "${search.trim().toUpperCase()}"`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Component 링크마다 "이 Product에서 실제로 어떤 Formula Version을, 몇 그램 쓰는지" 지정.
 * Component는 Formula Version을 여러 개 가질 수 있으므로 버전까지 지정한다.
 * Formula 자체의 기준 배합량과 이 Product에서의 실사용량은 다를 수 있다 (예: 배치 1kg 중 150g만 사용).
 */
function UsageQuantityInput({
  quantityG,
  onSave,
  unitLabel = "G 실사용량",
}: {
  quantityG: number | null;
  onSave: (quantityG: number | null) => void;
  unitLabel?: string;
}) {
  const [quantityDraft, setQuantityDraft] = useState(quantityG?.toString() ?? "");
  useEffect(() => {
    setQuantityDraft(quantityG?.toString() ?? "");
  }, [quantityG]);

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={inputClass + " w-28"}
        placeholder="0"
        value={quantityDraft}
        onChange={(e) => setQuantityDraft(e.target.value)}
        onBlur={() => {
          const trimmed = quantityDraft.trim();
          const next = trimmed === "" ? null : Number(trimmed);
          if (next !== null && Number.isNaN(next)) {
            setQuantityDraft(quantityG?.toString() ?? "");
            return;
          }
          if (next !== (quantityG ?? null)) onSave(next);
        }}
      />
      <span className="font-mono text-xs text-muted-foreground">{unitLabel}</span>
    </div>
  );
}

function ComponentUsageEditor({
  link,
  onSave,
}: {
  link: ProductComponentRow;
  onSave: (patch: { formula_version_id?: string | null; quantity_g?: number | null }) => void;
}) {
  const formulas = useQuery(formulasByComponentQuery(link.component_id ?? ""));
  const versionOptions = (formulas.data ?? []).flatMap((formula) =>
    formula.formula_versions.map((version) => ({
      id: version.id,
      label: `${formula.name} · V${version.version_number}${version.status !== "DRAFT" ? ` (${version.status})` : ""}`,
    })),
  );

  // 실사용량 입력 시 해당 FORMULA VERSION의 총량(g)을 바로 옆에 보여줘서 "전체 중 몇 g을 쓰는지" 비교하며 입력하기 쉽게 함
  const versionIngredients = useQuery(versionIngredientsQuery(link.formula_version_id ?? null));
  const versionTotalGrams = (versionIngredients.data ?? []).reduce(
    (sum, row) => sum + (toGrams(Number(row.amount), row.unit) ?? 0),
    0,
  );

  // 재료(원물) 직접 링크는 배합/FORMULA VERSION이 없으므로 실사용량(g)만 입력한다(2026-09-23).
  if (link.component_id == null) {
    return (
      <UsageQuantityInput
        quantityG={link.quantity_g}
        onSave={(quantity_g) => onSave({ quantity_g })}
      />
    );
  }

  if (versionOptions.length === 0) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        이 COMPONENT에 연결된 FORMULA VERSION이 없음
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="min-h-[44px] w-auto max-w-full border border-input bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-foreground"
        value={link.formula_version_id ?? ""}
        onChange={(e) => onSave({ formula_version_id: e.target.value || null })}
      >
        <option value="">FORMULA VERSION 미지정</option>
        {versionOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <UsageQuantityInput
        quantityG={link.quantity_g}
        onSave={(quantity_g) => onSave({ quantity_g })}
      />
      {link.formula_version_id && versionTotalGrams > 0 && (
        <span className="font-mono text-xs text-muted-foreground">
          / 이 레시피 총량 {fmtNumber(versionTotalGrams)}g
        </span>
      )}
      <p className="w-full font-mono text-[11px] text-muted-foreground">
        이 PRODUCT에서만 다른 FORMULA VERSION/사용량을 쓸 때만 지정하세요 — 보통은 해당
        COMPONENT의 Development Entry에서 "이 PRODUCT에만 적용"으로 저장하면 자동으로
        여기 반영됩니다. COMPONENT의 Current Formula 자체는 바뀌지 않습니다.
      </p>
    </div>
  );
}

function ProductKnowledgeSection({ productId }: { productId: string }) {
  const entries = useQuery(knowledgeEntriesByProductQuery(productId));
  const [adding, setAdding] = useState(false);

  return (
    <SectionCard
      title="KNOWLEDGE"
      action={
        <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
          {adding ? "CLOSE" : "+ ADD KNOWLEDGE"}
        </button>
      }
    >
      {adding && (
        <KnowledgeCreateForm
          initialLinks={{ product_id: productId }}
          lockProductId={productId}
          onDone={() => setAdding(false)}
        />
      )}
      <KnowledgeList
        entries={entries.data ?? []}
        emptyMessage="NO KNOWLEDGE LINKED TO THIS PRODUCT"
        lockProductId={productId}
      />
    </SectionCard>
  );
}
