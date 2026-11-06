/**
 * 세션에 컴포넌트를 추가할 때 기본 TASK 한 줄(구움 시트는 BAKE, 그 외 PREPARE)을 만든다.
 * 워크플로 템플릿 기능은 2026-11-06에 삭제했다(DB 테이블은 기록용으로 남겨둠).
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveSlotGroup, type TechniqueCategory } from "@/lib/technique";

export interface WorkflowDefaultsComponent {
  technique_category_id: string | null;
}

/**
 * WORK SESSION에 Formula Version(=열/품목) 하나가 추가될 때마다 호출해야 하는 "기본 WORKFLOW
 * 깔아주기" 로직 — 원래 $sessionId.tsx의 "+ ADD SHEET/CREAM/FILLING" 버튼(add mutation) 안에만
 * 있던 걸 공용 함수로 뽑아냈다(2026-10-21 사용자 요청: "시폰 레시피 task 기본꺼 왜 안떠?").
 * ORDER 페이지에서 "work session 생성"을 누르면 CORE 재료 행을 Supabase에 직접 insert해서 이
 * 로직을 한 번도 안 거치는 경로가 있었던 게 원인이라, 이제 그 경로에서도 이 함수를 호출한다.
 *
 * WORKFLOW가 영영 "NO TASKS YET"로 비어있지 않도록 포뮬러 하나당 기본 TASK 1개
 * (굽는 포뮬라는 BAKE, 그 외는 PREPARE)를 만든다.
 */
export async function applyDefaultWorkflowForFormulaVersion({
  sessionId,
  userId,
  formulaVersionId,
  component,
  formulaTechniqueCategoryId,
  techniqueCategories,
}: {
  sessionId: string;
  userId: string;
  formulaVersionId: string;
  component: WorkflowDefaultsComponent | null | undefined;
  /** component가 없거나 component.technique_category_id가 비어있을 때의 대체값 — 기준 배합
   * 라이브러리처럼 Component 없이 Formula 자체에 technique_category_id가 붙어있는 경우. */
  formulaTechniqueCategoryId: string | null;
  techniqueCategories: TechniqueCategory[];
}): Promise<{ error: string | null }> {
  const catId = component?.technique_category_id ?? formulaTechniqueCategoryId ?? null;
  const isBaked = resolveSlotGroup(techniqueCategories, catId) === "SHEET";
  const { data: existingTasks, error: existingError } = await supabase
    .from("work_session_tasks")
    .select("sort_order")
    .eq("work_session_id", sessionId);
  if (existingError) return { error: `기존 TASK 조회 실패 — ${existingError.message}` };
  const maxSort = (existingTasks ?? []).reduce((acc, t) => Math.max(acc, t.sort_order), -1);
  const { error: taskError } = await supabase.from("work_session_tasks").insert({
    user_id: userId,
    work_session_id: sessionId,
    formula_version_id: formulaVersionId,
    task_name: isBaked ? "BAKE" : "PREPARE",
    task_type: isBaked ? "Bake" : null,
    sort_order: maxSort + 1,
  });
  if (taskError) return { error: `기본 TASK 생성 실패 — ${taskError.message}` };
  return { error: null };
}
