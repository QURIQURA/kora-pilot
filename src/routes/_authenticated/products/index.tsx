import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCreateModal } from "@/components/pilot/ProductCreateModal";
import { categoriesQuery, productsQuery, tagsQuery } from "@/lib/queries";
import {
  categoryPath,
  categoryPathLabel,
  categoryWithDescendants,
  flattenCategories,
} from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import {
  CategoryBadge,
  Field,
  PageHeader,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/products/")({
  head: () => ({
    meta: [
      { title: "PILOT — Products" },
      { name: "description", content: "Products in development" },
      { property: "og:title", content: "PILOT — Products" },
      { property: "og:description", content: "Products in development" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const products = useQuery(productsQuery());
  const categories = useQuery(categoriesQuery());
  const tags = useQuery(tagsQuery());
  const queryClient = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const categoryList = categories.data ?? [];

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("products").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  // 정렬은 항상 이름순 고정(2026-09-22) — 단, 📌 고정한 제품은 지금 작업 중인 레시피이므로
  // 이름순과 무관하게 항상 맨 위에 온다(2026-09-22 추가).
  const rows = useMemo(() => {
    let list = [...(products.data ?? [])];
    if (categoryFilter) {
      const ids = categoryWithDescendants(categoryList, categoryFilter);
      list = list.filter((p) => p.category_id && ids.includes(p.category_id));
    }
    if (tagFilter) {
      list = list.filter((p) =>
        (p.product_tags ?? []).some((t) => t.tag_id === tagFilter)
      );
    }
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products.data, categoryList, categoryFilter, tagFilter]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="PRODUCTS"
        action={
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => setCreating(true)}
          >
            + CREATE PRODUCT
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="CATEGORY">
          <select
            className={selectClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">ALL</option>
            {flattenCategories(categoryList).map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {`${"— ".repeat(depth)}${category.name}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="TAG">
          <select
            className={selectClass}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">ALL</option>
            {(tags.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {products.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          LOADING…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          message={
            (products.data ?? []).length === 0
              ? "NO PRODUCTS YET"
              : "NO PRODUCTS MATCH THESE FILTERS"
          }
          actionLabel="+ CREATE PRODUCT"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="border border-border bg-card">
          <div className="hidden items-center border-b border-border py-2 md:flex">
          <span className="w-10 shrink-0" aria-hidden />
          <div className="grid flex-1 grid-cols-12 gap-2 pr-4">
            <span className="label-caps col-span-5 text-xs text-muted-foreground">
              NAME
            </span>
            <span className="label-caps col-span-4 text-xs text-muted-foreground">
              CATEGORY
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              COMP
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              UPDATED
            </span>
          </div>
          </div>
          <ul>
            {rows.map((product) => (
              <li
                key={product.id}
                className="flex items-stretch border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  title={product.pinned ? "고정 해제" : "목록 맨 위에 고정"}
                  className={`flex shrink-0 items-center px-3 hover:bg-secondary ${
                    product.pinned ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    togglePin.mutate({ id: product.id, pinned: !product.pinned });
                  }}
                >
                  <Pin className="h-4 w-4" fill={product.pinned ? "currentColor" : "none"} />
                </button>
                <Link
                  to="/products/$productId"
                  params={{ productId: product.id }}
                  className="grid flex-1 grid-cols-1 gap-1 py-3 pr-4 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2"
                >
                  <span className="col-span-5 text-sm">{product.name}</span>
                  <span className="col-span-4 font-mono text-xs uppercase">
                    <CategoryBadge
                      label={categoryPathLabel(categoryList, product.category_id)}
                      color={
                        categoryPath(categoryList, product.category_id).at(-1)?.color
                      }
                    />
                  </span>
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {product.product_components?.[0]?.count ?? 0}
                  </span>
                  <span className="col-span-2 font-mono text-xs text-muted-foreground">
                    {formatDateTime(product.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && <ProductCreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}

