/**
 * 기법 분류(TECHNIQUE CATEGORY) 공용 타입/헬퍼.
 * 트리는 최대 3단계 (그룹 → 기법군 → 서브타입).
 */
import type { Tables } from "@/integrations/supabase/types";

export type TechniqueCategory = Tables<"technique_categories">;

export interface TechniqueNode {
  category: TechniqueCategory;
  depth: number;
  children: TechniqueNode[];
}

function sortCats(list: TechniqueCategory[]): TechniqueCategory[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/** 부모-자식 트리로 변환 */
export function buildTechniqueTree(list: TechniqueCategory[]): TechniqueNode[] {
  const byParent = new Map<string | null, TechniqueCategory[]>();
  for (const c of list) {
    const key = c.parent_id ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const build = (parentId: string | null, depth: number): TechniqueNode[] =>
    sortCats(byParent.get(parentId) ?? []).map((category) => ({
      category,
      depth,
      children: build(category.id, depth + 1),
    }));
  return build(null, 0);
}

export interface FlatTechnique {
  category: TechniqueCategory;
  depth: number;
  isLeaf: boolean;
}

/** 트리를 평탄화 — 드롭다운/목록용 */
export function flattenTechniques(list: TechniqueCategory[]): FlatTechnique[] {
  const out: FlatTechnique[] = [];
  const walk = (nodes: TechniqueNode[]) => {
    for (const node of nodes) {
      out.push({
        category: node.category,
        depth: node.depth,
        isLeaf: node.children.length === 0,
      });
      walk(node.children);
    }
  };
  walk(buildTechniqueTree(list));
  return out;
}

/** 자식이 없는 항목만 (배합 연결 가능) */
export function leafTechniques(list: TechniqueCategory[]): FlatTechnique[] {
  return flattenTechniques(list).filter((t) => t.isLeaf);
}

/** 루트부터 해당 항목까지의 경로 */
export function techniquePath(
  list: TechniqueCategory[],
  id: string | null | undefined,
): TechniqueCategory[] {
  if (!id) return [];
  const byId = new Map(list.map((c) => [c.id, c]));
  const path: TechniqueCategory[] = [];
  let cursor = byId.get(id) ?? null;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parent_id ? (byId.get(cursor.parent_id) ?? null) : null;
  }
  return path;
}

/**
 * 2026-10-12 사용자 요청: SHEET/CREAM/FILLING(= Pastry Base/Cream & Aerated/Fillings & Inserts)
 * 자동 분류 — technique_categories.slot_group을 "가장 가까운 조상의 값을 상속"하는 규칙으로
 * 해석한다. 리프(또는 중간) 노드에 직접 override된 값이 있으면 그 값을 쓰고, 없으면 부모→조부모
 * 순으로 올라가며 처음 만나는 non-null 값을 쓴다. 끝까지 없으면 null(= 어느 슬롯에도 안 뜸).
 */
export function resolveSlotGroup(
  list: TechniqueCategory[],
  id: string | null | undefined,
): "SHEET" | "CREAM" | "FILLING" | null {
  const path = techniquePath(list, id); // 루트 → 해당 노드 순
  for (let i = path.length - 1; i >= 0; i--) {
    const sg = path[i]!.slot_group;
    if (sg === "SHEET" || sg === "CREAM" || sg === "FILLING") return sg;
  }
  return null;
}

/** 표시 라벨 — 한글 우선, 영문은 보조 */
export function techniqueLabel(c: TechniqueCategory): string {
  return c.name_en ? `${c.name} (${c.name_en})` : c.name;
}

/** 루트부터의 경로를 " / "로 이어붙인 라벨. 없으면 "—" */
export function techniquePathLabel(
  list: TechniqueCategory[],
  id: string | null | undefined,
): string {
  const path = techniquePath(list, id);
  return path.length ? path.map((c) => c.name).join(" / ") : "—";
}
