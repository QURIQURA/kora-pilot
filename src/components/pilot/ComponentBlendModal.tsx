import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { flattenBlend } from "@/lib/component-blend";
import { fmtNumber } from "@/lib/formula";
import { TechniqueSelect } from "./TechniqueSelect";
import { Field, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

export function ComponentBlendModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [technique, setTechnique] = useState("");
  const [sources, setSources] = useState([
    { version_id: "", amount_g: "" },
    { version_id: "", amount_g: "" },
  ]);
  const choices = useQuery({
    queryKey: ["blend_choices"],
    queryFn: async () => {
      const uid = await currentUserId();
      const { data, error } = await supabase
        .from("formulas")
        .select(
          "id, name, component_id, components!inner(name), formula_versions(id, version_number, status)",
        )
        .eq("user_id", uid)
        .order("name");
      if (error) throw error;
      return data.flatMap((f) =>
        // 2026-11-13: 포뮬라마다 번호가 가장 높은 버전만 쓴다.
        [...f.formula_versions]
          .sort((x, y) => y.version_number - x.version_number)
          .slice(0, 1)
          .map((v) => ({
            ...v,
            label: `${f.components.name} · ${f.name} · V${v.version_number}`,
          })),
      );
    },
  });
  const ingredientQueries = useQueries({
    queries: sources.map((source) => ({
      queryKey: ["blend_ingredients", source.version_id],
      enabled: Boolean(source.version_id),
      queryFn: async () => {
        const uid = await currentUserId();
        const { data, error } = await supabase
          .from("formula_version_ingredients")
          .select("ingredient_id, amount, unit, ingredients(name)")
          .eq("user_id", uid)
          .eq("formula_version_id", source.version_id);
        if (error) throw error;
        return data;
      },
    })),
  });
  let preview: ReturnType<typeof flattenBlend> = [];
  let validation = "";
  const ready = sources.every(
    (s, i) => s.version_id && s.amount_g && ingredientQueries[i]?.isSuccess,
  );
  if (ready) {
    try {
      if (new Set(sources.map((s) => s.version_id)).size !== sources.length)
        throw new Error("같은 버전을 중복 선택할 수 없습니다");
      preview = flattenBlend(
        sources.map((s, i) => ({
          amount_g: Number(s.amount_g),
          ingredients: ingredientQueries[i]?.data ?? [],
        })),
      );
    } catch (error) {
      validation = (error as Error).message;
    }
  }
  const total = preview.reduce((sum, r) => sum + r.amount, 0);
  const names = new Map(
    ingredientQueries.flatMap((q) =>
      (q.data ?? []).map((r) => [r.ingredient_id, r.ingredients?.name ?? r.ingredient_id] as const),
    ),
  );
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_component_blend", {
        p_name: name.trim(),
        ...(technique ? { p_technique_category_id: technique } : {}),
        p_sources: sources.map((s) => ({ version_id: s.version_id, amount_g: Number(s.amount_g) })),
      });
      if (error) throw error;
      return data as { component_id: string; formula_id: string };
    },
    onSuccess: async (result) => {
      await Promise.all(
        ["components", "formulas", "blend_choices"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onClose();
      void navigate({ to: "/formulas/$formulaId", params: { formulaId: result.formula_id } });
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="blend-title"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto border border-border bg-background p-3"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="blend-title" className="label-caps">
            COMBINE COMPONENTS
          </h2>
          <button
            type="button"
            className={buttonClass}
            onClick={onClose}
            disabled={create.isPending}
          >
            CLOSE
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !validation && name.trim()) create.mutate();
          }}
        >
          <Field label="새 COMPONENT / FORMULA 이름">
            <input
              autoFocus
              required
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="TECHNIQUE">
            <TechniqueSelect
              className={selectClass}
              value={technique}
              onChange={setTechnique}
              emptyLabel="미분류"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            원본 버전과 혼합할 중량을 선택하세요. 새 Component와 DRAFT Formula가 함께 생성됩니다.
          </p>
          {sources.map((source, index) => (
            <div key={index} className="space-y-2 border border-border p-3">
              <Field label={`COMPONENT ${index + 1}`}>
                <select
                  aria-label={`원본 버전 ${index + 1}`}
                  required
                  className={selectClass}
                  value={source.version_id}
                  onChange={(e) =>
                    setSources((all) =>
                      all.map((s, i) => (i === index ? { ...s, version_id: e.target.value } : s)),
                    )
                  }
                >
                  <option value="">원본 배합 버전 선택</option>
                  {(choices.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <Field label="사용량 (g)">
                  <input
                    aria-label={`사용량 ${index + 1} (g)`}
                    type="number"
                    required
                    min="0.001"
                    step="any"
                    className={inputClass}
                    value={source.amount_g}
                    onChange={(e) =>
                      setSources((all) =>
                        all.map((s, i) => (i === index ? { ...s, amount_g: e.target.value } : s)),
                      )
                    }
                  />
                </Field>
                {sources.length > 2 && (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setSources((all) => all.filter((_, i) => i !== index))}
                  >
                    REMOVE
                  </button>
                )}
              </div>
              {ingredientQueries[index]?.isFetching && (
                <p className="text-xs">원본 재료 불러오는 중…</p>
              )}
              {source.amount_g && total > 0 && (
                <p className="text-xs text-muted-foreground">
                  혼합 비중 {fmtNumber((Number(source.amount_g) / total) * 100)}%
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            className={buttonClass}
            disabled={sources.length >= 20}
            onClick={() => setSources((all) => [...all, { version_id: "", amount_g: "" }])}
          >
            + COMPONENT
          </button>
          {preview.length > 0 && (
            <div className="border border-border p-3">
              <p className="label-caps mb-2">합산 원재료 · {fmtNumber(total, 2)}g</p>
              {preview.map((r) => (
                <div key={r.ingredient_id} className="flex justify-between text-sm">
                  <span>{names.get(r.ingredient_id)}</span>
                  <span>{fmtNumber(r.amount, 2)}g</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            원본은 변경하지 않습니다. 생성 당시 배합을 복사하며 이후 원본 수정은 자동 반영되지
            않습니다. 사용량은 원재료 합산 중량 기준이며 제조 손실은 별도로 확인하세요.
          </p>
          {(validation ||
            choices.isError ||
            ingredientQueries.some((q) => q.isError) ||
            create.isError) && (
            <p role="alert" className="text-sm text-destructive">
              {validation ||
                (create.error as Error)?.message ||
                "원본 배합을 불러오지 못했습니다. 다시 시도하세요."}
            </p>
          )}
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={!ready || !!validation || !name.trim() || create.isPending}
          >
            {create.isPending ? "CREATING…" : "CREATE COMPONENT + FORMULA"}
          </button>
        </form>
      </div>
    </div>
  );
}
