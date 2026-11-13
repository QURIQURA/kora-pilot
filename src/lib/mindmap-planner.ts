import { supabase } from "@/integrations/supabase/client";

/** 마인드맵 노드 ↔ WANN 플래너 TASK 연동(2026-11-13). 서버: edge function sync-work-session-to-planner
 * 의 mindmap 액션(소유자 전용). 마인드맵에는 task id만 저장하고 상태는 항상 플래너에서 읽는다. */
export interface PlannerTaskRef {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  project_id: string | null;
  project_name: string | null;
}

async function call<T>(mindmap: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
    body: { mindmap },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in data && data.error)
    throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

export async function fetchPlannerTasks(ids: string[]): Promise<PlannerTaskRef[]> {
  if (ids.length === 0) return [];
  const r = await call<{ tasks: PlannerTaskRef[] }>({ op: "get", ids });
  return r.tasks;
}
export async function searchPlannerTasks(q: string): Promise<PlannerTaskRef[]> {
  const r = await call<{ tasks: PlannerTaskRef[] }>({ op: "search", q });
  return r.tasks;
}
/** key(보드·노드·제목)로 중복 생성을 막는다 — 이미 있으면 duplicate=true 로 기존 TASK를 돌려준다. */
export async function createPlannerTask(input: {
  board_id: string;
  node_id: string;
  title: string;
  due_date?: string | null;
  notes?: string | null;
  /** 플래너 프로젝트 이름 접두어 — 마인드맵은 Mindmap, 밸류 매트릭스는 Value Matrix */
  prefix?: "Mindmap" | "Value Matrix";
}): Promise<{ task: PlannerTaskRef; duplicate: boolean }> {
  return call({ op: "create", ...input });
}
export async function setPlannerTaskDone(id: string, completed: boolean): Promise<void> {
  await call({ op: "complete", id, completed });
}
