import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aromaTagUsageQuery, type AromaTagUsage } from "@/lib/queries";
import { SectionCard, buttonClass, inputClass } from "./ui";

/**
 * 아로마 태그 관리 — 별도 마스터 테이블 없이 ingredients.aroma_notes에서
 * 실제 사용된 태그만 모아 보여주고, 이름 바꾸기/삭제는 모든 재료에 일괄 적용한다.
 * 코드에 하드코딩된 기본 후보 24종은 여기에 표시되지 않는다.
 */
export function AromaTagManager() {
  const queryClient = useQueryClient();
  const usage = useQuery(aromaTagUsageQuery());
  const [pendingDelete, setPendingDelete] = useState<AromaTagUsage | null>(
    null
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["aroma_tag_usage"] }),
      queryClient.invalidateQueries({ queryKey: ["ingredients"] }),
    ]);
  };

  /** 태그를 쓰는 모든 재료의 배열에서 일괄 치환 */
  const rename = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const rows = await fetchIngredientsWithTag(from);
      for (const row of rows) {
        const next = [
          ...new Set(
            (row.aroma_notes ?? []).map((t) => (t === from ? to : t))
          ),
        ];
        const { error } = await supabase
          .from("ingredients")
          .update({ aroma_notes: next })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
  });

  /** 태그를 쓰는 모든 재료의 배열에서 제거 */
  const remove = useMutation({
    mutationFn: async (tag: string) => {
      const rows = await fetchIngredientsWithTag(tag);
      for (const row of rows) {
        const next = (row.aroma_notes ?? []).filter((t) => t !== tag);
        const { error } = await supabase
          .from("ingredients")
          .update({ aroma_notes: next })
          .eq("id", row.id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
    },
  });

  const rows = usage.data ?? [];

  return (
    <SectionCard title="AROMA TAGS">
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase text-muted-foreground">
          실제 재료에 쓰인 태그만 표시됩니다. 기본 후보 24종은 코드에 내장되어
          여기서 수정할 수 없습니다.
        </p>
        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO AROMA TAGS IN USE YET
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {rows.map((row) => (
              <li key={row.tag}>
                <AromaTagRow
                  row={row}
                  onRename={(next) =>
                    rename.mutate({ from: row.tag, to: next })
                  }
                  onDelete={() => setPendingDelete(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">DELETE {pendingDelete.tag}</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setPendingDelete(null)}
              >
                CLOSE
              </button>
            </div>
            <div className="space-y-4 p-4">
              <p className="font-mono text-xs uppercase text-foreground">
                {pendingDelete.count}개 재료에서 사용 중
              </p>
              <p className="font-mono text-xs uppercase text-muted-foreground">
                삭제하면 해당 재료들의 아로마 태그에서 이 태그가 제거됩니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(pendingDelete.tag)}
                >
                  REMOVE FROM ALL
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setPendingDelete(null)}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

async function fetchIngredientsWithTag(tag: string) {
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, aroma_notes")
    .contains("aroma_notes", [tag]);
  if (error) throw error;
  return data ?? [];
}

function AromaTagRow({
  row,
  onRename,
  onDelete,
}: {
  row: AromaTagUsage;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.tag);
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        className={inputClass + " min-w-0 flex-1"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (next && next !== row.tag) onRename(next);
          else setName(row.tag);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="label-caps text-[11px] text-muted-foreground">
        {row.count}개 재료
      </span>
      <button type="button" className={buttonClass} onClick={onDelete}>
        DELETE
      </button>
    </div>
  );
}
