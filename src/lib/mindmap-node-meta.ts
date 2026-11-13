/** 마인드맵 노드 상세(2026-11-13) — node.data.meta 에 저장. 없으면 빈 값으로 취급(하위 호환). */
export type Priority = "" | "high" | "mid" | "low";
export type NodeStatus = "" | "todo" | "doing" | "done" | "hold";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  due?: string;
}
export interface NodeLink {
  id: string;
  label: string;
  url: string;
}
export interface NodeMeta {
  description?: string;
  tags?: string[];
  priority?: Priority;
  status?: NodeStatus;
  due?: string;
  notes?: string;
  checklist?: ChecklistItem[];
  links?: NodeLink[];
  /** 연결된 WANN 플래너 TASK id(참조만 저장 — 상태의 원천은 플래너) */
  taskIds?: string[];
}

export const PRIORITY_LABEL: Record<Exclude<Priority, "">, string> = {
  high: "높음",
  mid: "보통",
  low: "낮음",
};
export const STATUS_LABEL: Record<Exclude<NodeStatus, "">, string> = {
  todo: "시작 전",
  doing: "진행 중",
  done: "완료",
  hold: "보류",
};

export const getMeta = (data: unknown): NodeMeta =>
  ((data as { meta?: NodeMeta } | undefined)?.meta ?? {}) as NodeMeta;

export const newItemId = () =>
  `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
