export const POPUP_CHECK_GROUPS = ["ORDER", "PACKAGING", "INGREDIENT", "OTHER"] as const;
export type PopupCheckGroup = string;
export const POPUP_CHECK_LABELS: Record<(typeof POPUP_CHECK_GROUPS)[number], string> = {
  ORDER: "주문 확인",
  PACKAGING: "포장 준비",
  INGREDIENT: "재료 구비",
  OTHER: "기타 준비",
};
export interface PopupItem {
  id: string;
  product_id: string;
  standard_id: string;
  label: string;
  quantity: number;
  ready_quantity: number;
  unit: string;
  work_session_id: string;
}
export interface PopupCheck {
  id: string;
  group: PopupCheckGroup;
  label: string;
  done: boolean;
}
export interface PopupCheckCategory {
  id: string;
  label: string;
}
export const defaultPopupCheckCategories = (): PopupCheckCategory[] =>
  POPUP_CHECK_GROUPS.map((id) => ({ id, label: POPUP_CHECK_LABELS[id] }));
export interface PopupPlan {
  title: string;
  location: string;
  ends_at: string;
  notes: string;
  items: PopupItem[];
  checklist: PopupCheck[];
  check_categories: PopupCheckCategory[];
  stage_id: string;
}
export function readPopupPlan(value: unknown): PopupPlan {
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<PopupPlan>)
      : {};
  return {
    stage_id: typeof v.stage_id === "string" ? v.stage_id : "",
    title: typeof v.title === "string" ? v.title : "",
    location: typeof v.location === "string" ? v.location : "",
    ends_at: typeof v.ends_at === "string" ? v.ends_at : "",
    notes: typeof v.notes === "string" ? v.notes : "",
    items: Array.isArray(v.items) ? v.items : [],
    checklist: Array.isArray(v.checklist) ? v.checklist : [],
    check_categories: Array.isArray(v.check_categories)
      ? v.check_categories
      : defaultPopupCheckCategories(),
  };
}
export function newPopupPlan(): PopupPlan {
  return {
    title: "Saturday Night Live",
    location: "",
    ends_at: "",
    notes: "",
    items: [],
    stage_id: "",
    check_categories: defaultPopupCheckCategories(),
    checklist: [
      { id: crypto.randomUUID(), group: "ORDER", label: "예약 주문 확인", done: false },
      { id: crypto.randomUUID(), group: "PACKAGING", label: "포장 수량 준비", done: false },
      { id: crypto.randomUUID(), group: "INGREDIENT", label: "재료 구비", done: false },
    ],
  };
}
export function validatePopupPlan(plan: PopupPlan): string | null {
  if (!plan.title.trim()) return "팝업 이름을 입력하세요";
  if (plan.items.length > 100 || plan.checklist.length > 300)
    return "품목은 100개, 체크 항목은 300개까지 입력할 수 있습니다";
  if (
    new Set(plan.items.map((i) => i.id)).size !== plan.items.length ||
    new Set(plan.checklist.map((i) => i.id)).size !== plan.checklist.length
  )
    return "중복된 항목을 확인하세요";
  for (const item of plan.items) {
    if (!item.label.trim()) return "생산 품목 이름을 입력하세요";
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      !Number.isSafeInteger(item.ready_quantity) ||
      item.ready_quantity < 0
    )
      return "계획 수량은 1 이상, 준비 수량은 0 이상의 정수로 입력하세요";
    if (!item.unit.trim()) return "수량 단위를 입력하세요";
  }
  const categories = plan.check_categories ?? defaultPopupCheckCategories();
  if (categories.length > 30) return "카테고리는 30개까지 추가할 수 있습니다";
  if (
    categories.some(
      (c) => !/^[A-Za-z0-9_-]{1,80}$/.test(c.id) || !c.label.trim() || c.label.trim().length > 80,
    )
  )
    return "카테고리 이름은 1–80자로 입력하세요";
  if (
    new Set(categories.map((c) => c.id)).size !== categories.length ||
    new Set(categories.map((c) => c.label.trim().toLowerCase())).size !== categories.length
  )
    return "같은 이름의 카테고리가 있습니다";
  const categoryIds = new Set(categories.map((c) => c.id));
  if (plan.checklist.some((i) => !i.label.trim() || !categoryIds.has(i.group)))
    return "준비 항목의 내용과 분류를 입력하세요";
  return null;
}

/** Category deletion never deletes checklist items or their completion state. */
export function removePopupCategory(plan: PopupPlan, id: string, targetId?: string): PopupPlan {
  const categories = plan.check_categories ?? defaultPopupCheckCategories();
  if (!categories.some((c) => c.id === id)) throw new Error("카테고리를 찾을 수 없습니다");
  const items = plan.checklist.filter((c) => c.group === id);
  if (items.length && (!targetId || targetId === id || !categories.some((c) => c.id === targetId)))
    throw new Error("항목을 옮길 카테고리를 선택하세요");
  return {
    ...plan,
    check_categories: categories.filter((c) => c.id !== id),
    checklist: plan.checklist.map((c) => (c.group === id ? { ...c, group: targetId! } : c)),
  };
}
