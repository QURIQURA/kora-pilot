import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  categoriesQuery,
  currentUserId,
  ingredientFunctionsQuery,
  ingredientQuery,
} from "@/lib/queries";
import {
  BALANCE_ROLES,
  COMPOSITION_FIELDS,
  FAT_TYPE_OPTIONS,
  REFERENCE_BASIS_OPTIONS,
  SCALING_MODE_OPTIONS,
  SUGAR_TYPE_OPTIONS,
  TASTE_AXES,
  categoryPath,
  compositionSum,
} from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { FunctionPicker } from "@/components/pilot/FunctionPicker";
import { FlavourFamilySelect } from "@/components/pilot/FlavourFamilySelect";
import { AromaTagsInput } from "@/components/pilot/AromaTagsInput";
import { cn } from "@/lib/utils";
import {
  CollapsibleSection,
  Field,
  NextPhaseSection,
  SectionCard,
  buttonClass,
  inputClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/ingredients/$ingredientId")({
  head: () => ({
    meta: [
      { title: "PILOT — Ingredient Detail" },
      { name: "description", content: "Ingredient master data detail" },
      { property: "og:title", content: "PILOT — Ingredient Detail" },
      { property: "og:description", content: "Ingredient master data detail" },
    ],
  }),
  component: IngredientDetailPage,
});

function IngredientDetailPage() {
  const { ingredientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ingredient = useQuery(ingredientQuery(ingredientId));
  const categories = useQuery(categoriesQuery());
  const functions = useQuery(ingredientFunctionsQuery());

  const categoryList = categories.data ?? [];
  const path = categoryPath(categoryList, ingredient.data?.category_id ?? null);

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "INGREDIENTS", path: "/ingredients" },
    ...path.map((c) => ({ label: c.name })),
    { label: (ingredient.data?.name ?? "…").toUpperCase() },
  ]);

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"ingredients">) => {
      const { error } = await supabase
        .from("ingredients")
        .update(patch)
        .eq("id", ingredientId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["aroma_tag_usage"] });
    },
  });

  const setFunctions = useMutation({
    mutationFn: async (names: string[]) => {
      const userId = await currentUserId();
      const existing = functions.data ?? [];
      const ids: string[] = [];
      for (const name of names) {
        let fn = existing.find((f) => f.name === name);
        if (!fn) {
          const { data, error } = await supabase
            .from("ingredient_functions")
            .insert({ user_id: userId, name })
            .select("*")
            .single();
          if (error) throw error;
          fn = data;
        }
        ids.push(fn.id);
      }
      const { error: delError } = await supabase
        .from("ingredient_function_links")
        .delete()
        .eq("ingredient_id", ingredientId);
      if (delError) throw delError;
      if (ids.length > 0) {
        const { error } = await supabase.from("ingredient_function_links").insert(
          ids.map((functionId) => ({
            user_id: userId,
            ingredient_id: ingredientId,
            function_id: functionId,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["ingredient_functions"] });
    },
  });

  const [usageBlocked, setUsageBlocked] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: async () => {
      setUsageBlocked(null);
      setDeleteError(null);
      // 배합에서 사용 중인지 먼저 확인 — 사용 중이면 삭제하지 않는다
      const { count, error: countError } = await supabase
        .from("formula_version_ingredients")
        .select("id", { count: "exact", head: true })
        .eq("ingredient_id", ingredientId);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        setUsageBlocked(count ?? 0);
        return false;
      }
      // 기능 링크가 FK로 참조하므로 먼저 제거
      const { error: linkError } = await supabase
        .from("ingredient_function_links")
        .delete()
        .eq("ingredient_id", ingredientId);
      if (linkError) throw linkError;
      const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", ingredientId);
      if (error) throw error;
      return true;
    },
    onSuccess: async (deleted) => {
      if (!deleted) return;
      await queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      await queryClient.invalidateQueries({ queryKey: ["aroma_tag_usage"] });
      void navigate({ to: "/ingredients" });
    },
    onError: (e) => {
      setDeleteError(e instanceof Error ? e.message : String(e));
    },
  });

  if (!ingredient.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {ingredient.isLoading ? "LOADING…" : "INGREDIENT NOT FOUND"}
      </p>
    );
  }

  const data = ingredient.data;
  const selected = data.ingredient_function_links
    .map((l) => l.ingredient_functions?.name)
    .filter((n): n is string => Boolean(n));
  const sum = compositionSum(data);

  const saveComp = (key: (typeof COMPOSITION_FIELDS)[number]["key"], v: number | null) =>
    update.mutate({
      [key]: v,
      ...(v !== null && !data.composition_source
        ? { composition_source: "standard" as const }
        : {}),
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineText
            value={data.name}
            className="text-lg"
            onSave={(name) => update.mutate({ name })}
          />
          {data.name_en && (
            <p className="font-mono text-sm text-muted-foreground">
              {data.name_en}
            </p>
          )}
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <CategorySelect
          className={selectClass + " w-auto"}
          value={data.category_id ?? ""}
          onChange={(id) => update.mutate({ category_id: id || null })}
          emptyLabel="NO CATEGORY"
        />
      </div>

      {/* 기본 */}
      <CollapsibleSection title="기본 BASIC" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="영문명 NAME (ENGLISH)">
            <InlineInput
              value={data.name_en ?? ""}
              placeholder="예: Gelatin"
              onSave={(v) => update.mutate({ name_en: v.trim() || null })}
            />
          </Field>
          <Field label="기본 단위 DEFAULT UNIT">
            <InlineInput
              value={data.default_unit}
              onSave={(unit) =>
                update.mutate({ default_unit: unit.trim() || "g" })
              }
            />
          </Field>
          <Field label="공급처 SUPPLIER">
            <InlineInput
              value={data.supplier ?? ""}
              onSave={(supplier) => update.mutate({ supplier: supplier || null })}
            />
          </Field>
          <Field label="브랜드 BRAND">
            <InlineInput
              value={data.brand ?? ""}
              onSave={(brand) => update.mutate({ brand: brand || null })}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* 기능 */}
      <CollapsibleSection title="기능 FUNCTION">
        <div className="space-y-4">
          <FunctionPicker
            options={(functions.data ?? []).map((f) => f.name)}
            selected={selected}
            onChange={(next) => setFunctions.mutate(next)}
          />
          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              배합 균형 역할 BALANCE ROLES
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BALANCE_ROLES.map((role) => (
                <CheckRow
                  key={role.key}
                  label={role.label}
                  checked={data[role.key]}
                  onChange={(v) => update.mutate({ [role.key]: v })}
                />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 기능성 재료 */}
      <CollapsibleSection
        title="기능성 재료 FUNCTIONAL"
        badge={
          data.is_functional ? (
            <span className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              기능성
            </span>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <CheckRow
            label="기능성 재료 — 소량으로 텍스처 조절"
            checked={data.is_functional}
            onChange={(v) => update.mutate({ is_functional: v })}
          />
          {data.is_functional && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="사용률 기준 REFERENCE BASIS">
                <EnumSelect
                  value={data.reference_basis}
                  options={REFERENCE_BASIS_OPTIONS}
                  onChange={(v) => update.mutate({ reference_basis: v })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="사용률 MIN %">
                  <NullableNumberInput
                    value={data.typical_rate_min}
                    onSave={(v) => update.mutate({ typical_rate_min: v })}
                  />
                </Field>
                <Field label="사용률 MAX %">
                  <NullableNumberInput
                    value={data.typical_rate_max}
                    onSave={(v) => update.mutate({ typical_rate_max: v })}
                  />
                </Field>
              </div>
              <Field label="블룸 BLOOM (젤라틴)">
                <NullableNumberInput
                  value={data.bloom}
                  onSave={(v) => update.mutate({ bloom: v })}
                />
              </Field>
              <Field label="스케일링 SCALING MODE">
                <EnumSelect
                  value={data.scaling_mode}
                  options={SCALING_MODE_OPTIONS}
                  onChange={(v) =>
                    update.mutate({ scaling_mode: v ?? "linear" })
                  }
                />
              </Field>
              {data.scaling_mode === "sub_linear" && (
                <Field label="스케일링 지수 K (N^K)">
                  <NullableNumberInput
                    value={data.scaling_exponent}
                    onSave={(v) =>
                      update.mutate({ scaling_exponent: v ?? 1.0 })
                    }
                  />
                </Field>
              )}
              <div className="md:col-span-2">
                <Field label="공정 메모 PROCESS NOTE (대량 배치·취급 주의)">
                  <TextArea
                    value={data.process_note ?? ""}
                    onSave={(v) => update.mutate({ process_note: v || null })}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 조성 */}
      <CollapsibleSection
        title="조성 COMPOSITION"
        badge={
          data.composition_source === "verified" ? (
            <span className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              확인됨
            </span>
          ) : sum !== null ? (
            <span className="label-caps border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              표준값
            </span>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {COMPOSITION_FIELDS.map((field) => (
              <Field key={field.key} label={`${field.label} %`}>
                <NullableNumberInput
                  value={data[field.key]}
                  onSave={(v) => saveComp(field.key, v)}
                />
              </Field>
            ))}
          </div>

          {sum !== null && (
            <div className="space-y-1 border-t border-border pt-3">
              <p className="font-mono text-xs uppercase tabular-nums">
                합계 TOTAL {sum.toFixed(1)}%
              </p>
              {Math.abs(sum - 100) > 1 && (
                <p className="font-mono text-xs uppercase text-destructive">
                  합계가 100%에서 벗어났습니다 — 입력값을 확인하세요 (저장은
                  유지됩니다)
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="지방 종류 FAT TYPE">
              <EnumSelect
                value={data.fat_type}
                options={FAT_TYPE_OPTIONS}
                onChange={(v) => update.mutate({ fat_type: v })}
              />
            </Field>
            <Field label="당 종류 SUGAR TYPE">
              <EnumSelect
                value={data.sugar_type}
                options={SUGAR_TYPE_OPTIONS}
                onChange={(v) => update.mutate({ sugar_type: v })}
              />
            </Field>
            <Field label="PAC (빙점강하력, 수크로스=100)">
              <NullableNumberInput
                value={data.pac_value}
                onSave={(v) => update.mutate({ pac_value: v })}
              />
            </Field>
            <Field label="POD (감미도, 수크로스=100)">
              <NullableNumberInput
                value={data.pod_value}
                onSave={(v) => update.mutate({ pod_value: v })}
              />
            </Field>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            {data.composition_source === "verified" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-caps border border-foreground bg-foreground px-2 py-0.5 text-[11px] text-background">
                  확인됨 VERIFIED
                </span>
                <button
                  type="button"
                  className={`${buttonClass} px-3 text-xs`}
                  onClick={() => update.mutate({ composition_source: "standard" })}
                >
                  표준값으로 되돌리기
                </button>
              </div>
            ) : (
              <>
                <span className="label-caps inline-block border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  표준값 STANDARD
                </span>
                <p className="font-mono text-xs text-muted-foreground">
                  표준값입니다 — 실제 제품 성분표로 확인하면 정확해집니다.
                </p>
                <button
                  type="button"
                  className={`${buttonClass} px-3 text-xs`}
                  onClick={() => update.mutate({ composition_source: "verified" })}
                >
                  확인됨으로 표시
                </button>
              </>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 향미 */}
      <CollapsibleSection
        title="향미 FLAVOUR"
        badge={
          data.flavour_families ? (
            <span className="label-caps flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="inline-block h-3 w-3 border border-border"
                style={{ backgroundColor: data.flavour_families.color }}
              />
              {data.flavour_families.name}
            </span>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="향미 계열 FAMILY">
              <FlavourFamilySelect
                value={data.flavour_family_id ?? ""}
                onChange={(id) =>
                  update.mutate({ flavour_family_id: id || null })
                }
              />
            </Field>
            <Field label="향 강도 INTENSITY (1~5)">
              <select
                className={selectClass}
                value={data.flavour_intensity?.toString() ?? ""}
                onChange={(e) =>
                  update.mutate({
                    flavour_intensity: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === 1 ? " — 은은" : n === 5 ? " — 지배적" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              맛 축 TASTE (0~5)
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
              {TASTE_AXES.map((axis) => (
                <label key={axis.key} className="block space-y-1">
                  <span className="label-caps block text-[10px] text-muted-foreground">
                    {axis.label}
                  </span>
                  <select
                    className={selectClass}
                    value={data[axis.key]?.toString() ?? ""}
                    onChange={(e) =>
                      update.mutate({
                        [axis.key]: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">—</option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="label-caps block text-xs text-muted-foreground">
              아로마 태그 AROMA NOTES
            </span>
            <AromaTagsInput
              value={data.aroma_notes ?? []}
              onSave={(aroma_notes) => update.mutate({ aroma_notes })}
            />
          </div>

          <Field label="향미 메모 FLAVOUR NOTE">
            <TextArea
              value={data.flavour_note ?? ""}
              onSave={(v) => update.mutate({ flavour_note: v || null })}
            />
          </Field>
        </div>
      </CollapsibleSection>

      <SectionCard title="NOTES">
        <TextArea
          value={data.notes ?? ""}
          onSave={(notes) => update.mutate({ notes })}
        />
      </SectionCard>

      <NextPhaseSection title="USED IN FORMULAS" />

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (confirm("DELETE THIS INGREDIENT?")) remove.mutate();
        }}
      >
        DELETE INGREDIENT
      </button>
    </div>
  );
}

/* ── 인라인 입력 헬퍼 ─────────────────────────────────────── */

function InlineText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-foreground outline-none hover:border-border focus:border-foreground ${className ?? ""}`}
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

function InlineInput({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={inputClass}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

function NullableNumberInput({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  useEffect(() => setDraft(value?.toString() ?? ""), [value]);
  return (
    <input
      inputMode="decimal"
      className={`${inputClass} tabular-nums`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (!trimmed) {
          if (value !== null) onSave(null);
          return;
        }
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
          if (parsed !== value) onSave(parsed);
        } else {
          setDraft(value?.toString() ?? "");
        }
      }}
    />
  );
}

function EnumSelect({
  value,
  options,
  onChange,
  emptyLabel = "—",
}: {
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | null) => void;
  emptyLabel?: string;
}) {
  return (
    <select
      className={selectClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex min-h-[48px] w-full items-center gap-3 border border-border px-3 py-2 text-left hover:bg-secondary"
    >
      <span
        className={cn(
          "h-4 w-4 shrink-0 border",
          checked ? "border-foreground bg-foreground" : "border-input"
        )}
      />
      <span className="label-caps text-xs">{label}</span>
    </button>
  );
}

function TextArea({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      rows={4}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}
