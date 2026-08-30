import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, experimentSensoryScoresQuery, sensoryAttributesQuery } from "@/lib/queries";
import {
  SENSORY_CATEGORIES,
  SENSORY_CATEGORY_LABELS,
  attributeLabel,
  groupAttributesByCategory,
} from "@/lib/sensory";
import { SectionCard, inputClass } from "./ui";

/**
 * EXPERIMENT DETAIL — SENSORY EVALUATION.
 * Observation(자유 기록)과는 별개 — attribute별 구조화된 점수(scale_min~scale_max)를 기록한다.
 * score/note는 experiment_sensory_scores에 upsert(experiment_id, attribute_id 기준)한다.
 */
export function SensoryEvaluationSection({ experimentId }: { experimentId: string }) {
  const queryClient = useQueryClient();
  const attributes = useQuery(sensoryAttributesQuery());
  const scores = useQuery(experimentSensoryScoresQuery(experimentId));

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["experiment_sensory_scores", experimentId],
    });
  };

  const upsertScore = useMutation({
    mutationFn: async ({
      attributeId,
      score,
      note,
    }: {
      attributeId: string;
      score: number;
      note: string | null;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("experiment_sensory_scores")
        .upsert(
          { user_id, experiment_id: experimentId, attribute_id: attributeId, score, note },
          { onConflict: "experiment_id,attribute_id" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeScore = useMutation({
    mutationFn: async (attributeId: string) => {
      const { error } = await supabase
        .from("experiment_sensory_scores")
        .delete()
        .eq("experiment_id", experimentId)
        .eq("attribute_id", attributeId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const attributeList = attributes.data ?? [];
  const grouped = groupAttributesByCategory(attributeList);
  const scoreByAttribute = new Map((scores.data ?? []).map((s) => [s.attribute_id, s]));

  if (attributeList.length === 0) {
    return (
      <SectionCard title="SENSORY EVALUATION" muted>
        <p className="font-mono text-xs uppercase text-muted-foreground">
          SETTINGS → SENSORY ATTRIBUTES에서 평가 속성을 먼저 만드세요
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="SENSORY EVALUATION">
      <div className="space-y-4">
        {SENSORY_CATEGORIES.filter((c) => (grouped.get(c)?.length ?? 0) > 0).map((category) => (
          <div key={category}>
            <p className="label-caps mb-2 text-xs text-muted-foreground">
              {SENSORY_CATEGORY_LABELS[category]}
            </p>
            <ul className="divide-y divide-border border border-border">
              {(grouped.get(category) ?? []).map((attribute) => {
                const existing = scoreByAttribute.get(attribute.id);
                return (
                  <li key={attribute.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-[8rem] flex-1 text-sm">{attributeLabel(attribute)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      [{attribute.scale_min}–{attribute.scale_max}]
                    </span>
                    <input
                      type="number"
                      aria-label={`SCORE ${attribute.name}`}
                      min={attribute.scale_min}
                      max={attribute.scale_max}
                      className={`${inputClass} w-20 text-center`}
                      defaultValue={existing?.score ?? ""}
                      key={`score-${attribute.id}-${existing?.score ?? ""}`}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          if (existing) removeScore.mutate(attribute.id);
                          return;
                        }
                        const score = Number(raw);
                        if (!Number.isFinite(score)) return;
                        if (score < attribute.scale_min || score > attribute.scale_max) {
                          alert(
                            `SCORE는 ${attribute.scale_min}~${attribute.scale_max} 범위여야 합니다.`,
                          );
                          e.target.value = existing?.score != null ? String(existing.score) : "";
                          return;
                        }
                        upsertScore.mutate({
                          attributeId: attribute.id,
                          score,
                          note: existing?.note ?? null,
                        });
                      }}
                    />
                    <input
                      className={`${inputClass} min-w-[10rem] flex-1 border-transparent hover:border-input`}
                      placeholder="NOTE"
                      defaultValue={existing?.note ?? ""}
                      key={`note-${attribute.id}-${existing?.note ?? ""}`}
                      onBlur={(e) => {
                        const note = e.target.value.trim() || null;
                        if (!existing) return; // 점수 없이 note만 저장하지 않음 — score 먼저 입력
                        if (note !== (existing.note ?? null))
                          upsertScore.mutate({
                            attributeId: attribute.id,
                            score: existing.score,
                            note,
                          });
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {(upsertScore.isError || removeScore.isError) && (
          <p className="font-mono text-xs uppercase text-destructive">
            {((upsertScore.error ?? removeScore.error) as Error).message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
