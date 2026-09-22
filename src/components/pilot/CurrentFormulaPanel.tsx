import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  baseFormulaLibraryQuery,
  currentUserId,
  formulasByComponentQuery,
  versionIngredientsQuery,
  type FormulaListRow,
} from "@/lib/queries";
import { currentVersion } from "./FormulaSummary";
import { fmtNumber, toGrams, versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import { ExperimentCreateModal } from "./ExperimentCreateForm";
import { VersionComparisonSheet } from "./VersionComparisonSheet";
import { SectionCard, StatusBadge, buttonClass, primaryButtonClass } from "./ui";

export function CurrentFormulaPanel({
  componentId,
  componentName,
}: {
  componentId: string;
  componentName: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const formulas = useQuery(formulasByComponentQuery(componentId));
  const baseLibrary = useQuery(baseFormulaLibraryQuery());

  const formula = (formulas.data ?? [])[0] ?? null;
  const version = formula ? currentVersion(formula) : null;
  const ingredients = useQuery(versionIngredientsQuery(version?.id ?? null));
  const rows = ingredients.data ?? [];

  const totalGrams = rows.reduce(
    (sum, row) => sum + (toGrams(Number(row.amount), row.unit) ?? 0),
    0,
  );
  const [showBaseLibrary, setShowBaseLibrary] = useState(false);
  const [creatingDevelopment, setCreatingDevelopment] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["formulas_by_component", componentId] });
    await queryClient.invalidateQueries({ queryKey: ["formulas"] });
  };

  const startBlank = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("formulas")
        .insert({ user_id, name: componentName, component_id: componentId })
        .select("id")
        .single();
      if (error) throw error;
      const { error: versionError } = await supabase
        .from("formula_versions")
        .insert({ user_id, formula_id: data.id, version_number: 1, status: "CURRENT" });
      if (versionError) throw versionError;
      return data.id;
    },
    onSuccess: async (id) => {
      await invalidate();
      void navigate({ to: "/formulas/$formulaId", params: { formulaId: id } });
    },
  });

  const startFromBase = useMutation({
    mutationFn: async (base: FormulaListRow) => {
      const user_id = await currentUserId();
      const baseVersionSummary = currentVersion(base);
      if (!baseVersionSummary) throw new Error("기준 배합에 CURRENT 버전이 없습니다");

      const { data: baseVersionFull, error: bvError } = await supabase
        .from("formula_versions")
        .select("default_mould_id, yield_quantity, bath_water_g, basis_overrides")
        .eq("id", baseVersionSummary.id)
        .single();
      if (bvError) throw bvError;

      const { data: baseIngredients, error: biError } = await supabase
        .from("formula_version_ingredients")
        .select("ingredient_id, amount, unit, note, sort_order")
        .eq("formula_version_id", baseVersionSummary.id);
      if (biError) throw biError;

      const { data: newFormula, error: formulaError } = await supabase
        .from("formulas")
        .insert({
          user_id,
          name: componentName,
          component_id: componentId,
          derived_from_formula_id: base.id,
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
          default_mould_id: baseVersionFull.default_mould_id,
          yield_quantity: baseVersionFull.yield_quantity,
          bath_water_g: baseVersionFull.bath_water_g,
          basis_overrides: baseVersionFull.basis_overrides,
        })
        .select("id")
        .single();
      if (versionError) throw versionError;

      if ((baseIngredients ?? []).length > 0) {
        const { error: ingredientsError } = await supabase.from("formula_version_ingredients").insert(
          (baseIngredients ?? []).map((row) => ({
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
      return newFormula.id;
    },
    onSuccess: async (id) => {
      await invalidate();
      void navigate({ to: "/formulas/$formulaId", params: { formulaId: id } });
    },
  });

  if (!formula) {
    const baseRows = baseLibrary.data ?? [];
    return (
      <SectionCard title="CURRENT FORMULA">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            아직 이 COMPONENT에 배합이 없습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={startBlank.isPending}
              onClick={() => startBlank.mutate()}
            >
              빈 배합으로 시작
            </button>
            {baseRows.length > 0 && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => setShowBaseLibrary((v) => !v)}
              >
                기준 배합에서 시작
              </button>
            )}
          </div>
          {showBaseLibrary && (
            <ul className="divide-y divide-border border border-border">
              {baseRows.map((base) => (
                <li key={base.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left hover:bg-secondary disabled:opacity-40"
                    disabled={startFromBase.isPending}
                    onClick={() => startFromBase.mutate(base)}
                  >
                    <span className="text-sm">
                      {base.name}
                      <span className="label-caps ml-2 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        ⭐ 기준 배합
                      </span>
                    </span>
                    <span className="label-caps text-xs text-muted-foreground">사용하기 →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="CURRENT FORMULA"
      action={
        <Link
          to="/formulas/$formulaId"
          params={{ formulaId: formula.id }}
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
        >
          OPEN FULL FORMULA →
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formula.name}</span>
          {version && (
            <span className="label-caps text-xs text-muted-foreground">
              {versionLabel(version.version_number)}
            </span>
          )}
          {version && <StatusBadge status={version.status} />}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">TOTAL WEIGHT</span>
            <p className="font-mono text-base tabular-nums">{fmtNumber(totalGrams)}g</p>
          </div>
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">INGREDIENTS</span>
            <p className="font-mono text-base tabular-nums">{rows.length}</p>
          </div>
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">UPDATED</span>
            <p className="font-mono text-xs text-muted-foreground">
              {formatDateTime(formula.updated_at)}
            </p>
          </div>
        </div>

        {/* 재료 리스트 대신 버전 비교 시트를 바로 보여준다 — Formula 상세 페이지까지 들어가지
            않아도 이 Component의 모든 버전이 뭐가 다른지 한눈에 볼 수 있게. 실제 편집은 항상
            "OPEN FULL FORMULA"에서 버전을 선택해서 한다 (읽기 전용). */}
        {(formula.formula_versions ?? []).length > 0 && (
          <VersionComparisonSheet versions={formula.formula_versions} />
        )}

        <button
          type="button"
          className={primaryButtonClass}
          disabled={!version}
          onClick={() => setCreatingDevelopment(true)}
        >
          + START DEVELOPMENT
        </button>
      </div>

      {creatingDevelopment && version && (
        <ExperimentCreateModal
          preset={{
            formulaId: formula.id,
            formulaVersionId: version.id,
            componentId,
          }}
          onCancel={() => setCreatingDevelopment(false)}
          onCreated={(id) => {
            setCreatingDevelopment(false);
            void navigate({ to: "/experiments/$experimentId", params: { experimentId: id } });
          }}
        />
      )}
    </SectionCard>
  );
}
