/**
 * Sheet/Cream/Filling(CORE 슬롯)별 파스텔 박스 색(2026-11-09 사용자 요청) — 오더/PRODUCTION/팝업 등
 * 컴포넌트를 보여주는 모든 화면이 같은 색으로 구분되도록 한 곳에서 정의한다.
 * Sheet=옐로, Cream=스카이블루, Filling=연핑크(2026-11-09 사용자 지정). 다크 모드에서는 같은 계열의 어두운 톤.
 */
const SLOT_BOX: Record<string, string> = {
  SHEET: "border-amber-300/80 bg-amber-100/70 dark:border-amber-400/30 dark:bg-amber-950/30",
  CREAM: "border-sky-300/80 bg-sky-100/70 dark:border-sky-400/30 dark:bg-sky-950/30",
  FILLING: "border-pink-200/90 bg-pink-50 dark:border-pink-400/30 dark:bg-pink-950/30",
};

/** 컴포넌트 박스에 붙일 border+배경 클래스. 슬롯이 없거나 CORE가 아니면 기본 카드 색. */
export function slotBoxClass(slot: string | null | undefined): string {
  return (slot && SLOT_BOX[slot]) || "border-border bg-card";
}
