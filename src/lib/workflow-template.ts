/**
 * WORKFLOW TEMPLATE 적용 로직 — SETTINGS에서 등록해둔 템플릿(workflow_template_tasks +
 * workflow_template_task_predecessors)을 실제 work_session_tasks로 복제한다(2026-09-24).
 *
 * 두 군데에서 공유해서 쓴다:
 * - WorkflowTimeline.tsx의 "템플릿 불러오기" 수동 적용
 * - $sessionId.tsx에서 Component를 세션에 추가할 때, 그 Component의 default_workflow_template_id +
 *   auto_apply_default_workflow가 켜져 있으면 자동 적용
 *
 * 생성되는 TASK는 항상 formulaVersionId 열(품목)에 배정된다 — 그래야 그 Component의 독립적인
 * WORKFLOW 진행(LOCKED/READY/ACTIVE/DONE)으로 표시된다. 체크리스트/선택여부/타이머 길이는 템플릿
 * TASK에서 그대로 복사한다(체크리스트는 진행상태 done:false로 초기화).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ApplyWorkflowTemplateParams {
  templateId: string;
  sessionId: string;
  userId: string;
  /** null이면 GENERAL 열(품목 미지정)에 TASK를 만든다 */
  formulaVersionId: string | null;
}

export async function applyWorkflowTemplate({
  templateId,
  sessionId,
  userId,
  formulaVersionId,
}: ApplyWorkflowTemplateParams): Promise<{ error: string | null }> {
  const { data: templateTasks, error: e1 } = await supabase
    .from("workflow_template_tasks")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order");
  if (e1 || !templateTasks) {
    return { error: `템플릿 TASK 조회 실패 — ${e1?.message ?? "unknown error"}` };
  }
  if (templateTasks.length === 0) {
    return { error: "이 템플릿에 TASK가 없습니다 — SETTINGS에서 먼저 TASK를 등록하세요." };
  }

  const { data: predRows, error: e2 } = await supabase
    .from("workflow_template_task_predecessors")
    .select("task_id, predecessor_task_id")
    .eq("template_id", templateId);
  if (e2) return { error: `템플릿 선행관계 조회 실패 — ${e2.message}` };

  const { data: existingTasks, error: e0 } = await supabase
    .from("work_session_tasks")
    .select("sort_order")
    .eq("work_session_id", sessionId);
  if (e0) return { error: `기존 TASK 조회 실패 — ${e0.message}` };
  const maxSort = (existingTasks ?? []).reduce((acc, t) => Math.max(acc, t.sort_order), 0);

  const { data: insertedRows, error: e3 } = await supabase
    .from("work_session_tasks")
    .insert(
      templateTasks.map((t, idx) => ({
        work_session_id: sessionId,
        user_id: userId,
        formula_version_id: formulaVersionId,
        task_name: t.task_name,
        task_type: t.task_type,
        sort_order: maxSort + 1 + idx,
        is_optional: t.is_optional,
        timer_minutes: t.timer_minutes,
        checklist_items:
          t.checklist_items && t.checklist_items.length > 0
            ? t.checklist_items.map((label) => ({ label, done: false }))
            : null,
      })),
    )
    .select("id");
  if (e3 || !insertedRows) {
    return { error: `TASK 생성 실패 — ${e3?.message ?? "unknown error"}` };
  }

  const idMap = new Map<string, string>();
  templateTasks.forEach((t, idx) => idMap.set(t.id, insertedRows[idx]!.id));
  const predInserts = (predRows ?? [])
    .filter((r) => idMap.has(r.task_id) && idMap.has(r.predecessor_task_id))
    .map((r) => ({
      user_id: userId,
      work_session_id: sessionId,
      task_id: idMap.get(r.task_id)!,
      predecessor_task_id: idMap.get(r.predecessor_task_id)!,
    }));
  if (predInserts.length > 0) {
    const { error: e4 } = await supabase.from("work_session_task_predecessors").insert(predInserts);
    if (e4) return { error: `선행관계 생성 실패 — ${e4.message}` };
  }

  return { error: null };
}
