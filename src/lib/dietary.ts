/**
 * DIETARY 탭 계산 — 태그 하나를 기준으로, 각 제품의 컴포넌트 슬롯마다 그 식이용 formula(version)가
 * 있는지 판정한다. 태그는 "선언"이라 교차오염 같은 안전 판단은 하지 않는다(사람이 확인).
 */
export type SlotStatus = "READY" | "ALTERNATIVE" | "MISSING" | "NO_FORMULA";

export interface DietaryFormula {
  id: string;
  name: string;
  component_id: string | null;
  formula_versions: { id: string; version_number: number; status: string }[];
}

export interface DietaryCandidate {
  versionId: string;
  formulaId: string;
  formulaName: string;
  versionNumber: number;
  versionStatus: string;
}

export interface DietarySlot {
  componentId: string;
  pinnedVersionId: string | null;
  pinnedLabel: string | null;
  status: SlotStatus;
  candidates: DietaryCandidate[];
}

export interface DietaryProductBoard {
  productId: string;
  slots: DietarySlot[];
  /** READY + ALTERNATIVE 슬롯 수 / 전체 슬롯 수 */
  coveredCount: number;
  totalCount: number;
}

export function buildDietaryBoard(args: {
  productIds: string[];
  productComponents: {
    product_id: string;
    component_id: string | null;
    formula_version_id: string | null;
    sort_order: number;
  }[];
  formulas: DietaryFormula[];
  taggedVersionIds: Set<string>;
}): DietaryProductBoard[] {
  const { productIds, productComponents, formulas, taggedVersionIds } = args;

  const formulasByComponent = new Map<string, DietaryFormula[]>();
  const versionLabel = new Map<string, string>();
  for (const f of formulas) {
    for (const v of f.formula_versions) versionLabel.set(v.id, `${f.name} v${v.version_number}`);
    if (!f.component_id) continue;
    const list = formulasByComponent.get(f.component_id) ?? [];
    list.push(f);
    formulasByComponent.set(f.component_id, list);
  }

  const candidatesFor = (componentId: string): DietaryCandidate[] => {
    const out: DietaryCandidate[] = [];
    for (const f of formulasByComponent.get(componentId) ?? []) {
      for (const v of f.formula_versions) {
        if (!taggedVersionIds.has(v.id)) continue;
        out.push({
          versionId: v.id,
          formulaId: f.id,
          formulaName: f.name,
          versionNumber: v.version_number,
          versionStatus: v.status,
        });
      }
    }
    // CURRENT 먼저, 그다음 높은 버전 순
    out.sort(
      (a, b) =>
        Number(b.versionStatus === "CURRENT") - Number(a.versionStatus === "CURRENT") ||
        b.versionNumber - a.versionNumber,
    );
    return out;
  };

  return productIds.map((productId) => {
    const rows = productComponents
      .filter((r) => r.product_id === productId && r.component_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const byComponent = new Map<string, string | null>();
    for (const r of rows) {
      const cid = r.component_id as string;
      if (!byComponent.has(cid) || (byComponent.get(cid) === null && r.formula_version_id)) {
        byComponent.set(cid, r.formula_version_id);
      }
    }
    const slots: DietarySlot[] = [...byComponent.entries()].map(([componentId, pinned]) => {
      const candidates = candidatesFor(componentId);
      let status: SlotStatus;
      if (pinned && taggedVersionIds.has(pinned)) status = "READY";
      else if (candidates.length > 0) status = "ALTERNATIVE";
      else if ((formulasByComponent.get(componentId) ?? []).length === 0) status = "NO_FORMULA";
      else status = "MISSING";
      return {
        componentId,
        pinnedVersionId: pinned,
        pinnedLabel: pinned ? (versionLabel.get(pinned) ?? null) : null,
        status,
        candidates,
      };
    });
    const coveredCount = slots.filter((s) => s.status === "READY" || s.status === "ALTERNATIVE").length;
    return { productId, slots, coveredCount, totalCount: slots.length };
  });
}
