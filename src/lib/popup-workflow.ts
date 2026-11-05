export interface PopupStage {
  id: string;
  label: string;
}
export const DEFAULT_POPUP_STAGES: PopupStage[] = [
  { id: "PLANNING", label: "기획" },
  { id: "PREPARING", label: "준비" },
  { id: "PRODUCTION", label: "생산" },
  { id: "READY", label: "준비 완료" },
  { id: "LIVE", label: "판매 중" },
  { id: "COMPLETED", label: "완료" },
];
export function readPopupStages(value: unknown): PopupStage[] {
  return Array.isArray(value) && value.length
    ? (value as PopupStage[])
    : DEFAULT_POPUP_STAGES.map((s) => ({ ...s }));
}
export function validatePopupStages(stages: PopupStage[]): string | null {
  if (stages.length < 2 || stages.length > 30)
    return "진행 단계는 완료 단계를 포함해 2–30개로 구성하세요";
  if (stages.at(-1)?.id !== "COMPLETED") return "완료 단계는 마지막에 유지하세요";
  if (
    stages.some(
      (s) => !/^[A-Za-z0-9_-]{1,80}$/.test(s.id) || !s.label.trim() || s.label.trim().length > 80,
    )
  )
    return "단계 이름은 1–80자로 입력하세요";
  if (
    new Set(stages.map((s) => s.id)).size !== stages.length ||
    new Set(stages.map((s) => s.label.trim().toLowerCase())).size !== stages.length
  )
    return "같은 이름의 진행 단계가 있습니다";
  return null;
}
export function popupStageId(
  plan: { stage_id?: string },
  status: string,
  stages: PopupStage[],
): string {
  return plan.stage_id || (status === "COMPLETED" ? "COMPLETED" : (stages[0]?.id ?? "PLANNING"));
}
export function popupStageLabel(
  plan: { stage_id?: string },
  status: string,
  stages: PopupStage[],
): string {
  const id = popupStageId(plan, status, stages);
  return stages.find((s) => s.id === id)?.label ?? id;
}

/** 팝업 단계 점 색 — 주문 상태와 같은 팔레트를 단계 순서대로 쓰고, 마지막 COMPLETED는 주문 COMPLETED와 같은 짙은 색. */
const STAGE_PALETTE = ["#9ca3af", "#60a5fa", "#a78bfa", "#fb923c", "#fbbf24", "#34d399"];
export function popupStageColor(stages: PopupStage[], id: string): string {
  if (id === "COMPLETED") return "#374151";
  const index = stages.findIndex((s) => s.id === id);
  return index < 0 ? "#9ca3af" : (STAGE_PALETTE[index % STAGE_PALETTE.length] ?? "#9ca3af");
}
