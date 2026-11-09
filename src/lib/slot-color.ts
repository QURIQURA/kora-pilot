/**
 * Sheet/Cream/Filling(CORE 슬롯)별 파스텔 박스 색(2026-11-09 사용자 요청) — 오더/PRODUCTION/팝업 등
 * 컴포넌트를 보여주는 모든 화면이 같은 색으로 구분되도록 한 곳에서 정의한다.
 * Sheet=버터크림 옐로, Cream=핑크, Filling=민트. 다크 모드에서는 같은 계열의 어두운 톤.
 */
const SLOT_BOX: Record<string, string> = {
  SHEET: "border-amber-300/80 bg-amber-100/70 dark:border-amber-400/30 dark:bg-amber-950/30",
  CREAM: "border-pink-300/80 bg-pink-100/70 dark:border-pink-400/30 dark:bg-pink-950/30",
  FILLING:
    "border-emerald-300/80 bg-emerald-100/70 dark:border-emerald-400/30 dark:bg-emerald-950/30",
};

/** 컴포넌트 박스에 붙일 border+배경 클래스. 슬롯이 없거나 CORE가 아니면 기본 카드 색. */
export function slotBoxClass(slot: string | null | undefined): string {
  return (slot && SLOT_BOX[slot]) || "border-border bg-card";
}
