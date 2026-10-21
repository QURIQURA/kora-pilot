import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dietaryTagsQuery, formulaVersionDietaryTagLinksQuery } from "@/lib/queries";
import { SectionCard } from "./ui";

/**
 * FORMULA 상세 > 현재 보고 있는 VERSION의 식이 태그(선언). 누르면 바로 저장된다.
 * 태그는 버전 단위라 새 버전을 만들면 다시 선택해야 한다(재료가 바뀌었을 수 있으므로).
 */
export function FormulaVersionDietaryTags({ versionId }: { versionId: string | null }) {
  const queryClient = useQueryClient();
  const tags = useQuery(dietaryTagsQuery());
  const links = useQuery(formulaVersionDietaryTagLinksQuery());
  const selected = new Set(
    (links.data ?? []).filter((l) => l.formula_version_id === versionId).map((l) => l.dietary_tag_id),
  );

  const toggle = useMutation({
    mutationFn: async ({ tagId, on }: { tagId: string; on: boolean }) => {
      if (!versionId) return;
      if (on) {
        const { error } = await supabase
          .from("formula_version_dietary_tags")
          .delete()
          .eq("formula_version_id", versionId)
          .eq("dietary_tag_id", tagId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("formula_version_dietary_tags")
          .insert({ formula_version_id: versionId, dietary_tag_id: tagId });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["formula_version_dietary_tags"] }),
  });

  return (
    <SectionCard title="DIETARY TAGS (THIS VERSION)">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        Declare which dietary needs this version meets. Tags belong to this version only — check
        again after creating a new version.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(tags.data ?? []).map((t) => {
          const on = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={!versionId || toggle.isPending}
              className={
                "label-caps border px-2 py-1 text-[11px] " +
                (on
                  ? "border-foreground bg-foreground text-background"
                  : "border-input bg-background text-foreground hover:border-foreground")
              }
              onClick={() => toggle.mutate({ tagId: t.id, on })}
            >
              {t.name}
            </button>
          );
        })}
        {(tags.data ?? []).length === 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            Add tags in SETTINGS &gt; DIETARY TAGS
          </span>
        )}
      </div>
    </SectionCard>
  );
}
