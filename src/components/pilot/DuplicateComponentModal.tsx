import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, formulasByComponentQuery } from "@/lib/queries";
import { currentVersion } from "./FormulaSummary";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * COMPONENT DUPLICATE 모달.
 * 원본 Component의 CURRENT FORMULA(재료/몰드/수율/배쓰워터)를 그대로 복사해
 * 새 Component + Formula + Formula Version(V1, CURRENT)을 한 번에 만든다.
 * (예: "Vanilla Chiffon" → "Cacao Chiffon" 하고 재료만 바꿔서 개발 시작하고 싶을 때)
 *
 * "기준 배합에서 시작"(CurrentFormulaPanel의 startFromBase)과 동일한 복사 로직이지만,
 * 그건 component_id가 비어있는 새 Component에서만 쓸 수 있는 반면
 * 이건 이미 Formula가 있는 기존 Component 페이지에서 바로 호출할 수 있다.
 */
export function DuplicateComponentModal({
  sourceComponentId,
  sourceComponentName,
  onCancel,
  onCreated,
}: {
  sourceComponentId: string;
  sourceComponentName: string;
  onCancel: () => void;
  onCreated: (componentId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const formulas = useQuery(formulasByComponentQuery(sourceComponentId));
  const sourceFormula = (formulas.data ?? [])[0] ?? null;
  const sourceVersion = sourceFormula ? currentVersion(sourceFormula) : null;

  const [name, setName] = useState(`${sourceComponentName} Copy`);

  const duplicate = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("이름을 입력하세요");
      const user_id = await currentUserId();

      const { data: sourceComponent, error: sourceError } = await supabase
        .from("components")
        .select("technique_category_id, description, notes")
        .eq("id", sourceComponentId)
        .single();
      if (sourceError) throw sourceError;

      const { data: newComponent, error: componentError } = await supabase
        .from("components")
        .insert({
          user_id,
          name: trimmed,
          technique_category_id: sourceComponent.technique_category_id,
          description: sourceComponent.description,
          notes: sourceComponent.notes,
        })
        .select("id")
        .single();
      if (componentError) throw componentError;

      if (sourceFormula && sourceVersion) {
        const { data: sourceVersionFull, error: svError } = await supabase
          .from("formula_versions")
          .select("default_mould_id, yield_quantity, bath_water_g, basis_overrides, notes")
          .eq("id", sourceVersion.id)
          .single();
        if (svError) throw svError;

        const { data: sourceIngredients, error: siError } = await supabase
          .from("formula_version_ingredients")
          .select("ingredient_id, amount, unit, note, sort_order")
          .eq("formula_version_id", sourceVersion.id);
        if (siError) throw siError;

        const { data: newFormula, error: formulaError } = await supabase
          .from("formulas")
          .insert({
            user_id,
            name: trimmed,
            component_id: newComponent.id,
            method_id: sourceFormula.method_id,
            technique_category_id: sourceFormula.technique_category_id,
            derived_from_formula_id: sourceFormula.id,
          })
          .select("id")
          .single();
        if (formulaError) throw formulaError;

        const { data: newVersion, error: versionError } = await supabase
          .from("formula_versions")
          .insert({
            user_id,
            formula_id: newFormula.id,
            version_number: 1,
            status: "CURRENT",
            default_mould_id: sourceVersionFull.default_mould_id,
            yield_quantity: sourceVersionFull.yield_quantity,
            bath_water_g: sourceVersionFull.bath_water_g,
            basis_overrides: sourceVersionFull.basis_overrides,
            notes: sourceVersionFull.notes,
          })
          .select("id")
          .single();
        if (versionError) throw versionError;

        if ((sourceIngredients ?? []).length > 0) {
          const { error: ingredientsError } = await supabase.from("formula_version_ingredients").insert(
            (sourceIngredients ?? []).map((row) => ({
              user_id,
              formula_version_id: newVersion.id,
              ingredient_id: row.ingredient_id,
              amount: row.amount,
              unit: row.unit,
              note: row.note,
              sort_order: row.sort_order,
              amount_source: "copied",
            })),
          );
          if (ingredientsError) throw ingredientsError;
        }
      }

      return newComponent.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      onCreated(id);
      void navigate({ to: "/components/$componentId", params: { componentId: id } });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">DUPLICATE COMPONENT</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            duplicate.mutate();
          }}
        >
          <p className="font-mono text-xs uppercase text-muted-foreground">
            "{sourceComponentName}"의 현재 배합을 그대로 복사해 새 COMPONENT를 만듭니다.
            {sourceVersion
              ? " (재료/몰드/수율 전부 복사됨 — 새 이름 짓고 나서 재료만 바꾸면 됩니다)"
              : " (원본에 CURRENT 배합이 없어 COMPONENT만 새로 생성됩니다)"}
          </p>
          <Field label="NEW COMPONENT NAME">
            <input
              className={inputClass}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          {duplicate.isError && (
            <p className="font-mono text-xs uppercase text-destructive">
              {(duplicate.error as Error).message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={duplicate.isPending || !name.trim() || formulas.isLoading}
            >
              {duplicate.isPending ? "복제 중…" : "DUPLICATE"}
            </button>
            <button type="button" className={buttonClass} onClick={onCancel}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
