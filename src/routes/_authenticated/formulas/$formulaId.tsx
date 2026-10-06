import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  formulaQuery,
  formulaVersionBatchesQuery,
  formulaVersionsQuery,
  mouldsQuery,
  baseWeightsQuery,
  versionIngredientsQuery,
  componentsQuery,
  techniqueCategoriesQuery,
  methodsQuery,
  type VersionIngredientRow,
} from "@/lib/queries";
import { methodLabel } from "@/lib/method";
import {
  SECONDARY_UNITS,
  UNITS,
  fmtNumber,
  parseNumber,
  toGrams,
  versionLabel,
  type FormulaStatus,
  type FormulaVersion,
  type FormulaVersionBatch,
} from "@/lib/formula";
import {
  computeBases,
  functionalRowCalc,
  gelatinConvert,
  mouldBatchMultiplier,
  parseBasisOverrides,
  rowScaledGrams,
  scaledAmount,
  type BasisInfo,
  type BasisKey,
  type BasisOverrides,
} from "@/lib/formula-calc";
import { functionShortName, ingredientDisplayName } from "@/lib/pilot";
import { formatDateTime } from "@/lib/datetime";
import { techniquePath } from "@/lib/technique";
import { confirmBaseFormula } from "@/lib/technique-actions";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { MouldSelect } from "@/components/pilot/MouldSelect";
import { BaseWeightSelect } from "@/components/pilot/BaseWeightSelect";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import { MethodSelect } from "@/components/pilot/MethodSelect";
import { IngredientPicker } from "@/components/pilot/IngredientPicker";
import { BasisPanel } from "@/components/pilot/formula/BasisPanel";
import { RangeBar } from "@/components/pilot/RangeBar";
import { CompositionPanel } from "@/components/pilot/formula/CompositionPanel";
import { BalancePanel } from "@/components/pilot/formula/BalancePanel";
import { VersionComparisonSheet } from "@/components/pilot/VersionComparisonSheet";
import { cn } from "@/lib/utils";
import {
  Field,
  SectionCard,
  StatusBadge,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/formulas/$formulaId")({
  head: () => ({
    meta: [
      { title: "PILOT — Formula Detail" },
      { name: "description", content: "Formula versions, ingredient table and batch scaling" },
      { property: "og:title", content: "PILOT — Formula Detail" },
      {
        property: "og:description",
        content: "Formula versions, ingredient table and batch scaling",
      },
    ],
  }),
  component: FormulaDetailPage,
});

/** ingredient row에 patch할 수 있는 필드 (functional/bulk 공통) */
export interface FunctionalRowPatch {
  amount?: number;
  unit?: string;
  note?: string | null;
  amount_source?: string;
  /** 표시 전용 보조 계량 (예: 3개, 1Tbsp) — %/배수 계산에는 관여하지 않는다 */
  secondary_amount?: number | null;
  secondary_unit?: string | null;
}

/** EDIT 모드에서 저장 전까지 들고 있는 로컬 초안 — SAVE를 눌러야 실제로 반영된다 */
interface RowDraft {
  amount: string;
  unit: string;
  note: string;
  /** 보조 계량 초안 (예: "3" + "개") — 비워두면 저장 시 null */
  secondaryAmount: string;
  secondaryUnit: string;
}

interface BatchDraft {
  label: string;
  multiplier: string;
  /** 몰드 연결 모드일 때만 사용 — 비어있으면 배수 직접입력 모드(2026-09-24) */
  mouldId: string;
  mouldCount: string;
}

interface PageDraft {
  name: string;
  techniqueId: string;
  isBase: boolean;
  methodId: string;
  componentId: string;
  mouldId: string;
  baseWeightId: string;
  yieldQuantity: string;
  notes: string;
  rows: Record<string, RowDraft>;
  batches: Record<string, BatchDraft>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 헤더의 기법/방법/기준배합/컴포넌트/SAVE — 중요도가 낮은 부가 정보라 한 박스에 모으고
 * 버튼도 표준 크기(min-h-44px)보다 작게 줄인다. 앱 전역 selectClass/buttonClass는 그대로
 * 두고(다른 화면 터치 타겟에 영향 없게) 이 페이지 안에서만 쓰는 축소 버전. */
const compactSelectClass =
  "min-h-[32px] border border-input bg-background px-2 py-1 font-body text-xs text-foreground outline-none focus:border-foreground disabled:opacity-60";
const compactButtonClass =
  "label-caps inline-flex min-h-[30px] items-center justify-center border border-input bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-secondary disabled:opacity-40";
const compactPrimaryButtonClass =
  "label-caps inline-flex min-h-[30px] items-center justify-center border border-foreground bg-foreground px-2 py-1 text-[11px] text-background transition-colors hover:opacity-90 disabled:opacity-40";

function FormulaDetailPage() {
  const { formulaId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const formula = useQuery(formulaQuery(formulaId));
  const versions = useQuery(formulaVersionsQuery(formulaId));
  const moulds = useQuery(mouldsQuery());
  const baseWeights = useQuery(baseWeightsQuery());
  const components = useQuery(componentsQuery());
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const methods = useQuery(methodsQuery());

  const versionList = useMemo(() => versions.data ?? [], [versions.data]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [batch, setBatch] = useState("1");
  const [basisId, setBasisId] = useState(""); // baker's % 기준 재료
  const [adding, setAdding] = useState(false);
  // "+ ADD BATCH" 1단계 추가 폼 — 몰드+개수를 바로 입력해서 배수 열을 만든다(2026-09-24)
  const [addingBatch, setAddingBatch] = useState(false);
  const [newBatchMouldId, setNewBatchMouldId] = useState("");
  const [newBatchCount, setNewBatchCount] = useState("1");
  const [newBatchManualMultiplier, setNewBatchManualMultiplier] = useState("2");
  const [newBatchLabel, setNewBatchLabel] = useState("");
  // 저장된 배수 열 수정(2026-09-30) — 헤더에 몰드 드롭다운/스위치 버튼을 계속 늘어놓는 대신,
  // ADD BATCH와 같은 팝업으로 이름/배수만 바로 고칠 수 있게 뺐다. 몰드 기준 계산은 열을 새로
  // 만들 때(ADD BATCH)만 하고, 만든 뒤에는 배수 숫자를 직접 입력해 바꾼다.
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editBatchLabel, setEditBatchLabel] = useState("");
  const [editBatchMultiplier, setEditBatchMultiplier] = useState("2");
  const [creatingVersion, setCreatingVersion] = useState(false);

  // UNLOCK→EDIT 2단계를 없애고, 페이지를 열자마자 바로 수정할 수 있게 한다 — draft가 로드되면
  // 곧 "편집 중"인 것이므로 별도의 editing 상태를 두지 않고 draft 존재 여부로 파생한다.
  const [draft, setDraft] = useState<PageDraft | null>(null);
  const editing = Boolean(draft);
  const initializedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (versionList.length === 0) return;
    if (versionId && versionList.some((v) => v.id === versionId)) return;
    const current =
      versionList.find((v) => v.status === "CURRENT") ?? versionList[versionList.length - 1];
    setVersionId(current?.id ?? null);
  }, [versionList, versionId]);

  const version = versionList.find((v) => v.id === versionId) ?? null;
  const ingredients = useQuery(versionIngredientsQuery(versionId));
  const rows = ingredients.data ?? [];
  const batchPresetsQuery = useQuery(formulaVersionBatchesQuery(versionId));
  const batchPresets = useMemo(() => batchPresetsQuery.data ?? [], [batchPresetsQuery.data]);
  // 편집 중엔 저장 전 draft 배수/이름/몰드를 미리 반영해서 보여준다(BASE ×1 칸이 즉시 미리보기 되는
  // 것과 동일한 동작) — 그렇지 않으면 바꿔도 SAVE 전까지 재료량 칸이 안 바뀌어 "적용 안 됨"처럼 보임.
  // 몰드가 연결된 열은 "몰드 개수"를 배수로 자동 환산한다(mouldBatchMultiplier, 2026-09-24).
  const effectiveBatchPresets = useMemo(() => {
    const baseMould = (moulds.data ?? []).find((m) => m.id === (version?.default_mould_id ?? "")) ?? null;
    return batchPresets.map((preset) => {
      const d = draft?.batches[preset.id];
      if (!d) return { ...preset, mismatch: false };
      const label = d.label.trim() || preset.label;
      if (d.mouldId) {
        const targetMould = (moulds.data ?? []).find((m) => m.id === d.mouldId) ?? null;
        const count = parseNumber(d.mouldCount) || 1;
        const { multiplier, mismatch } = mouldBatchMultiplier(count, targetMould, baseMould);
        return { ...preset, multiplier, label, mould_id: d.mouldId, mould_count: count, mismatch };
      }
      const draftMultiplier = parseNumber(d.multiplier);
      return {
        ...preset,
        multiplier: draftMultiplier > 0 ? draftMultiplier : preset.multiplier,
        label,
        mould_id: null,
        mould_count: null,
        mismatch: false,
      };
    });
  }, [batchPresets, draft, moulds.data, version?.default_mould_id]);

  // 버전을 바꾸면 이전 버전의 초안은 버리고, 아래 초기화 effect가 새 버전 데이터로 다시 채운다.
  useEffect(() => {
    setDraft(null);
    initializedVersionRef.current = null;
  }, [versionId]);

  // 이 Formula가 속한 Component — 브레드크럼/상단 링크에서 "어디서 왔는지"가 바로 보이도록.
  // Component 없는 기준 배합(라이브러리)은 여전히 FORMULAS로 표시.
  const linkedComponent = (components.data ?? []).find(
    (c) => c.id === formula.data?.component_id,
  );

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    ...(linkedComponent
      ? [
          { label: "COMPONENTS", path: "/components" },
          {
            label: linkedComponent.name.toUpperCase(),
            path: `/components/${linkedComponent.id}`,
          },
        ]
      : [{ label: "FORMULAS", path: "/formulas" }]),
    { label: (formula.data?.name ?? "…").toUpperCase() },
    ...(version ? [{ label: versionLabel(version.version_number) }] : []),
  ]);

  const batchValue = Math.max(parseNumber(batch) || 0, 0) || 1;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["formulas"] });
    await queryClient.invalidateQueries({ queryKey: ["formulas", formulaId] });
    await queryClient.invalidateQueries({
      queryKey: ["formula_versions", formulaId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["formula_version_ingredients", versionId],
    });
    await queryClient.invalidateQueries({ queryKey: ["formula_version_batches", versionId] });
    await queryClient.invalidateQueries({ queryKey: ["mould_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["base_weight_usage"] });
    await queryClient.invalidateQueries({ queryKey: ["formulas_by_technique"] });
  };

  /** 현재 저장된 값으로부터 초안을 새로 만든다 — 페이지 첫 로드 시 자동 초기화, 그리고
   * "되돌리기"(변경 취소)에도 재사용한다. */
  const buildDraft = (): PageDraft | null => {
    if (!formula.data || !version) return null;
    return {
      name: formula.data.name,
      techniqueId: formula.data.technique_category_id ?? "",
      isBase: formula.data.is_base_formula,
      methodId: formula.data.method_id ?? "",
      componentId: formula.data.component_id ?? "",
      mouldId: version.default_mould_id ?? "",
      baseWeightId: version.default_base_weight_id ?? "",
      yieldQuantity: version.yield_quantity != null ? String(version.yield_quantity) : "",
      notes: version.notes ?? "",
      rows: Object.fromEntries(
        rows.map((row) => [
          row.id,
          {
            amount: String(row.amount),
            unit: row.unit,
            note: row.note ?? "",
            secondaryAmount: row.secondary_amount != null ? String(row.secondary_amount) : "",
            secondaryUnit: row.secondary_unit ?? "",
          },
        ]),
      ),
      batches: Object.fromEntries(
        batchPresets.map((preset) => [
          preset.id,
          {
            label: preset.label ?? "",
            multiplier: String(preset.multiplier),
            mouldId: preset.mould_id ?? "",
            mouldCount: preset.mould_count != null ? String(preset.mould_count) : "1",
          },
        ]),
      ),
    };
  };

  // 페이지를 열면(또는 버전을 바꾸면) 곧바로 편집 가능한 초안을 만든다 — UNLOCK→EDIT 없이 바로 수정.
  // 각 버전마다 한 번만 초기화하고, 그 뒤로는 진행 중인 편집을 데이터 재조회가 덮어쓰지 않는다.
  useEffect(() => {
    if (!versionId || initializedVersionRef.current === versionId) return;
    if (!formula.data || !version) return;
    if (!ingredients.isSuccess || !batchPresetsQuery.isSuccess) return;
    const next = buildDraft();
    if (!next) return;
    setDraft(next);
    initializedVersionRef.current = versionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, formula.data, version, ingredients.isSuccess, batchPresetsQuery.isSuccess]);

  /** draft가 저장된 값과 실제로 다른 부분이 있는지 — SAVE 버튼 활성화 조건 */
  const isDirty = (() => {
    if (!draft || !formula.data || !version) return false;
    if (draft.name.trim() !== formula.data.name) return true;
    if (draft.techniqueId !== (formula.data.technique_category_id ?? "")) return true;
    if (draft.isBase !== formula.data.is_base_formula) return true;
    if (draft.methodId !== (formula.data.method_id ?? "")) return true;
    if (draft.componentId !== (formula.data.component_id ?? "")) return true;
    if (draft.mouldId !== (version.default_mould_id ?? "")) return true;
    if (draft.baseWeightId !== (version.default_base_weight_id ?? "")) return true;
    const draftYield = draft.yieldQuantity ? parseNumber(draft.yieldQuantity) : null;
    const currentYield = version.yield_quantity != null ? Number(version.yield_quantity) : null;
    if (draftYield !== currentYield) return true;
    if (draft.notes !== (version.notes ?? "")) return true;
    for (const row of rows) {
      const d = draft.rows[row.id];
      if (!d) continue;
      if (parseNumber(d.amount) !== Number(row.amount)) return true;
      if (d.unit !== row.unit) return true;
      if ((d.note.trim() || null) !== (row.note ?? null)) return true;
      const nextSecondaryAmount = d.secondaryAmount.trim() ? parseNumber(d.secondaryAmount) : null;
      if (nextSecondaryAmount !== (row.secondary_amount ?? null)) return true;
      const nextSecondaryUnit = d.secondaryUnit.trim() || null;
      if (nextSecondaryUnit !== (row.secondary_unit ?? null)) return true;
    }
    for (const preset of batchPresets) {
      const d = draft.batches[preset.id];
      if (!d) continue;
      if (d.mouldId !== (preset.mould_id ?? "")) return true;
      if (d.mouldId) {
        const nextCount = parseNumber(d.mouldCount) || 1;
        if (nextCount !== Number(preset.mould_count ?? 1)) return true;
      } else {
        const nextMultiplier = parseNumber(d.multiplier) || Number(preset.multiplier);
        if (nextMultiplier !== Number(preset.multiplier)) return true;
      }
      if ((d.label.trim() || null) !== (preset.label ?? null)) return true;
    }
    return false;
  })();

  const patchRowDraft = (rowId: string, patch: Partial<RowDraft>) => {
    setDraft((d) => {
      if (!d) return d;
      const current = d.rows[rowId] ?? {
        amount: "0",
        unit: "g",
        note: "",
        secondaryAmount: "",
        secondaryUnit: "",
      };
      return { ...d, rows: { ...d.rows, [rowId]: { ...current, ...patch } } };
    });
  };

  const patchBatchDraft = (batchId: string, patch: Partial<BatchDraft>) => {
    setDraft((d) => {
      if (!d) return d;
      const current = d.batches[batchId] ?? { label: "", multiplier: "1", mouldId: "", mouldCount: "1" };
      return { ...d, batches: { ...d.batches, [batchId]: { ...current, ...patch } } };
    });
  };

  const updateFormula = useMutation({
    mutationFn: async (patch: {
      name?: string;
      component_id?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("formulas").update(patch).eq("id", formulaId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addIngredient = useMutation({
    mutationFn: async ({ id, unit }: { id: string; unit: string }) => {
      if (!versionId) return;
      const user_id = await currentUserId();
      const { error } = await supabase.from("formula_version_ingredients").insert({
        user_id,
        formula_version_id: versionId,
        ingredient_id: id,
        amount: 0,
        unit,
        sort_order: rows.length,
        amount_source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("formula_version_ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const [reorderError, setReorderError] = useState<string | null>(null);

  /** 재료 행 드래그 재정렬 — 공정 순서대로 배열하기 위한 것으로, EDIT 모드와 무관하게
   *  (LOCK만 아니면) 바로 저장된다. sort_order만 바뀌므로 SAVE를 별도로 요구하지 않는다. */
  const reorderRows = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds
        .map((id, index) => ({ id, index }))
        .filter(({ id, index }) => rows.find((r) => r.id === id)?.sort_order !== index);
      await Promise.all(
        updates.map(({ id, index }) =>
          supabase
            .from("formula_version_ingredients")
            .update({ sort_order: index })
            .eq("id", id)
            .then(({ error }) => {
              if (error) throw error;
            }),
        ),
      );
    },
    onSuccess: () => {
      setReorderError(null);
      void invalidate();
    },
    // 2026-10-06 사용자 요청: 드래그 재정렬이 저장 안 되고 페이지를 떠나면 원래대로 돌아가
    // 있던 문제 — 실패가 화면엔 전혀 안 보이고 콘솔에만 찍혀서 저장 안 된 걸 알 수가 없었다.
    // 실패 시 눈에 보이게 알리고, queryData에 미리 반영했던 낙관적 순서도 실제 저장된 값으로
    // 되돌린다(그래야 "성공한 것처럼 보이는" 거짓 화면이 안 남는다).
    onError: (error) => {
      console.error("재료 순서 저장 실패", error);
      setReorderError(error instanceof Error ? error.message : "재료 순서 저장에 실패했습니다");
      // 실패 시 미리 반영했던 낙관적 순서(queryData)를 DB의 실제 값으로 다시 맞춘다 —
      // "성공한 것처럼 보이는" 화면이 남지 않도록.
      void queryClient.invalidateQueries({ queryKey: ["formula_version_ingredients", versionId] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleIngredientDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    queryClient.setQueryData(["formula_version_ingredients", versionId], reordered);
    reorderRows.mutate(reordered.map((r) => r.id));
  };

  const addBatchPreset = useMutation({
    mutationFn: async (input: {
      mouldId: string | null;
      mouldCount: number;
      multiplier: number;
      label: string | null;
    }) => {
      if (!versionId) return;
      const user_id = await currentUserId();
      const { error } = await supabase.from("formula_version_batches").insert({
        user_id,
        formula_version_id: versionId,
        multiplier: input.multiplier,
        mould_id: input.mouldId,
        mould_count: input.mouldId ? input.mouldCount : null,
        label: input.label,
        sort_order: batchPresets.length,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeBatchPreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("formula_version_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error) => {
      console.error("removeBatchPreset failed", error);
      window.alert("배치 열 삭제에 실패했습니다. 다시 시도해 주세요.");
    },
  });

  // 저장된 배수 열의 이름/배수 수정(2026-09-30) — EDIT 팝업에서 호출. 배수를 원래 값에서
  // 바꾸면 몰드 연결을 풀고(직접입력으로 전환) 새 배수를 그대로 저장한다. 이름만 바꿨다면
  // 몰드 연결은 그대로 둔다.
  const updateBatchPreset = useMutation({
    mutationFn: async ({
      id,
      label,
      multiplier,
      keepMould,
    }: {
      id: string;
      label: string | null;
      multiplier: number;
      keepMould: boolean;
    }) => {
      const patch: Partial<FormulaVersionBatch> = { label };
      if (!keepMould) {
        patch.mould_id = null;
        patch.mould_count = null;
        patch.multiplier = multiplier;
      }
      const { error } = await supabase.from("formula_version_batches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setEditingBatchId(null);
      await invalidate();
    },
  });

  /** SAVE — draft와 저장된 값을 비교해 바뀐 것만 커밋한다 */
  const saveAll = useMutation({
    mutationFn: async () => {
      if (!draft || !formula.data || !version) return;

      // 이름 / component
      const formulaPatch: { name?: string; component_id?: string | null } = {};
      const trimmedName = draft.name.trim();
      if (trimmedName && trimmedName !== formula.data.name) formulaPatch.name = trimmedName;
      if (draft.componentId !== (formula.data.component_id ?? ""))
        formulaPatch.component_id = draft.componentId || null;
      if (Object.keys(formulaPatch).length > 0) {
        const { error } = await supabase.from("formulas").update(formulaPatch).eq("id", formulaId);
        if (error) throw error;
      }

      // 기법 / 기준 배합 / METHOD
      const techChanged = draft.techniqueId !== (formula.data.technique_category_id ?? "");
      const baseChanged = draft.isBase !== formula.data.is_base_formula;
      const methodChanged = draft.methodId !== (formula.data.method_id ?? "");
      if (techChanged || baseChanged) {
        const base = await confirmBaseFormula({
          formulaId,
          techniqueId: draft.techniqueId || null,
          isBase: draft.isBase,
        });
        const { error } = await supabase
          .from("formulas")
          .update({
            technique_category_id: draft.techniqueId || null,
            is_base_formula: base,
            method_id: draft.methodId || null,
          })
          .eq("id", formulaId);
        if (error) throw error;
      } else if (methodChanged) {
        const { error } = await supabase
          .from("formulas")
          .update({ method_id: draft.methodId || null })
          .eq("id", formulaId);
        if (error) throw error;
      }

      // 버전(몰드/YIELD/NOTES)
      const versionPatch: Partial<FormulaVersion> = {};
      if (draft.mouldId !== (version.default_mould_id ?? ""))
        versionPatch.default_mould_id = draft.mouldId || null;
      if (draft.baseWeightId !== (version.default_base_weight_id ?? ""))
        versionPatch.default_base_weight_id = draft.baseWeightId || null;
      const draftYield = draft.yieldQuantity ? parseNumber(draft.yieldQuantity) : null;
      const currentYield = version.yield_quantity != null ? Number(version.yield_quantity) : null;
      if (draftYield !== currentYield) versionPatch.yield_quantity = draftYield;
      if (draft.notes !== (version.notes ?? "")) versionPatch.notes = draft.notes;
      if (Object.keys(versionPatch).length > 0) {
        const { error } = await supabase
          .from("formula_versions")
          .update(versionPatch)
          .eq("id", versionId!);
        if (error) throw error;
      }

      // 재료 행
      for (const row of rows) {
        const d = draft.rows[row.id];
        if (!d) continue;
        const patch: FunctionalRowPatch = {};
        const nextAmount = parseNumber(d.amount);
        if (nextAmount !== Number(row.amount)) {
          patch.amount = nextAmount;
          patch.amount_source = "manual";
        }
        if (d.unit !== row.unit) patch.unit = d.unit;
        const nextNote = d.note.trim() || null;
        if (nextNote !== (row.note ?? null)) patch.note = nextNote;
        const nextSecondaryAmount = d.secondaryAmount.trim() ? parseNumber(d.secondaryAmount) : null;
        if (nextSecondaryAmount !== (row.secondary_amount ?? null))
          patch.secondary_amount = nextSecondaryAmount;
        const nextSecondaryUnit = d.secondaryUnit.trim() || null;
        if (nextSecondaryUnit !== (row.secondary_unit ?? null))
          patch.secondary_unit = nextSecondaryUnit;
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase
            .from("formula_version_ingredients")
            .update(patch)
            .eq("id", row.id);
          if (error) throw error;
        }
      }

      // 배수 프리셋 (이름/배수/몰드)
      const baseMouldForSave =
        (moulds.data ?? []).find((m) => m.id === (version.default_mould_id ?? "")) ?? null;
      for (const preset of batchPresets) {
        const d = draft.batches[preset.id];
        if (!d) continue;
        const patch: Partial<FormulaVersionBatch> = {};
        const nextMouldId = d.mouldId || null;
        if (nextMouldId !== (preset.mould_id ?? null)) patch.mould_id = nextMouldId;
        if (nextMouldId) {
          const nextCount = parseNumber(d.mouldCount) || 1;
          if (nextCount !== Number(preset.mould_count ?? 1)) patch.mould_count = nextCount;
          const targetMould = (moulds.data ?? []).find((m) => m.id === nextMouldId) ?? null;
          const { multiplier } = mouldBatchMultiplier(nextCount, targetMould, baseMouldForSave);
          if (multiplier !== Number(preset.multiplier)) patch.multiplier = multiplier;
        } else {
          const nextMultiplier = parseNumber(d.multiplier) || Number(preset.multiplier);
          if (nextMultiplier !== Number(preset.multiplier)) patch.multiplier = nextMultiplier;
          if (preset.mould_count != null) patch.mould_count = null;
        }
        const nextLabel = d.label.trim() || null;
        if (nextLabel !== (preset.label ?? null)) patch.label = nextLabel;
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase
            .from("formula_version_batches")
            .update(patch)
            .eq("id", preset.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      // draft는 그대로 둔다 — 방금 저장한 값과 이미 같으므로, 재조회가 끝나면 isDirty가
      // 자연히 false가 된다(별도로 편집모드를 껐다 켤 필요 없음 — 페이지는 항상 편집 가능).
      await invalidate();
    },
  });

  const createVersion = useMutation({
    mutationFn: async ({ summary, reason }: { summary: string; reason: string }) => {
      const user_id = await currentUserId();
      const nextNumber = versionList.reduce((max, v) => Math.max(max, v.version_number), 0) + 1;
      const { data, error } = await supabase
        .from("formula_versions")
        .insert({
          user_id,
          formula_id: formulaId,
          version_number: nextNumber,
          status: "DRAFT",
          default_mould_id: version?.default_mould_id ?? null,
          yield_quantity: version?.yield_quantity ?? null,
          change_summary: summary || null,
          change_reason: reason || null,
          bath_water_g: version?.bath_water_g ?? null,
          basis_overrides: version?.basis_overrides ?? {},
        })
        .select("id")
        .single();
      if (error) throw error;
      if (rows.length > 0) {
        const { error: copyError } = await supabase.from("formula_version_ingredients").insert(
          rows.map((row) => ({
            user_id,
            formula_version_id: data.id,
            ingredient_id: row.ingredient_id,
            amount: row.amount,
            unit: row.unit,
            sort_order: row.sort_order,
            note: row.note,
            secondary_amount: row.secondary_amount,
            secondary_unit: row.secondary_unit,
            // 새 버전으로 복사된 값은 'copied'로 시작, 수정 시 'manual'이 된다
            amount_source: "copied",
          })),
        );
        if (copyError) throw copyError;
      }
      return data.id;
    },
    onSuccess: async (id) => {
      await invalidate();
      setCreatingVersion(false);
      setVersionId(id ?? null);
    },
  });

  const removeFormula = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("formulas").delete().eq("id", formulaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      void navigate({ to: "/formulas" });
    },
  });

  if (!formula.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {formula.isLoading ? "LOADING…" : "FORMULA NOT FOUND"}
      </p>
    );
  }

  /* ── 계산 (전부 표시용 — 저장되는 것은 amount와 amount_source뿐) ── */
  const overrides: BasisOverrides = parseBasisOverrides(version?.basis_overrides);
  const bathWaterG = version?.bath_water_g != null ? Number(version.bath_water_g) : null;
  const bases = computeBases(rows, overrides, bathWaterG);

  // 총 중량 — N^k 스케일링 반영
  const totalGrams = rows.reduce((sum, row) => {
    const grams = toGrams(Number(row.amount), row.unit);
    return sum + (grams ?? 0);
  }, 0);
  const totalScaled = rows.reduce((sum, row) => sum + rowScaledGrams(row, batchValue).scaled, 0);

  // 배수 ≥ 2 + process_note 보유 재료 → 공정 주의
  const processCautions = batchValue >= 2 ? rows.filter((r) => r.ingredients?.process_note) : [];

  // baker's % 기준 (테이블 수동 선택)
  const basisRow = rows.find((r) => r.ingredient_id === basisId) ?? null;
  const basisGrams = basisRow ? (toGrams(Number(basisRow.amount), basisRow.unit) ?? 0) : 0;
  const denominator = basisRow ? basisGrams : totalGrams;

  const mould = (moulds.data ?? []).find((m) => m.id === version?.default_mould_id);
  const baseWeight = (baseWeights.data ?? []).find((b) => b.id === version?.default_base_weight_id);
  const effectiveComponentId = editing
    ? (draft?.componentId ?? "")
    : (formula.data.component_id ?? "");
  const scalingMode =
    (components.data ?? []).find((c) => c.id === effectiveComponentId)?.scaling_mode ?? "MOULD";
  const yieldQty = version?.yield_quantity ? Number(version.yield_quantity) : 0;

  const techniqueList = techniqueCategories.data ?? [];
  const techniquePathList = techniquePath(techniqueList, formula.data.technique_category_id);
  const technique = techniquePathList[techniquePathList.length - 1] ?? null;
  const method = (methods.data ?? []).find((m) => m.id === formula.data.method_id) ?? null;

  const canEditPage = Boolean(version);
  const fieldsDisabled = !editing;

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          {/* Component로 돌아가는 링크 — 스크롤 없이 바로 보이도록 제목 바로 위, 항상 맨 먼저 표시.
              Component에서 넘어왔든 다른 경로로 들어왔든 component_id만 있으면 항상 뜬다. */}
          {linkedComponent && (
            <Link
              to="/components/$componentId"
              params={{ componentId: linkedComponent.id }}
              className="label-caps inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              ← {linkedComponent.name.toUpperCase()}
            </Link>
          )}
          <input
            className="w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-lg text-foreground outline-none hover:border-border focus:border-foreground disabled:cursor-not-allowed disabled:opacity-70"
            value={editing ? (draft?.name ?? "") : formula.data.name}
            disabled={fieldsDisabled}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, name: e.target.value } : d))
            }
          />
          {technique && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/settings/calibration/$techniqueId"
                params={{ techniqueId: technique.id }}
                className="label-caps inline-block border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                {technique.name}
              </Link>
              {method && (
                <span className="label-caps inline-block border border-border px-2 py-1 text-xs text-muted-foreground">
                  {methodLabel(method)}
                </span>
              )}
              {formula.data.is_base_formula && (
                <span className="label-caps inline-block border border-border bg-secondary px-2 py-1 text-xs">
                  ⭐ 기준 배합
                </span>
              )}
            </div>
          )}
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(formula.data.updated_at)}
          </p>
        </div>
      </div>

      {/* 부가 정보(기법/방법/기준배합/컴포넌트)와 SAVE를 한 박스에 — 중요도가 낮은 편집
          컨트롤들이라 하나로 모으고 버튼도 작게 줄여서, 페이지 상단이 INGREDIENTS 앞을
          너무 많이 차지하지 않도록 한다. */}
      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <TechniqueSelect
          className={`${compactSelectClass} w-auto`}
          value={editing ? (draft?.techniqueId ?? "") : (formula.data.technique_category_id ?? "")}
          disabled={fieldsDisabled}
          onChange={(id) => setDraft((d) => (d ? { ...d, techniqueId: id ?? "" } : d))}
        />
        <MethodSelect
          className={`${compactSelectClass} w-auto`}
          techniqueCategoryId={
            editing ? (draft?.techniqueId ?? "") : (formula.data.technique_category_id ?? "")
          }
          value={editing ? (draft?.methodId ?? "") : (formula.data.method_id ?? "")}
          disabled={fieldsDisabled}
          onChange={(id) => setDraft((d) => (d ? { ...d, methodId: id ?? "" } : d))}
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="h-4 w-4 border border-input"
            checked={editing ? (draft?.isBase ?? false) : formula.data.is_base_formula}
            disabled={
              fieldsDisabled || !(editing ? draft?.techniqueId : formula.data.technique_category_id)
            }
            onChange={(e) => setDraft((d) => (d ? { ...d, isBase: e.target.checked } : d))}
          />
          <span className="label-caps">기준 배합</span>
        </label>
        <select
          className={`${compactSelectClass} w-auto`}
          value={editing ? (draft?.componentId ?? "") : (formula.data.component_id ?? "")}
          disabled={fieldsDisabled}
          onChange={(e) => setDraft((d) => (d ? { ...d, componentId: e.target.value } : d))}
        >
          <option value="">NO COMPONENT</option>
          {(components.data ?? []).map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </select>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        {/* VERSION — 버전 전환/CURRENT·ARCHIVE 지정. DRAFT/TESTING/SUPERSEDED/LOGGED 같은 세부
            상태는 수동으로 고를 필요가 없다는 판단으로 CURRENT/ARCHIVE 두 가지만 남겼다(2026-09-22) —
            SUPERSEDED는 다른 버전을 CURRENT로 바꿀 때 DB 트리거가 자동 처리하고, LOGGED는
            Development Entry 저장 시 자동으로 붙는 값이라 여기서 고를 필요가 없다. */}
        <select
          className={`${compactSelectClass} w-auto`}
          value={versionId ?? ""}
          onChange={(e) => setVersionId(e.target.value)}
        >
          {versionList.map((v) => (
            <option key={v.id} value={v.id}>
              {`${versionLabel(v.version_number)} · ${v.status}`}
            </option>
          ))}
        </select>
        {version && <StatusBadge status={version.status} />}
        <select
          className={`${compactSelectClass} w-auto`}
          value=""
          onChange={(e) => {
            const next = e.target.value as FormulaStatus;
            if (!next || !versionId) return;
            supabase
              .from("formula_versions")
              .update({ status: next })
              .eq("id", versionId)
              .then(({ error }) => {
                if (error) throw error;
                return invalidate();
              });
          }}
        >
          <option value="">SET…</option>
          <option value="CURRENT" disabled={version?.status === "CURRENT"}>
            SET CURRENT
          </option>
          <option value="ARCHIVED" disabled={version?.status === "ARCHIVED"}>
            ARCHIVE
          </option>
        </select>
        <button type="button" className={compactButtonClass} onClick={() => setCreatingVersion(true)}>
          + NEW VERSION
        </button>

        {canEditPage && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <button
              type="button"
              className={compactPrimaryButtonClass}
              disabled={!draft || !isDirty || saveAll.isPending}
              onClick={() => saveAll.mutate()}
            >
              {saveAll.isPending ? "SAVING…" : "SAVE"}
            </button>
            {isDirty && (
              <button type="button" className={compactButtonClass} onClick={() => setDraft(buildDraft())}>
                되돌리기
              </button>
            )}
            <span className="label-caps text-[10px] text-muted-foreground">
              {!draft ? "LOADING…" : isDirty ? "변경 사항이 있습니다 — 저장하려면 SAVE" : "✓ SAVED"}
            </span>
          </>
        )}
      </div>

      {/* 2026-09-30에 MOULD/YIELD/BATCH ×N 미리보기 박스를 지우면서, 이 배합 버전 자체의 기본
          MOULD/BASE WEIGHT/YIELD를 "바꾸는" UI만 없앤 것이었는데, 그 값을 "보여주는" 곳도 결국
          없어져서 — 2026-10-06 사용자가 "몰드 기준이라 되어있는데 어떤 용량의 몰드 기준인지는
          안적혀있어"로 재발견. draft.mouldId/baseWeightId/yieldQuantity는 그동안도 계속
          buildDraft/isDirty/SAVE에 다 연결돼 있었고(죽은 코드가 아니라 입력 UI만 없었음) —
          여기 가볍게 한 줄로 되살린다. SETTINGS > MOULDS의 reference_weight_g(기준중량)가
          드롭다운 라벨에 그대로 보이므로(MouldSelect의 mouldOptionLabel 공용 포맷) 어떤 용량
          기준인지 더 이상 헷갈리지 않는다. */}
      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-3 py-2">
        <span className="label-caps text-xs text-muted-foreground">
          {scalingMode === "MOULD" ? "MOULD BASIS" : "BASE WEIGHT BASIS"}
        </span>
        {scalingMode === "MOULD" ? (
          <MouldSelect
            className={`${compactSelectClass} w-auto`}
            value={editing ? (draft?.mouldId ?? "") : (version?.default_mould_id ?? "")}
            disabled={fieldsDisabled}
            onChange={(id) => setDraft((d) => (d ? { ...d, mouldId: id } : d))}
          />
        ) : (
          <BaseWeightSelect
            className={`${compactSelectClass} w-auto`}
            value={editing ? (draft?.baseWeightId ?? "") : (version?.default_base_weight_id ?? "")}
            disabled={fieldsDisabled}
            onChange={(id) => setDraft((d) => (d ? { ...d, baseWeightId: id } : d))}
          />
        )}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <label className="flex items-center gap-1.5 text-xs">
          <span className="label-caps text-muted-foreground">YIELD</span>
          <input
            type="number"
            inputMode="decimal"
            className={`${compactSelectClass} !w-24`}
            placeholder="g"
            value={editing ? (draft?.yieldQuantity ?? "") : (yieldQty || "")}
            disabled={fieldsDisabled}
            onChange={(e) => setDraft((d) => (d ? { ...d, yieldQuantity: e.target.value } : d))}
          />
        </label>
      </div>


      {/* 공정 주의 — 배수 ≥ 2 + process_note 보유 재료 */}
      {processCautions.length > 0 && (
        <div className="border border-dashed border-foreground px-4 py-3">
          <p className="label-caps text-xs">PROCESS CAUTION — 배수 ×{fmtNumber(batchValue, 2)}</p>
          <ul className="mt-1 space-y-1">
            {processCautions.map((row) => (
              <li key={row.id} className="font-mono text-xs">
                {row.ingredients?.name}: {row.ingredients?.process_note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* INGREDIENTS — BASE ×1 vs 저장된 배수 프리셋을 한 표 안에서 박스로 구분해 보여준다 */}
      {reorderError && (
        <p className="font-mono text-xs uppercase text-destructive">
          순서 저장 실패: {reorderError}
        </p>
      )}
      <SectionCard
        title="INGREDIENTS"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="label-caps border border-input bg-background px-2 py-2 text-xs"
              value={basisId}
              onChange={(e) => setBasisId(e.target.value)}
            >
              <option value="">% OF TOTAL</option>
              {rows.map((row) => (
                <option key={row.ingredient_id} value={row.ingredient_id}>
                  BAKER&apos;S % — {row.ingredients?.name}
                </option>
              ))}
            </select>
            {editing && (
              <button
                type="button"
                className="label-caps px-2 py-2 text-xs hover:bg-secondary"
                onClick={() => {
                  setNewBatchMouldId(scalingMode === "MOULD" ? (version?.default_mould_id ?? "") : "");
                  setNewBatchCount("1");
                  setNewBatchManualMultiplier("2");
                  setNewBatchLabel("");
                  setAddingBatch(true);
                }}
              >
                + ADD BATCH
              </button>
            )}
            <button
              type="button"
              className="label-caps px-2 py-2 text-xs hover:bg-secondary"
              onClick={() => setAdding(true)}
            >
              + ADD INGREDIENT
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO INGREDIENTS IN THIS VERSION
          </p>
        ) : (
          <div className="overflow-x-auto">
            {/* 2026-09-30: table-layout:fixed + colgroup으로 열 비율을 고정 — 예전엔(auto layout)
                FUNCTION의 긴 텍스트가 그 열을 밀어 넓히면서 BASE ×1/배수/UNIT/%같은 숫자 칸들이
                내용과 안 맞게 들쭉날쭉해 보였다. 숫자 칸은 실제 입력값에 맞는 좁은 너비로, 텍스트가
                긴 INGREDIENT/FUNCTION은 넉넉한 너비로 고정해 비율을 맞춘다. */}
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-8" />
                <col className="w-48" />
                <col className="w-36" />
                {batchPresets.map((preset) => (
                  <col key={preset.id} className="w-32" />
                ))}
                <col className="w-24" />
                <col className="w-40" />
                <col className="w-56" />
                <col className="w-24" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-8 px-1 py-2" aria-label="공정 순서 드래그" />
                  <th className="label-caps px-2 py-2 text-xs text-muted-foreground">
                    INGREDIENT
                  </th>
                  <th className="label-caps border-r border-border bg-secondary/40 px-2 py-2 text-xs text-muted-foreground">
                    BASE ×1
                  </th>
                  {batchPresets.map((preset) => {
                    const eff = effectiveBatchPresets.find((p) => p.id === preset.id) ?? {
                      ...preset,
                      mismatch: false,
                    };
                    return (
                      <th
                        key={preset.id}
                        className="label-caps border-r border-dashed border-border px-2 py-2 text-xs text-muted-foreground"
                      >
                        {/* 2026-09-30: 헤더에 몰드 드롭다운/직접입력 전환 버튼을 늘어놓던 걸 없애고
                            간단한 표시 + EDIT 팝업으로 뺐다 — 몰드 기준 계산은 열을 만들 때(ADD
                            BATCH)만 하고, 만든 뒤엔 이름/배수만 팝업에서 고친다. */}
                        <div className="flex flex-col items-start gap-1 normal-case">
                          <span className="text-xs">
                            {preset.mould_id
                              ? `${(moulds.data ?? []).find((m) => m.id === preset.mould_id)?.name ?? "몰드"} ×${fmtNumber(Number(preset.mould_count ?? 1), 0)}개`
                              : `×${fmtNumber(Number(eff.multiplier), 2)}`}
                            {preset.label ? ` · ${preset.label}` : ""}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="label-caps border border-input px-1.5 py-0.5 text-[9px] hover:bg-secondary"
                              onClick={() => {
                                setEditingBatchId(preset.id);
                                setEditBatchLabel(preset.label ?? "");
                                setEditBatchMultiplier(fmtNumber(Number(eff.multiplier), 2));
                              }}
                            >
                              EDIT
                            </button>
                            <button
                              type="button"
                              className="label-caps border border-input px-1.5 py-0.5 text-[9px] hover:bg-secondary"
                              disabled={removeBatchPreset.isPending}
                              onClick={() => {
                                if (removeBatchPreset.isPending) return;
                                removeBatchPreset.mutate(preset.id);
                              }}
                            >
                              DELETE
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                  <th className="label-caps px-2 py-2 text-xs text-muted-foreground">UNIT</th>
                  <th className="label-caps px-2 py-2 text-xs text-muted-foreground">
                    %  / RATE
                  </th>
                  <th className="label-caps px-2 py-2 text-xs text-muted-foreground">FUNCTION</th>
                  <th className="label-caps px-2 py-2 text-xs text-muted-foreground" />
                </tr>
              </thead>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleIngredientDragEnd}
              >
                <SortableContext
                  items={rows.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {rows.map((row) => (
                      <UnifiedIngredientRow
                        key={row.id}
                        row={row}
                        locked={false}
                        editing={editing}
                        batchPresets={effectiveBatchPresets}
                        denominator={denominator}
                        bases={bases}
                        draft={draft?.rows[row.id] ?? null}
                        onDraftChange={(patch) => patchRowDraft(row.id, patch)}
                        onRemove={() => removeRow.mutate(row.id)}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>
        )}
      </SectionCard>

      {/* BASIS — 기준량 자동 집계 */}
      {version && (
        <BasisPanel
          bases={bases}
          rows={rows}
          overrides={overrides}
          bathWaterG={bathWaterG}
          locked={false}
          onOverridesChange={(next) =>
            supabase
              .from("formula_versions")
              .update({ basis_overrides: next as unknown as FormulaVersion["basis_overrides"] })
              .eq("id", versionId!)
              .then(({ error }) => {
                if (error) throw error;
                return invalidate();
              })
          }
          onBathChange={(grams) =>
            supabase
              .from("formula_versions")
              .update({ bath_water_g: grams })
              .eq("id", versionId!)
              .then(({ error }) => {
                if (error) throw error;
                return invalidate();
              })
          }
        />
      )}

      {/* COMPOSITION / BALANCE */}
      <CompositionPanel rows={rows} batch={batchValue} />
      <BalancePanel rows={rows} batch={batchValue} />

      {/* NOTES */}
      <SectionCard title="VERSION NOTES">
        <textarea
          rows={3}
          className={inputClass}
          disabled={fieldsDisabled}
          value={editing ? (draft?.notes ?? "") : (version?.notes ?? "")}
          onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
        />
      </SectionCard>


      {/* HISTORY */}
      <VersionHistory formulaId={formulaId} versions={versionList} onOpen={(id) => setVersionId(id)} />

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (
            confirm(
              "DELETE THIS FORMULA AND ALL ITS VERSIONS? (버전 단위 삭제는 지원하지 않습니다 — ARCHIVED로 변경하세요)",
            )
          )
            removeFormula.mutate();
        }}
      >
        DELETE FORMULA
      </button>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">ADD INGREDIENT</span>
              <button type="button" className="label-caps px-2 py-2" onClick={() => setAdding(false)}>
                CLOSE
              </button>
            </div>
            <div className="p-4">
              <IngredientPicker
                onCancel={() => setAdding(false)}
                onPick={(id, unit) => {
                  addIngredient.mutate({ id, unit });
                  setAdding(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {addingBatch && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">ADD BATCH</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setAddingBatch(false)}
              >
                CLOSE
              </button>
            </div>
            <div className="space-y-3 p-4">
              <input
                className={inputClass}
                placeholder="이름 (예: 8인치 시폰몰드)"
                value={newBatchLabel}
                onChange={(e) => setNewBatchLabel(e.target.value)}
              />
              {scalingMode === "MOULD" ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">
                      MOULD
                    </span>
                    <MouldSelect
                      className={`${selectClass} flex-1`}
                      value={newBatchMouldId}
                      onChange={setNewBatchMouldId}
                      emptyLabel="배수 직접입력"
                    />
                  </div>
                  {newBatchMouldId ? (
                    (() => {
                      const baseMould =
                        (moulds.data ?? []).find((m) => m.id === (version?.default_mould_id ?? "")) ??
                        null;
                      const targetMould =
                        (moulds.data ?? []).find((m) => m.id === newBatchMouldId) ?? null;
                      const count = parseNumber(newBatchCount) || 1;
                      const { multiplier, mismatch } = mouldBatchMultiplier(count, targetMould, baseMould);
                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">
                              개수
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="1"
                              min="0"
                              className={`${inputClass} !w-24`}
                              value={newBatchCount}
                              onChange={(e) => setNewBatchCount(e.target.value)}
                            />
                            <span className="font-mono text-xs text-muted-foreground">
                              = ×{fmtNumber(multiplier, 2)}
                            </span>
                          </div>
                          {mismatch && (
                            <p className="font-mono text-[10px] text-muted-foreground">
                              ⚠ 두 몰드의 기준중량이 등록되어 있지 않아 정확한 환산이 불가능해서 개수를
                              그대로 배수로 씁니다 — MOULDS 설정에서 기준중량(g)을 등록하면 자동
                              환산됩니다.
                            </p>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">
                        배수
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        className={`${inputClass} !w-24`}
                        value={newBatchManualMultiplier}
                        onChange={(e) => setNewBatchManualMultiplier(e.target.value)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">배수</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    className={`${inputClass} !w-24`}
                    value={newBatchManualMultiplier}
                    onChange={(e) => setNewBatchManualMultiplier(e.target.value)}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setAddingBatch(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={addBatchPreset.isPending}
                  onClick={() => {
                    const label = newBatchLabel.trim() || null;
                    if (scalingMode === "MOULD" && newBatchMouldId) {
                      const baseMould =
                        (moulds.data ?? []).find((m) => m.id === (version?.default_mould_id ?? "")) ??
                        null;
                      const targetMould =
                        (moulds.data ?? []).find((m) => m.id === newBatchMouldId) ?? null;
                      const count = parseNumber(newBatchCount) || 1;
                      const { multiplier } = mouldBatchMultiplier(count, targetMould, baseMould);
                      addBatchPreset.mutate(
                        { mouldId: newBatchMouldId, mouldCount: count, multiplier, label },
                        { onSuccess: () => setAddingBatch(false) },
                      );
                    } else {
                      const multiplier = parseNumber(newBatchManualMultiplier) || 2;
                      addBatchPreset.mutate(
                        { mouldId: null, mouldCount: 1, multiplier, label },
                        { onSuccess: () => setAddingBatch(false) },
                      );
                    }
                  }}
                >
                  {addBatchPreset.isPending ? "추가 중…" : "추가"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingBatchId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">EDIT BATCH</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => setEditingBatchId(null)}
              >
                CLOSE
              </button>
            </div>
            <div className="space-y-3 p-4">
              <input
                className={inputClass}
                placeholder="이름 (예: 8인치 시폰몰드)"
                value={editBatchLabel}
                onChange={(e) => setEditBatchLabel(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">배수</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={`${inputClass} !w-24`}
                  value={editBatchMultiplier}
                  onChange={(e) => setEditBatchMultiplier(e.target.value)}
                />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                배수를 바꾸면 이 열의 몰드 연결은 풀리고(직접입력으로 전환) 새 배수가 그대로
                저장됩니다. 이름만 바꾸면 몰드 연결은 그대로 유지됩니다.
              </p>
              <div className="flex justify-between gap-2 pt-1">
                <button
                  type="button"
                  className="label-caps px-2 py-2 text-destructive hover:underline"
                  disabled={removeBatchPreset.isPending}
                  onClick={() => {
                    if (removeBatchPreset.isPending) return;
                    removeBatchPreset.mutate(editingBatchId, {
                      onSuccess: () => setEditingBatchId(null),
                    });
                  }}
                >
                  삭제
                </button>
                <div className="flex gap-2">
                  <button type="button" className={buttonClass} onClick={() => setEditingBatchId(null)}>
                    취소
                  </button>
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={updateBatchPreset.isPending}
                    onClick={() => {
                      const preset = batchPresets.find((p) => p.id === editingBatchId);
                      if (!preset) return;
                      const label = editBatchLabel.trim() || null;
                      const nextMultiplier = parseNumber(editBatchMultiplier);
                      const eff = effectiveBatchPresets.find((p) => p.id === editingBatchId);
                      const currentMultiplier = eff ? Number(eff.multiplier) : Number(preset.multiplier);
                      const multiplierChanged = Math.abs(nextMultiplier - currentMultiplier) > 1e-9;
                      updateBatchPreset.mutate({
                        id: editingBatchId,
                        label,
                        multiplier: nextMultiplier || currentMultiplier,
                        keepMould: Boolean(preset.mould_id) && !multiplierChanged,
                      });
                    }}
                  >
                    {updateBatchPreset.isPending ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {creatingVersion && (
        <NewVersionModal
          fromLabel={version ? versionLabel(version.version_number) : "—"}
          pending={createVersion.isPending}
          onCancel={() => setCreatingVersion(false)}
          onCreate={(summary, reason) => createVersion.mutate({ summary, reason })}
        />
      )}

    </div>
  );
}

/**
 * 하나의 재료 행 — BULK/FUNCTIONAL을 구조적으로 나누지 않고 한 표 안에서
 * FUNCTION 재료만 뱃지/틴트로 시각 구분한다. BASE ×1 옆에 저장된 배수 프리셋들이
 * 같은 행에 열로 나열된다 (읽기 전용 스케일 표시 — 저장값은 amount 하나뿐).
 */
function UnifiedIngredientRow({
  row,
  locked,
  editing,
  batchPresets,
  denominator,
  bases,
  draft,
  onDraftChange,
  onRemove,
}: {
  row: VersionIngredientRow;
  locked: boolean;
  editing: boolean;
  batchPresets: FormulaVersionBatch[];
  denominator: number;
  bases: Record<BasisKey, BasisInfo>;
  draft: RowDraft | null;
  onDraftChange: (patch: Partial<RowDraft>) => void;
  onRemove: () => void;
}) {
  const [targetPctOpen, setTargetPctOpen] = useState(false);
  const [targetPct, setTargetPct] = useState("");
  const [bloomOpen, setBloomOpen] = useState(false);
  const [myBloom, setMyBloom] = useState("");

  const ing = row.ingredients;
  const isFunctional = Boolean(ing?.is_functional);
  const savedAmount = Number(row.amount);
  const amount = editing && draft ? parseNumber(draft.amount) : savedAmount;
  const unit = editing && draft ? draft.unit : row.unit;
  const source = row.amount_source ?? "manual";
  const unitFactor = toGrams(1, unit);

  const calc = isFunctional ? functionalRowCalc(row, bases) : null;
  const grams = toGrams(amount, unit);
  const percent = denominator > 0 && grams !== null ? (grams / denominator) * 100 : null;
  const functions = (ing?.ingredient_function_links ?? [])
    .map((link) => link.ingredient_functions)
    .filter((fn) => Boolean(fn))
    .map((fn) => functionShortName(fn!))
    .join(" / ");

  // 설계 모드 제안값 — 편집 중이고 양이 비어 있을 때만
  const showSuggestion = editing && !locked && amount === 0 && calc?.suggestedInUnit != null;
  const showResync =
    editing &&
    !locked &&
    amount > 0 &&
    calc?.suggestedInUnit != null &&
    Math.abs(calc.suggestedInUnit - amount) / Math.max(amount, 1e-9) > 0.01 &&
    (calc.status === "low" || calc.status === "high" || source === "suggested");

  const bloomSuggestion =
    ing?.bloom != null && amount > 0 && myBloom
      ? gelatinConvert(amount, Number(ing.bloom), parseNumber(myBloom))
      : null;

  const applyTargetPct = () => {
    const pct = parseNumber(targetPct);
    if (pct <= 0 || calc?.basisGrams == null || !unitFactor) return;
    onDraftChange({
      amount: String(round2((calc.basisGrams * pct) / 100 / unitFactor)),
    });
    setTargetPctOpen(false);
    setTargetPct("");
  };

  // 드래그 재정렬 — 공정 순서대로 배열할 수 있도록. LOCK된 버전에서는 손잡이를 숨긴다.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: locked,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        "border-b border-border align-top",
        isFunctional && "bg-secondary/20",
        isDragging && "relative z-10 bg-background shadow-md",
      )}
    >
      {/* 드래그 손잡이 — 공정 순서대로 재정렬할 때 사용 */}
      <td className="px-1 py-2 align-middle">
        {!locked && (
          <button
            type="button"
            className="flex h-8 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="드래그해서 순서 변경"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </td>
      {/* INGREDIENT + 출처/기능 뱃지 — 여기서는 재료명을 눌러도 재료 마스터로 이동하지 않는다.
          (배합을 고치려는 클릭이 엉뚱하게 재료 상세 페이지로 튕겨나가던 문제 수정) */}
      <td className="break-words px-2 py-2 text-sm">
        <span>{ing ? ingredientDisplayName(ing) : "—"}</span>
        {isFunctional && (
          <span className="label-caps ml-2 border border-foreground px-1.5 py-0.5 text-[10px]">
            FUNCTIONAL
          </span>
        )}
        {source === "suggested" && (
          <span className="label-caps ml-2 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            권장값
          </span>
        )}
        {source === "copied" && (
          <span className="label-caps ml-2 border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            복사됨
          </span>
        )}
        {ing?.bloom != null && editing && !locked && (
          <button
            type="button"
            className="label-caps ml-2 px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
            onClick={() => setBloomOpen((v) => !v)}
          >
            BLOOM {fmtNumber(Number(ing.bloom), 0)}
          </button>
        )}
        {bloomOpen && ing?.bloom != null && (
          <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-xs">
            <span className="text-muted-foreground">내 제품 BLOOM</span>
            <input
              type="number"
              inputMode="decimal"
              className="min-h-[44px] w-20 border border-input bg-background px-2 py-1 text-base outline-none focus:border-foreground"
              value={myBloom}
              onChange={(e) => setMyBloom(e.target.value)}
            />
            {bloomSuggestion != null && (
              <>
                <span className="tabular-nums">
                  → {fmtNumber(bloomSuggestion, 1)}
                  {unit}
                </span>
                <button
                  type="button"
                  className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                  onClick={() => {
                    onDraftChange({ amount: String(round2(bloomSuggestion)) });
                    setBloomOpen(false);
                    setMyBloom("");
                  }}
                >
                  적용
                </button>
              </>
            )}
          </div>
        )}
        {ing?.process_note && (
          <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
            ⚠ {ing.process_note}
          </p>
        )}
      </td>

      {/* BASE ×1 — amount 입력 (EDIT 중에만 실제로 바뀌고, SAVE 전까지 저장되지 않는다) */}
      <td className="border-r border-border bg-secondary/40 px-2 py-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          className={cn(
            "min-h-[48px] w-24 border bg-background px-2 py-2 font-mono text-base tabular-nums outline-none focus:border-foreground disabled:opacity-60",
            showSuggestion ? "border-dashed border-input text-muted-foreground" : "border-input",
          )}
          disabled={locked || !editing}
          placeholder="0"
          value={editing ? (draft?.amount ?? "") : String(savedAmount)}
          onChange={(e) => onDraftChange({ amount: e.target.value })}
        />
        {/* 보조 계량 — 그램 외 개수/스푼 등을 표시용으로만 같이 적어둘 수 있다 (계산엔 관여 안 함) */}
        {editing && !locked ? (
          <div className="mt-1 flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              className="min-h-[36px] w-14 border border-input bg-background px-1 py-1 font-mono text-xs tabular-nums outline-none focus:border-foreground"
              placeholder="개수"
              value={draft?.secondaryAmount ?? ""}
              onChange={(e) => onDraftChange({ secondaryAmount: e.target.value })}
            />
            <select
              className="min-h-[36px] w-20 border border-input bg-background px-1 py-1 text-xs outline-none focus:border-foreground"
              value={draft?.secondaryUnit ?? ""}
              onChange={(e) => onDraftChange({ secondaryUnit: e.target.value })}
            >
              <option value="">단위</option>
              {/* 예전에 자유 텍스트로 저장된 값이 이 목록에 없으면(예: 커스텀 단위) 선택지에서
                  사라지지 않도록 맨 위에 그대로 끼워 넣는다(2026-09-30, 텍스트 입력 → 드롭다운 전환). */}
              {draft?.secondaryUnit && !SECONDARY_UNITS.includes(draft.secondaryUnit as (typeof SECONDARY_UNITS)[number]) && (
                <option value={draft.secondaryUnit}>{draft.secondaryUnit}</option>
              )}
              {SECONDARY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        ) : (
          row.secondary_amount != null &&
          row.secondary_unit && (
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              · {fmtNumber(Number(row.secondary_amount), 2)}
              {row.secondary_unit}
            </p>
          )
        )}
        {showSuggestion && calc && (
          <div className="mt-1 space-y-1">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              ≈ {fmtNumber(calc.suggestedInUnit!, 2)}
              {unit} ({fmtNumber(calc.midPct!, 1)}%) — 권장 중앙값
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                onClick={() => onDraftChange({ amount: String(round2(calc.suggestedInUnit!)) })}
              >
                적용
              </button>
              <button
                type="button"
                className="label-caps border border-input px-2 py-1 text-[10px] hover:bg-secondary"
                onClick={() => setTargetPctOpen((v) => !v)}
              >
                목표 %로 채우기
              </button>
            </div>
            {targetPctOpen && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="min-h-[44px] w-20 border border-input bg-background px-2 py-1 font-mono text-base outline-none focus:border-foreground"
                  placeholder="%"
                  value={targetPct}
                  onChange={(e) => setTargetPct(e.target.value)}
                />
                <button
                  type="button"
                  className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                  onClick={applyTargetPct}
                >
                  적용
                </button>
              </div>
            )}
          </div>
        )}
        {showResync && calc && (
          <button
            type="button"
            className="label-caps mt-1 border border-dashed border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
            onClick={() => onDraftChange({ amount: String(round2(calc.suggestedInUnit!)) })}
          >
            기준량 변경됨 — {fmtNumber(calc.midPct!, 1)}%로 다시 맞추기 →{" "}
            {fmtNumber(calc.suggestedInUnit!, 2)}
            {unit}
          </button>
        )}
      </td>

      {/* 저장된 배수 프리셋 컬럼들 — 계산 전용, 저장하지 않음 */}
      {batchPresets.map((preset) => {
        const scaled = scaledAmount(
          amount,
          ing?.scaling_mode,
          ing?.scaling_exponent != null ? Number(ing.scaling_exponent) : null,
          Number(preset.multiplier),
        );
        return (
          <td
            key={preset.id}
            className="border-r border-dashed border-border px-2 py-2 font-mono text-sm tabular-nums"
          >
            {fmtNumber(scaled.scaled, 2)}
            {scaled.nonLinear && (
              <span className="block text-[10px] text-muted-foreground">
                비례 시 {fmtNumber(scaled.linear, 2)}
              </span>
            )}
            {/* 보조 계량도 이 배치의 배수만큼 같이 곱해서 보여준다 (예: BASE×1=3개 → ×2배치=6개) —
                그램수와 별개로 항상 배수에 선형 비례, 딱 떨어지지 않아도 반올림 없이 그대로 표시 */}
            {row.secondary_amount != null && row.secondary_unit && (
              <span className="block text-[10px] text-muted-foreground">
                · {fmtNumber(Number(row.secondary_amount) * Number(preset.multiplier), 2)}
                {row.secondary_unit}
              </span>
            )}
          </td>
        );
      })}

      {/* UNIT */}
      <td className="px-2 py-2">
        <select
          className="min-h-[48px] w-20 border border-input bg-background px-2 py-2 font-mono text-sm disabled:opacity-60"
          disabled={locked || !editing}
          value={unit}
          onChange={(e) => onDraftChange({ unit: e.target.value })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>

      {/* % / RATE */}
      <td className="px-2 py-2 font-mono text-sm tabular-nums">
        {isFunctional && calc ? (
          calc.ratePct != null ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <RangeBar value={calc.ratePct} min={calc.recMinPct} max={calc.recMaxPct} />
              </span>
              <span>
                {fmtNumber(calc.ratePct, 1)}%
                <span className="block text-[10px] uppercase text-muted-foreground">
                  of {calc.basisLabel}{" "}
                  {calc.basisGrams != null ? `${fmtNumber(calc.basisGrams)}g` : "—"}
                </span>
                {calc.recMinPct != null && calc.recMaxPct != null && (
                  <span className="block text-[10px] text-muted-foreground">
                    권장 {fmtNumber(calc.recMinPct, 1)}–{fmtNumber(calc.recMaxPct, 1)}%{" "}
                    {calc.status === "in" && "✓"}
                    {calc.status === "low" && "LOW"}
                    {calc.status === "high" && "HIGH"}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        ) : percent === null ? (
          "—"
        ) : (
          `${fmtNumber(percent, 1)}%`
        )}
      </td>

      {/* FUNCTION */}
      <td className="px-2 py-2 font-mono text-xs uppercase text-muted-foreground">
        {functions || "—"}
      </td>

      <td className="px-2 py-2">
        {!locked && (
          <button
            type="button"
            className="label-caps min-h-[48px] px-2 text-xs hover:bg-secondary"
            onClick={onRemove}
          >
            REMOVE
          </button>
        )}
      </td>
    </tr>
  );
}

function VersionHistory({
  formulaId,
  versions,
  onOpen,
}: {
  formulaId: string;
  versions: FormulaVersion[];
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();

  /* "이 시점 배합이 지금보다 나았다" — 과거 스냅샷을 지우지 않고 CURRENT로 되돌린다.
   * enforce_single_current_version 트리거가 기존 CURRENT를 자동으로 SUPERSEDED 처리한다. */
  const makeCurrent = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase
        .from("formula_versions")
        .update({ status: "CURRENT" })
        .eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formula_versions", formulaId] });
      await queryClient.invalidateQueries({ queryKey: ["formulas_by_component"] });
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
    },
  });

  return (
    <SectionCard title="SNAPSHOT HISTORY">
      <p className="mb-3 font-mono text-[11px] text-muted-foreground">
        Development Entry가 만든 배합 스냅샷들입니다 — 지워지지 않습니다. 예전 스냅샷이 더 나았다면
        MAKE CURRENT로 되돌릴 수 있습니다.
      </p>
      <ul className="divide-y divide-border border border-border">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-2 px-3 py-3">
            <button
              type="button"
              className="label-caps min-w-[3rem] text-left hover:underline"
              onClick={() => onOpen(version.id)}
            >
              {versionLabel(version.version_number)}
            </button>
            <StatusBadge status={version.status} />
            <span className="flex-1 text-sm">{version.change_summary || "—"}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatDateTime(version.created_at)}
            </span>
            {version.status !== "CURRENT" && (
              <button
                type="button"
                className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary disabled:opacity-40"
                disabled={makeCurrent.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `${versionLabel(version.version_number)}을(를) CURRENT로 되돌릴까요? 지금의 CURRENT는 SUPERSEDED로 바뀌고 기록은 남습니다.`,
                    )
                  )
                    makeCurrent.mutate(version.id);
                }}
              >
                MAKE CURRENT
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* 버전 비교 시트 — 모든 버전을 열로 나란히 두고 재료별로 뭐가 달라졌는지 한눈에 본다.
          Component 페이지의 CurrentFormulaPanel과 동일한 컴포넌트를 공유한다. */}
      {versions.length > 0 && (
        <div className="mt-4">
          <p className="label-caps mb-2 text-[11px] text-muted-foreground">
            VERSION COMPARISON SHEET
          </p>
          <VersionComparisonSheet versions={versions} />
        </div>
      )}
    </SectionCard>
  );
}

function NewVersionModal({
  fromLabel,
  pending,
  onCancel,
  onCreate,
}: {
  fromLabel: string;
  pending: boolean;
  onCancel: () => void;
  onCreate: (summary: string, reason: string) => void;
}) {
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW VERSION FROM {fromLabel}</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onCancel}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate(summary.trim(), reason.trim());
          }}
        >
          <p className="font-mono text-xs uppercase text-muted-foreground">
            COPIES CURRENT INGREDIENT TABLE INTO A NEW DRAFT
          </p>
          <Field label="CHANGE SUMMARY">
            <input
              className={inputClass}
              autoFocus
              required
              placeholder="SUGAR 120g → 110g"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="CHANGE REASON (OPTIONAL)">
            <textarea
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              CREATE DRAFT
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
