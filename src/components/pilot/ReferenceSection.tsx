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
import {
  isGeneralReference,
  REFERENCE_SOURCE_TYPES,
  type ReferenceEntry,
  type ReferenceSourceType,
} from "@/lib/reference";
import { formatDateTime } from "@/lib/datetime";
import { Field, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

export interface ReferenceLinks {
  product_id: string | null;
  component_id: string | null;
  ingredient_id: string | null;
  technique_category_id: string | null;
}

export const emptyLinks: ReferenceLinks = {
  product_id: null,
  component_id: null,
  ingredient_id: null,
  technique_category_id: null,
};

/** 참고자료 목록/폼 전반에서 쓰는 캐시 무효화 */
export function useReferenceInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["reference_entries"] });
}

/** 종류 배지 — 검정 배경 + 흰 텍스트 (카테고리 뱃지 규칙) */
export function SourceTypeBadge({ type }: { type: string }) {
  return (
    <span className="label-caps inline-block border border-foreground bg-foreground px-2 py-0.5 text-[11px] text-background">
      {type}
    </span>
  );
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** 연결 대상 4종 선택 드롭다운 — 전부 "선택 안 함" 가능 */
export function ReferenceLinkSelects({
  value,
  onChange,
  lockProductId,
}: {
  value: ReferenceLinks;
  onChange: (next: ReferenceLinks) => void;
  lockProductId?: string | undefined;
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
          onChange={(e) => onChange({ ...value, technique_category_id: e.target.value || null })}
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
export function ReferenceCreateForm({
  initialLinks,
  lockProductId,
  onDone,
}: {
  initialLinks?: Partial<ReferenceLinks>;
  lockProductId?: string | undefined;
  onDone: () => void;
}) {
  const invalidate = useReferenceInvalidate();
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<ReferenceSourceType>("OTHER");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<ReferenceLinks>({ ...emptyLinks, ...initialLinks });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { error: insertError } = await supabase.from("reference_entries").insert({
        user_id: userId,
        title: title.trim(),
        source_type: sourceType,
        url: url.trim() || null,
        author: author.trim() || null,
        note: note.trim(),
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="TITLE">
          <input
            autoFocus
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: Professional Baking (Gisslen)"
          />
        </Field>
        <Field label="SOURCE TYPE">
          <select
            className={selectClass}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ReferenceSourceType)}
          >
            {REFERENCE_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL">
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
          />
        </Field>
        <Field label="AUTHOR">
          <input
            className={inputClass}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="저자 / 채널 / 출처"
          />
        </Field>
      </div>
      <Field label="NOTE">
        <textarea
          rows={4}
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="요약 / 어디에 도움이 되는지"
        />
      </Field>
      <ReferenceLinkSelects value={links} onChange={setLinks} lockProductId={lockProductId} />
      <p className="font-mono text-xs uppercase text-muted-foreground">
        아무것도 연결하지 않으면 일반 참고자료로 저장됩니다
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

function LinkBadges({ entry }: { entry: ReferenceEntry }) {
  const products = useQuery(productsQuery());
  const components = useQuery(componentsQuery());
  const ingredients = useQuery(ingredientsQuery());
  const techniques = useQuery(techniqueCategoriesQuery());

  if (isGeneralReference(entry)) {
    return (
      <span className="label-caps inline-block border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
        일반 참고자료
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

/** 항목 1건 — 클릭하면 인라인 수정. URL 링크는 수정 버튼 밖에 둔다(중첩 <a> 방지). */
export function ReferenceItem({
  entry,
  lockProductId,
}: {
  entry: ReferenceEntry;
  lockProductId?: string | undefined;
}) {
  const invalidate = useReferenceInvalidate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [sourceType, setSourceType] = useState<ReferenceSourceType>(
    entry.source_type as ReferenceSourceType,
  );
  const [url, setUrl] = useState(entry.url ?? "");
  const [author, setAuthor] = useState(entry.author ?? "");
  const [note, setNote] = useState(entry.note);
  const [links, setLinks] = useState<ReferenceLinks>({
    product_id: entry.product_id,
    component_id: entry.component_id,
    ingredient_id: entry.ingredient_id,
    technique_category_id: entry.technique_category_id,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error: updateError } = await supabase
        .from("reference_entries")
        .update({
          title: title.trim(),
          source_type: sourceType,
          url: url.trim() || null,
          author: author.trim() || null,
          note: note.trim(),
          ...links,
        })
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
        .from("reference_entries")
        .delete()
        .eq("id", entry.id);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "DELETE FAILED"),
  });

  const resetForm = () => {
    setTitle(entry.title);
    setSourceType(entry.source_type as ReferenceSourceType);
    setUrl(entry.url ?? "");
    setAuthor(entry.author ?? "");
    setNote(entry.note);
    setLinks({
      product_id: entry.product_id,
      component_id: entry.component_id,
      ingredient_id: entry.ingredient_id,
      technique_category_id: entry.technique_category_id,
    });
    setError(null);
  };

  if (editing) {
    return (
      <li className="space-y-3 border-l-2 border-foreground px-3 py-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="TITLE">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="SOURCE TYPE">
            <select
              className={selectClass}
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as ReferenceSourceType)}
            >
              {REFERENCE_SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="URL">
            <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="AUTHOR">
            <input className={inputClass} value={author} onChange={(e) => setAuthor(e.target.value)} />
          </Field>
        </div>
        <Field label="NOTE">
          <textarea rows={4} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ReferenceLinkSelects value={links} onChange={setLinks} lockProductId={lockProductId} />
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
              resetForm();
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
              if (confirm("DELETE THIS REFERENCE?")) {
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
      <div className="space-y-2 px-3 py-3">
        <button
          type="button"
          className="block w-full space-y-2 text-left hover:bg-secondary"
          onClick={() => setEditing(true)}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">{entry.title}</span>
            <SourceTypeBadge type={entry.source_type} />
          </span>
          {(entry.author || entry.url) && (
            <span className="block font-mono text-[11px] text-muted-foreground">
              {entry.author ? `BY ${entry.author}` : ""}
              {entry.author && entry.url ? " · " : ""}
              {entry.url ? displayUrl(entry.url) : ""}
            </span>
          )}
          {entry.note && (
            <span className="line-clamp-2 block font-body text-xs text-muted-foreground">
              {entry.note}
            </span>
          )}
        </button>
        <span className="flex flex-wrap items-center gap-2">
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="label-caps inline-block border border-border px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-secondary"
            >
              OPEN ↗
            </a>
          )}
          <LinkBadges entry={entry} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatDateTime(entry.updated_at)}
          </span>
        </span>
      </div>
    </li>
  );
}

/** 목록 */
export function ReferenceList({
  entries,
  emptyMessage = "NO REFERENCES YET",
  lockProductId,
}: {
  entries: ReferenceEntry[];
  emptyMessage?: string;
  lockProductId?: string | undefined;
}) {
  if (entries.length === 0) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-border border border-border">
      {entries.map((entry) => (
        <ReferenceItem key={entry.id} entry={entry} lockProductId={lockProductId} />
      ))}
    </ul>
  );
}