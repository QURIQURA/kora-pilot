export const POPUP_CHECK_GROUPS = ["ORDER", "PACKAGING", "INGREDIENT", "OTHER"] as const;
export type PopupCheckGroup = (typeof POPUP_CHECK_GROUPS)[number];
export const POPUP_CHECK_LABELS: Record<PopupCheckGroup, string> = {
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
export interface PopupPlan {
  title: string;
  location: string;
  ends_at: string;
  notes: string;
  items: PopupItem[];
  checklist: PopupCheck[];
}
export function readPopupPlan(value: unknown): PopupPlan {
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<PopupPlan>)
      : {};
  return {
    title: typeof v.title === "string" ? v.title : "",
    location: typeof v.location === "string" ? v.location : "",
    ends_at: typeof v.ends_at === "string" ? v.ends_at : "",
    notes: typeof v.notes === "string" ? v.notes : "",
    items: Array.isArray(v.items) ? v.items : [],
    checklist: Array.isArray(v.checklist) ? v.checklist : [],
  };
}
export function newPopupPlan(): PopupPlan {
  return {
    title: "토요일 팝업",
    location: "",
    ends_at: "",
    notes: "",
    items: [],
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
  if (plan.checklist.some((i) => !i.label.trim() || !POPUP_CHECK_GROUPS.includes(i.group)))
    return "준비 항목의 내용과 분류를 입력하세요";
  return null;
}
