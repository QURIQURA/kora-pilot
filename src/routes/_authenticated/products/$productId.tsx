import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import {
  categoriesQuery,
  componentsQuery,
  currentUserId,
  experimentsByProductQuery,
  productComponentsQuery,
  productQuery,
  productTagsQuery,
  tagsQuery,
} from "@/lib/queries";
import {
  categoryPath,
  DEFAULT_TARGET_KEYS,
  parseTarget,
  PRODUCT_STATUSES,
  type ProductStatus,
  type TargetAttribute,
} from "@/lib/pilot";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { formatDateTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { ProductFormulasSection } from "@/components/pilot/FormulaSummary";
import { ExperimentListItems } from "@/components/pilot/ExperimentList";
import {
  Field,
  NextPhaseSection,
  SectionCard,
  StatusBadge,
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

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const product = useQuery(productQuery(productId));
  const categories = useQuery(categoriesQuery());
  const links = useQuery(productComponentsQuery(productId));
  const tags = useQuery(tagsQuery());
  const productTags = useQuery(productTagsQuery(productId));
  const experiments = useQuery(experimentsByProductQuery(productId));

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

  const unlink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("product_components").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["product_components", productId],
      });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
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

  if (product.isLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }
  if (!product.data) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">PRODUCT NOT FOUND</p>;
  }

  const data = product.data;
  const linkedTagIds = (productTags.data ?? []).map((t) => t.tag_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineName value={data.name} onSave={(name) => updateProduct.mutate({ name })} />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            CREATED {formatDateTime(data.created_at)} · UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <select
            className={selectClass + " w-auto"}
            value={data.status}
            onChange={(e) => updateProduct.mutate({ status: e.target.value as ProductStatus })}
          >
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <CategorySelect
            className={selectClass + " w-auto"}
            value={data.category_id ?? ""}
            onChange={(id) => updateProduct.mutate({ category_id: id || null })}
            emptyLabel="NO CATEGORY"
          />
        </div>
      </div>

      <TagEditor productId={productId} allTags={tags.data ?? []} linkedTagIds={linkedTagIds} />

      <TargetSection
        target={parseTarget(data.product_target)}
        onSave={(next) => updateProduct.mutate({ product_target: next })}
      />

      <SectionCard
        title="COMPONENTS"
        action={
          <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
            {adding ? "CLOSE" : "+ ADD COMPONENT"}
          </button>
        }
      >
        {adding && (
          <AddComponentPanel
            productId={productId}
            linkedIds={(links.data ?? []).map((l) => l.component_id)}
            onDone={() => setAdding(false)}
          />
        )}
        {(links.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO COMPONENTS LINKED</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(links.data ?? []).map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
              >
                <Link
                  to="/components/$componentId"
                  params={{ componentId: link.component_id }}
                  className="text-sm hover:underline"
                >
                  {link.components?.name}
                </Link>
                <button
                  type="button"
                  className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => unlink.mutate(link.id)}
                >
                  UNLINK
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="NOTES">
        <NotesEditor value={data.notes ?? ""} onSave={(notes) => updateProduct.mutate({ notes })} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProductFormulasSection productId={productId} />
        <SectionCard
          title="EXPERIMENTS"
          action={
            <Link to="/experiments" className="label-caps px-2 py-2 text-xs hover:bg-secondary">
              VIEW ALL
            </Link>
          }
        >
          <ExperimentListItems items={experiments.data ?? []} />
        </SectionCard>
        <NextPhaseSection title="OBSERVATIONS" />
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
