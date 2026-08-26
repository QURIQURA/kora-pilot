import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, techniqueCategoriesQuery } from "@/lib/queries";
import {
  buildTechniqueTree,
  type TechniqueCategory,
  type TechniqueNode,
} from "@/lib/technique";
import { SectionCard, buttonClass, inputClass } from "./ui";

/**
 * SETTINGS의 TECHNIQUE CATEGORIES 관리 섹션.
 * 트리(그룹 → 기법군 → 서브타입) — 그룹은 접기/펼치기, 필드는 인라인 수정.
 * 리프 항목에만 CALIBRATION 링크가 붙는다.
 */
export function TechniqueCategoryManager() {
  const queryClient = useQueryClient();
  const categories = useQuery(techniqueCategoriesQuery());
  const [addingRoot, setAddingRoot] = useState(false);

  const list = categories.data ?? [];
  const tree = buildTechniqueTree(list);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["technique_categories"] });
  };

  const create = useMutation({
    mutationFn: async ({
      name,
      parentId,
      sortOrder,
    }: {
      name: string;
      parentId: string | null;
      sortOrder: number;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("technique_categories").insert({
        user_id,
        name,
        parent_id: parentId,
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<TechniqueCategory>;
    }) => {
      const { error } = await supabase
        .from("technique_categories")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("technique_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const nextSort = (parentId: string | null) =>
    list.filter((c) => (c.parent_id ?? null) === parentId).length + 1;

  return (
    <SectionCard
      title="TECHNIQUE CATEGORIES"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAddingRoot((v) => !v)}
        >
          {addingRoot ? "CLOSE" : "+ 새 그룹"}
        </button>
      }
    >
      <div className="space-y-3">
        {addingRoot && (
          <InlineAdd
            label="새 그룹 이름"
            onCancel={() => setAddingRoot(false)}
            onCreate={(name) => {
              create.mutate({ name, parentId: null, sortOrder: nextSort(null) });
              setAddingRoot(false);
            }}
          />
        )}

        {tree.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO TECHNIQUE CATEGORIES YET
          </p>
        ) : (
          <ul className="space-y-3">
            {tree.map((node) => (
              <li key={node.category.id}>
                <GroupBlock
                  node={node}
                  onCreate={(name, parentId) =>
                    create.mutate({
                      name,
                      parentId,
                      sortOrder: nextSort(parentId),
                    })
                  }
                  onUpdate={(id, patch) => update.mutate({ id, patch })}
                  onDelete={(id) => remove.mutate(id)}
                />
              </li>
            ))}
          </ul>
        )}

        {(create.isError || update.isError || remove.isError) && (
          <p className="font-mono text-xs uppercase text-destructive">
            {
              ((create.error ?? update.error ?? remove.error) as Error)
                .message
            }
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function GroupBlock({
  node,
  onCreate,
  onUpdate,
  onDelete,
}: {
  node: TechniqueNode;
  onCreate: (name: string, parentId: string | null) => void;
  onUpdate: (id: string, patch: Partial<TechniqueCategory>) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <div className="border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-3 py-3 text-left hover:bg-secondary"
      >
        <span className="label-caps">
          {node.category.name}
          {node.category.name_en && (
            <span className="ml-2 text-[11px] text-muted-foreground">
              {node.category.name_en}
            </span>
          )}
        </span>
        <span className="label-caps text-xs text-muted-foreground">
          {node.children.length} · {open ? "− CLOSE" : "+ OPEN"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <TechniqueFields
            category={node.category}
            onUpdate={(patch) => onUpdate(node.category.id, patch)}
            onDelete={
              node.children.length === 0
                ? () => {
                    if (confirm(`DELETE "${node.category.name}"?`))
                      onDelete(node.category.id);
                  }
                : undefined
            }
          />

          <ul className="space-y-2">
            {node.children.map((child) => (
              <li key={child.category.id} className="border border-border p-3">
                <TechniqueFields
                  category={child.category}
                  isLeaf={child.children.length === 0}
                  onUpdate={(patch) => onUpdate(child.category.id, patch)}
                  onDelete={
                    child.children.length === 0
                      ? () => {
                          if (confirm(`DELETE "${child.category.name}"?`))
                            onDelete(child.category.id);
                        }
                      : undefined
                  }
                />

                {child.children.length > 0 && (
                  <ul className="mt-3 space-y-2 border-l border-dashed border-border pl-3">
                    {child.children.map((sub) => (
                      <li
                        key={sub.category.id}
                        className="border border-border p-3"
                      >
                        <TechniqueFields
                          category={sub.category}
                          isLeaf
                          onUpdate={(patch) => onUpdate(sub.category.id, patch)}
                          onDelete={() => {
                            if (confirm(`DELETE "${sub.category.name}"?`))
                              onDelete(sub.category.id);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <SubtypeAdder
                  parentId={child.category.id}
                  onCreate={onCreate}
                />
              </li>
            ))}
          </ul>

          {adding ? (
            <InlineAdd
              label="새 기법군 이름"
              onCancel={() => setAdding(false)}
              onCreate={(name) => {
                onCreate(name, node.category.id);
                setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              className={`${buttonClass} text-xs`}
              onClick={() => setAdding(true)}
            >
              + 기법군 추가
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SubtypeAdder({
  parentId,
  onCreate,
}: {
  parentId: string;
  onCreate: (name: string, parentId: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (adding)
    return (
      <div className="mt-3">
        <InlineAdd
          label="새 서브타입 이름"
          onCancel={() => setAdding(false)}
          onCreate={(name) => {
            onCreate(name, parentId);
            setAdding(false);
          }}
        />
      </div>
    );
  return (
    <button
      type="button"
      className={`${buttonClass} mt-3 text-xs`}
      onClick={() => setAdding(true)}
    >
      + 서브타입
    </button>
  );
}

/** 이름/영문명/참고 기준 배합/핵심 원리 인라인 수정 + 리프면 CALIBRATION 링크 */
function TechniqueFields({
  category,
  isLeaf = false,
  onUpdate,
  onDelete,
}: {
  category: TechniqueCategory;
  isLeaf?: boolean;
  onUpdate: (patch: Partial<TechniqueCategory>) => void;
  onDelete?: (() => void) | undefined;
}) {
  const commit = (key: keyof TechniqueCategory, raw: string, nullable = true) => {
    const value = raw.trim();
    const current = (category[key] as string | null) ?? "";
    if (value === current) return;
    if (!value && !nullable) return;
    onUpdate({ [key]: value || (nullable ? null : value) } as Partial<TechniqueCategory>);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          aria-label="NAME"
          placeholder="이름"
          defaultValue={category.name}
          onBlur={(e) => commit("name", e.target.value, false)}
        />
        <input
          className={inputClass}
          aria-label="NAME EN"
          placeholder="ENGLISH"
          defaultValue={category.name_en ?? ""}
          onBlur={(e) => commit("name_en", e.target.value)}
        />
      </div>
      <input
        className={inputClass}
        aria-label="SUGGESTED BASE FORMULA"
        placeholder="참고 기준 배합 (예: Genoise)"
        defaultValue={category.suggested_base_formula ?? ""}
        onBlur={(e) => commit("suggested_base_formula", e.target.value)}
      />
      <textarea
        className={`${inputClass} min-h-[72px]`}
        aria-label="NOTES"
        placeholder="핵심 원리 한 줄"
        defaultValue={category.notes ?? ""}
        onBlur={(e) => commit("notes", e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        {isLeaf && (
          <Link
            to="/settings/calibration/$techniqueId"
            params={{ techniqueId: category.id }}
            className={`${buttonClass} text-xs`}
          >
            CALIBRATION 보기 →
          </Link>
        )}
        {onDelete && (
          <button
            type="button"
            className={`${buttonClass} text-xs`}
            onClick={onDelete}
          >
            DELETE
          </button>
        )}
      </div>
    </div>
  );
}

function InlineAdd({
  label,
  onCreate,
  onCancel,
}: {
  label: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <input
        className={`${inputClass} min-w-[12rem] flex-1`}
        autoFocus
        placeholder={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className={`${buttonClass} text-xs`}>
        추가
      </button>
      <button
        type="button"
        className={`${buttonClass} text-xs`}
        onClick={onCancel}
      >
        취소
      </button>
    </form>
  );
}
