import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import {
  categoriesQuery,
  currentUserId,
  productsQuery,
  tagsQuery,
} from "@/lib/queries";
import {
  categoryPathLabel,
  categoryWithDescendants,
  flattenCategories,
  PRODUCT_STATUSES,
  type ProductStatus,
} from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import {
  Field,
  PageHeader,
  StatusBadge,
  buttonClass,
  inputClass,
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

type SortKey = "UPDATED" | "CREATED" | "NAME";

function ProductsPage() {
  const products = useQuery(productsQuery());
  const categories = useQuery(categoriesQuery());
  const tags = useQuery(tagsQuery());

  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("UPDATED");
  const [creating, setCreating] = useState(false);

  const categoryList = categories.data ?? [];

  const rows = useMemo(() => {
    let list = [...(products.data ?? [])];
    if (categoryFilter) {
      const ids = categoryWithDescendants(categoryList, categoryFilter);
      list = list.filter((p) => p.category_id && ids.includes(p.category_id));
    }
    if (statusFilter) list = list.filter((p) => p.status === statusFilter);
    if (tagFilter) {
      list = list.filter((p) =>
        (p.product_tags ?? []).some((t) => t.tag_id === tagFilter)
      );
    }
    list.sort((a, b) => {
      if (sort === "NAME") return a.name.localeCompare(b.name);
      if (sort === "CREATED") return b.created_at.localeCompare(a.created_at);
      return b.updated_at.localeCompare(a.updated_at);
    });
    return list;
  }, [products.data, categoryList, categoryFilter, statusFilter, tagFilter, sort]);

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 gap-3 border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Field label="STATUS">
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">ALL</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
        <Field label="SORT">
          <select
            className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="UPDATED">UPDATED</option>
            <option value="CREATED">CREATED</option>
            <option value="NAME">NAME</option>
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
          <div className="hidden grid-cols-12 gap-2 border-b border-border px-4 py-2 md:grid">
            <span className="label-caps col-span-4 text-xs text-muted-foreground">
              NAME
            </span>
            <span className="label-caps col-span-3 text-xs text-muted-foreground">
              CATEGORY
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              STATUS
            </span>
            <span className="label-caps col-span-1 text-xs text-muted-foreground">
              COMP
            </span>
            <span className="label-caps col-span-2 text-xs text-muted-foreground">
              UPDATED
            </span>
          </div>
          <ul>
            {rows.map((product) => (
              <li key={product.id} className="border-b border-border last:border-b-0">
                <Link
                  to="/products/$productId"
                  params={{ productId: product.id }}
                  className="grid grid-cols-1 gap-1 px-4 py-3 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-2"
                >
                  <span className="col-span-4 text-sm">{product.name}</span>
                  <span className="col-span-3 font-mono text-xs uppercase text-muted-foreground">
                    {categoryPathLabel(categoryList, product.category_id)}
                  </span>
                  <span className="col-span-2">
                    <StatusBadge status={product.status} />
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

      {creating && <CreateProductDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateProductDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery());
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<ProductStatus>("IDEA");

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          name: name.trim(),
          category_id: categoryId || null,
          status,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
      void navigate({ to: "/products/$productId", params: { productId: id } });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW PRODUCT</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="NAME">
            <input
              className={inputClass}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="CATEGORY">
            <CategorySelect
              className={selectClass}
              value={categoryId}
              onChange={setCategoryId}
              emptyLabel="—"
            />
          </Field>
          <Field label="STATUS">
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {create.isError && (
            <p className="font-mono text-xs uppercase text-destructive">
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={create.isPending}
            >
              CREATE
            </button>
            <button type="button" className={buttonClass} onClick={onClose}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
