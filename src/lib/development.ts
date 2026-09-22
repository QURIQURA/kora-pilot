/**
 * DEVELOPMENT — "Save Development" 데이터 흐름.
 *
 * 사용자에게는 Formula(배합)와 Experiment(실험/기록)가 두 개의 별도 저장 대상으로
 * 보이지 않는다 — Component 하나의 지속적인 개발 기록(Development History)이고,
 * 이 화면의 "저장" 버튼 하나가 아래 전부를 한 번에 처리한다.
 *
 * 이미 실시간으로 저장되는 것들(이 함수가 다시 쓰지 않는 것들):
 *  - process_events (공정 타임라인 / STT 음성 로그)
 *  - observations
 *  - experiment_sensory_scores
 * 이것들은 이미 experiment_id로 연결되어 있으므로 Save Development는 손대지 않는다.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, type VersionIngredientRow } from "@/lib/queries";

export const DEVELOPMENT_OUTCOMES = ["KEEP", "FAILED", "PARTIAL", "REFERENCE"] as const;
export type DevelopmentOutcome = (typeof DEVELOPMENT_OUTCOMES)[number];

export function developmentOutcomeLabel(outcome: DevelopmentOutcome | string | null | undefined): string {
  switch (outcome) {
    case "KEEP":
      return "KEEP — 채택";
    case "FAILED":
      return "FAILED — 실패";
    case "PARTIAL":
      return "PARTIAL — 부분 성공";
    case "REFERENCE":
      return "REFERENCE — 참고용";
    default:
      return "—";
  }
}

export interface DevelopmentIngredientDraft {
  ingredient_id: string;
  amount: number;
  unit: string;
  note: string | null;
  sort_order: number;
}

/** 현재 스냅샷과 draft 재료표를 비교해 실제로 뭔가 바뀌었는지만 판단한다 (양/단위/메모/재료 추가·삭제). */
export function hasIngredientChanges(
  current: VersionIngredientRow[],
  draft: DevelopmentIngredientDraft[],
): boolean {
  if (current.length !== draft.length) return true;
  const byIngredientId = new Map(current.map((row) => [row.ingredient_id, row]));
  for (const d of draft) {
    const c = byIngredientId.get(d.ingredient_id);
    if (!c) return true; // 새로 추가된 재료
    if (Number(c.amount) !== d.amount) return true;
    if (c.unit !== d.unit) return true;
    if ((c.note ?? "") !== (d.note ?? "")) return true;
  }
  return false;
}

export interface SaveDevelopmentInput {
  /** 이미 생성되어 있는 experiments 행 — STT/observation/sensory가 이미 이 id로 연결되어 있다 */
  experimentId: string;
  /** 이 Component에 속한 단일 Formula */
  formulaId: string;
  /** 이 Development Entry가 시작된 기준 스냅샷 (보통 그 시점의 Current Formula) */
  baseFormulaVersionId: string;
  /** 현재 편집된 재료표 */
  draftRows: DevelopmentIngredientDraft[];
  /** baseFormulaVersionId에 실제 저장되어 있던 재료 — diff 비교용 */
  currentRows: VersionIngredientRow[];
  changeSummary: string | null;
  hypothesis: string | null;
  variables: string | null;
  controlVariables: string | null;
  result: string | null;
  conclusion: string | null;
  nextExperiment: string | null;
  outcome: DevelopmentOutcome;
  /** Product 연결 (optional) */
  productId: string | null;
  /** productId가 있고 outcome=KEEP일 때만 의미 있음 — true면 Component 전체(Current Formula) 갱신,
   *  false면 이 Product 전용 조정으로만 기록 (Current Formula는 그대로) */
  promoteComponentWide: boolean;
  /** productId가 있을 때, product_components 행을 찾기 위한 component_id */
  componentId: string | null;
  batchMultiplier: number;
  rawWeightG: number | null;
  processedWeightG: number | null;
  finishedWeightG: number | null;
  /** promoteComponentWide=false && productId가 있을 때 product_components.quantity_g에 반영할 값 */
  quantityGForProduct: number | null;
  /** product_components가 Product SIZES별로 나뉘어 있을 때 어느 사이즈 행을 갱신할지.
   *  null이면 "사이즈 미지정(전체)" 행만 대상으로 한다 — 사이즈별 행을 실수로 덮어쓰지 않기 위함. */
  productSizeId?: string | null;
}

export interface SaveDevelopmentResult {
  /** 이 Development Entry에 최종적으로 연결된 스냅샷 id (새로 만들었거나 기존 것 재사용) */
  formulaVersionId: string;
  createdNewSnapshot: boolean;
  promotedToCurrent: boolean;
}

/**
 * "Save Development" — Development Entry 저장의 단일 진입점.
 *
 * 1. 재료표가 실제로 바뀐 경우에만 새 스냅샷(formula_versions + formula_version_ingredients)을 만든다.
 *    안 바뀌었으면 기존 baseFormulaVersionId를 그대로 쓴다 — 사소한 기록 때문에 버전이 계속 늘어나는 것을 막는다.
 * 2. outcome=KEEP이고 (Product 미지정이거나 "Component 전체 반영"을 선택했으면) 새 스냅샷을 CURRENT로 승격한다
 *    — 기존 CURRENT는 DB의 enforce_single_current_version 트리거가 자동으로 SUPERSEDED 처리한다 (우회하지 않음).
 *    그 외의 경우 새 스냅샷은 LOGGED 상태로 남는다 — "기록됨, 지금 채택된 배합 아님".
 * 3. Product가 지정되어 있고 Component 전체 반영이 아니면, 새 Formula/엔티티를 만들지 않고
 *    product_components.formula_version_id/quantity_g만 이 스냅샷으로 갱신한다 (Product-specific adjustment).
 * 4. experiments 행에 R&D 기록 필드 + outcome을 저장한다. STT/observation/sensory는 다시 쓰지 않는다.
 */
export async function saveDevelopment(input: SaveDevelopmentInput): Promise<SaveDevelopmentResult> {
  const changed = hasIngredientChanges(input.currentRows, input.draftRows);
  const wantsPromote = input.outcome === "KEEP" && (!input.productId || input.promoteComponentWide);

  let formulaVersionId = input.baseFormulaVersionId;
  let createdNewSnapshot = false;
  let promotedToCurrent = false;

  if (changed) {
    const user_id = await currentUserId();

    const { data: baseVersion, error: baseError } = await supabase
      .from("formula_versions")
      .select("default_mould_id, yield_quantity, bath_water_g, basis_overrides")
      .eq("id", input.baseFormulaVersionId)
      .single();
    if (baseError) throw baseError;

    const { data: maxRow, error: maxError } = await supabase
      .from("formula_versions")
      .select("version_number")
      .eq("formula_id", input.formulaId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;
    const nextNumber = (maxRow?.version_number ?? 0) + 1;

    const { data: newVersion, error: versionError } = await supabase
      .from("formula_versions")
      .insert({
        user_id,
        formula_id: input.formulaId,
        version_number: nextNumber,
        status: wantsPromote ? "CURRENT" : "LOGGED",
        default_mould_id: baseVersion.default_mould_id,
        yield_quantity: baseVersion.yield_quantity,
        bath_water_g: baseVersion.bath_water_g,
        basis_overrides: baseVersion.basis_overrides,
        change_summary: input.changeSummary,
      })
      .select("id")
      .single();
    if (versionError) throw versionError;

    if (input.draftRows.length > 0) {
      const { error: ingredientsError } = await supabase.from("formula_version_ingredients").insert(
        input.draftRows.map((row) => ({
          user_id,
          formula_version_id: newVersion.id,
          ingredient_id: row.ingredient_id,
          amount: row.amount,
          unit: row.unit,
          note: row.note,
          sort_order: row.sort_order,
          amount_source: "manual",
        })),
      );
      if (ingredientsError) throw ingredientsError;
    }

    formulaVersionId = newVersion.id;
    createdNewSnapshot = true;
    promotedToCurrent = wantsPromote;
  }

  const { error: experimentError } = await supabase
    .from("experiments")
    .update({
      formula_version_id: formulaVersionId,
      hypothesis: input.hypothesis,
      variables: input.variables,
      control_variables: input.controlVariables,
      result: input.result,
      conclusion: input.conclusion,
      next_experiment: input.nextExperiment,
      outcome: input.outcome,
      product_id: input.productId,
      batch_multiplier: input.batchMultiplier,
      raw_weight_g: input.rawWeightG,
      processed_weight_g: input.processedWeightG,
      finished_weight_g: input.finishedWeightG,
      status: input.outcome === "FAILED" ? "FAILED" : "COMPLETE",
    })
    .eq("id", input.experimentId);
  if (experimentError) throw experimentError;

  // Product-specific adjustment — 새 Formula/엔티티를 만들지 않고 기존 연결 포인터만 갱신
  // product_components가 Product SIZES별로 여러 행일 수 있으므로 항상 특정 행(사이즈)만 대상으로 한다 —
  // productSizeId 미지정 시 "사이즈 미지정(전체)" 행만 건드리고, 사이즈별 행은 그대로 둔다.
  if (input.productId && !wantsPromote && input.componentId) {
    let query = supabase
      .from("product_components")
      .update({
        formula_version_id: formulaVersionId,
        quantity_g: input.quantityGForProduct,
      })
      .eq("product_id", input.productId)
      .eq("component_id", input.componentId);
    query = input.productSizeId ? query.eq("product_size_id", input.productSizeId) : query.is("product_size_id", null);
    const { error: usageError } = await query;
    if (usageError) throw usageError;
  }

  return { formulaVersionId, createdNewSnapshot, promotedToCurrent };
}
