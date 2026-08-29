import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentsQuery,
  currentUserId,
  ingredientsQuery,
  productsQuery,
  techniqueCategoriesQuery,
} from "@/lib/queries";
import { leafTechniques, techniquePath } from "@/lib/technique";
import { isGeneralKnowledge, type KnowledgeEntry } from "@/lib/knowledge";
import { formatDateTime } from "@/lib/datetime";
import { Field, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

export interface KnowledgeLinks {
  product_id: string | null;
  component_id: string | null;
  ingredient_id: string | null;
  technique_category_id: string | null;
}

export const emptyLinks: KnowledgeLinks = {
  product_id: null,
  component_id: null,
  ingredient_id: null,
  technique_category_id: null,
};

/** 지식 목록/폼 전반에서 쓰는 캐시 무효화 */
export function useKnowledgeInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["knowledge_entries"] });
}

/** 연결 대상 4종 선택 드롭다운 — 전부 "선택 안 함" 가능 */
export function KnowledgeLinkSelects({
  value,
  onChange,
  lockProductId,
}: {
  value: KnowledgeLinks;
  onChange: (next: KnowledgeLinks) => void;
  lockProductId?: string;
}) {
  const products = useQuery(productsQuery());
  const components = useQuery(componentsQuery());
  const ingredients = useQuery(ingredientsQuery());
  const techniques = useQuery(techniqueCategoriesQuery());
  const techniqueList = techniques.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="PRODUCT">
        <select
          className={selectClass}
          value={value.product_id ?? ""}
          disabled={Boolean(lockProductId)}
          onChange={(e) => onChange({ ...value, product_id: e.target.value || null })}
        >
          <option value="">— 선택 안 함</option>
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="COMPONENT">
        <select
          className={selectClass}
          value={value.component_id ?? ""}
          onChange={(e) => onChange({ ...value, component_id: e.target.value || null })}
        >
          <option value="">— 선택 안 함</option>
          {(components.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="INGREDIENT">
        <select
          className={selectClass}
          value={value.ingredient_id ?? ""}
          onChange={(e) => onChange({ ...value, ingredient_id: e.target.value || null })}
        >
          <option value="">— 선택 안 함</option>
          {(ingredients.data ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="TECHNIQUE CATEGORY">
        <select
          className={selectClass}
          value={value.technique_category_id ?? ""}
          onChange={(e) =>
            onChange({ ...value, technique_category_id: e.target.value || null })
          }
        >
          <option value="">— 선택 안 함</option>
          {leafTechniques(techniqueList).map(({ category }) => {
            const prefix = techniquePath(techniqueList, category.id)
              .slice(0, -1)
              .map((p) => p.name)
              .join(" / ");
            return (
              <option key={category.id} value={category.id}>
                {prefix ? `${prefix} / ` : ""}
                {category.name}
              </option>
            );
          })}
        </select>
      </Field>
    </div>
  );
}

/** 생성 폼 (인라인) */
export function KnowledgeCreateForm({
  initialLinks,
  lockProductId,
  onDone,
}: {
  initialLinks?: Partial<KnowledgeLinks>;
  lockProductId?: string;
  onDone: () => void;
}) {
  const invalidate = useKnowledgeInvalidate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState<KnowledgeLinks>({ ...emptyLinks, ...initialLinks });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { error: insertError } = await supabase.from("knowledge_entries").insert({
        user_id: userId,
        title: title.trim(),
        body: body.trim(),
        ...links,
      });
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "SAVE FAILED"),
  });

  return (
    <form
      className="mb-4 space-y-3 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!title.trim()) {
          setError("제목을 입력해 주세요");
          return;
        }
        create.mutate();
      }}
    >
      <Field label="TITLE">
        <input
          autoFocus
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 오일폼 케이크는 수분이 낮으면 갈라진다"
        />
      </Field>
      <Field label="BODY">
        <textarea
          rows={6}
          className={inputClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="관찰과 원리를 기록"
        />
      </Field>
      <KnowledgeLinkSelects value={links} onChange={setLinks} lockProductId={lockProductId} />
      <p className="font-mono text-xs uppercase text-muted-foreground">
        아무것도 연결하지 않으면 일반 원칙으로 저장됩니다
      </p>
      {error && (
        <p className="border border-destructive px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          {create.isPending ? "SAVING…" : "SAVE"}
        </button>
        <button type="button" className={buttonClass} onClick={onDone}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

function LinkBadges({ entry }: { entry: KnowledgeEntry }) {
  const products = useQuery(productsQuery());
  const components = useQuery(componentsQuery());
  const ingredients = useQuery(ingredientsQuery());
  const techniques = useQuery(techniqueCategoriesQuery());

  if (isGeneralKnowledge(entry)) {
    return (
      <span className="label-caps inline-block border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
        일반 원칙
      </span>
    );
  }

  const badges: string[] = [];
  const find = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    id ? (list ?? []).find((x) => x.id === id)?.name : undefined;

  const p = find(products.data as { id: string; name: string }[] | undefined, entry.product_id);
  if (p) badges.push(`PRODUCT: ${p}`);
  const c = find(components.data, entry.component_id);
  if (c) badges.push(`COMPONENT: ${c}`);
  const i = find(
    ingredients.data as { id: string; name: string }[] | undefined,
    entry.ingredient_id,
  );
  if (i) badges.push(`INGREDIENT: ${i}`);
  const t = find(techniques.data, entry.technique_category_id);
  if (t) badges.push(`TECHNIQUE: ${t}`);

  return (
    <>
      {badges.map((label) => (
        <span
          key={label}
          className="label-caps inline-block border border-foreground bg-foreground px-2 py-0.5 text-[11px] text-background"
        >
          {label}
        </span>
      ))}
    </>
  );
}

/** 항목 1건 — 클릭하면 인라인 수정 */
export function KnowledgeItem({
  entry,
  lockProductId,
}: {
  entry: KnowledgeEntry;
  lockProductId?: string;
}) {
  const invalidate = useKnowledgeInvalidate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const [links, setLinks] = useState<KnowledgeLinks>({
    product_id: entry.product_id,
    component_id: entry.component_id,
    ingredient_id: entry.ingredient_id,
    technique_category_id: entry.technique_category_id,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error: updateError } = await supabase
        .from("knowledge_entries")
        .update({ title: title.trim(), body: body.trim(), ...links })
        .eq("id", entry.id);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "SAVE FAILED"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error: deleteError } = await supabase
        .from("knowledge_entries")
        .delete()
        .eq("id", entry.id);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "DELETE FAILED"),
  });

  if (editing) {
    return (
      <li className="space-y-3 border-l-2 border-foreground px-3 py-3">
        <Field label="TITLE">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="BODY">
          <textarea
            rows={8}
            className={inputClass}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <KnowledgeLinkSelects value={links} onChange={setLinks} lockProductId={lockProductId} />
        {error && (
          <p className="border border-destructive px-3 py-2 font-mono text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={save.isPending || !title.trim()}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            {save.isPending ? "SAVING…" : "SAVE"}
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setTitle(entry.title);
              setBody(entry.body);
              setLinks({
                product_id: entry.product_id,
                component_id: entry.component_id,
                ingredient_id: entry.ingredient_id,
                technique_category_id: entry.technique_category_id,
              });
              setError(null);
              setEditing(false);
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={remove.isPending}
            onClick={() => {
              if (confirm("DELETE THIS KNOWLEDGE ENTRY?")) {
                setError(null);
                remove.mutate();
              }
            }}
          >
            {remove.isPending ? "DELETING…" : "DELETE"}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className="block w-full space-y-2 px-3 py-3 text-left hover:bg-secondary"
        onClick={() => setEditing(true)}
      >
        <span className="block text-sm text-foreground">{entry.title}</span>
        {entry.body && (
          <span className="line-clamp-2 block font-body text-xs text-muted-foreground">
            {entry.body}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <LinkBadges entry={entry} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatDateTime(entry.updated_at)}
          </span>
        </span>
      </button>
    </li>
  );
}

/** 목록 */
export function KnowledgeList({
  entries,
  emptyMessage = "NO KNOWLEDGE ENTRIES YET",
  lockProductId,
}: {
  entries: KnowledgeEntry[];
  emptyMessage?: string;
  lockProductId?: string;
}) {
  if (entries.length === 0) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-border border border-border">
      {entries.map((entry) => (
        <KnowledgeItem key={entry.id} entry={entry} lockProductId={lockProductId} />
      ))}
    </ul>
  );
}
