import { supabase } from "@/integrations/supabase/client";
import { currentUserId, type WorkSessionFormulaVersionRow } from "@/lib/queries";
import { syncWorkSessionToPlanner } from "@/lib/work-session";

/** Explicitly remove one planned assignment, never its master Component or Formula. */
export async function removePlannedComponent(row: WorkSessionFormulaVersionRow) {
  const uid = await currentUserId();
  if (row.user_id !== uid) throw new Error("작업 항목에 접근할 수 없습니다");
  const { data: session, error: sessionError } = await supabase
    .from("work_sessions")
    .select("status,order_id")
    .eq("id", row.work_session_id)
    .eq("user_id", uid)
    .single();
  if (sessionError) throw sessionError;
  if (["COMPLETED", "CANCELLED"].includes(session.status))
    throw new Error("완료·취소된 작업은 변경할 수 없습니다");
  if (session.order_id) {
    const { data: order, error } = await supabase
      .from("orders")
      .select("status")
      .eq("id", session.order_id)
      .eq("user_id", uid)
      .single();
    if (error) throw error;
    if (["COMPLETED", "CANCELLED"].includes(order.status))
      throw new Error("완료·취소된 주문은 변경할 수 없습니다");
  }
  const [blockResult, progressResult, siblingResult] = await Promise.all([
    supabase
      .from("work_blocks")
      .select("id,planner_task_id,work_session_task_id")
      .eq("user_id", uid)
      .eq("work_session_formula_version_id", row.id),
    supabase
      .from("work_session_progress")
      .select("status,note")
      .eq("user_id", uid)
      .eq("work_session_formula_version_id", row.id),
    supabase
      .from("work_session_formula_versions")
      .select("id")
      .eq("user_id", uid)
      .eq("work_session_id", row.work_session_id)
      .eq("formula_version_id", row.formula_version_id)
      .neq("id", row.id),
  ]);
  for (const result of [blockResult, progressResult, siblingResult])
    if (result.error) throw result.error;
  const linkedIds = (blockResult.data ?? []).flatMap((b) =>
    b.work_session_task_id ? [b.work_session_task_id] : [],
  );
  let taskIds: string[] = [];
  if (!(siblingResult.data ?? []).length || linkedIds.length) {
    let query = supabase
      .from("work_session_tasks")
      .select("id,status,actual_started_at,completed_at,note,checklist_items")
      .eq("user_id", uid)
      .eq("work_session_id", row.work_session_id)
      .eq("formula_version_id", row.formula_version_id);
    if ((siblingResult.data ?? []).length) query = query.in("id", linkedIds);
    const { data, error } = await query;
    if (error) throw error;
    if (
      (data ?? []).some(
        (t) =>
          t.actual_started_at ||
          t.completed_at ||
          t.note ||
          t.status !== "NOT_STARTED" ||
          (Array.isArray(t.checklist_items) &&
            t.checklist_items.some(
              (i) => typeof i === "object" && i !== null && "done" in i && i["done"],
            )),
      )
    )
      throw new Error(
        "생산 기록이 있는 항목은 삭제하지 않습니다. 기존 기록을 확인하고 계획을 교체하세요.",
      );
    taskIds = (data ?? []).map((t) => t.id);
  }
  if ((progressResult.data ?? []).some((p) => p.status !== "NOT_STARTED" || p.note))
    throw new Error("계량 기록이 있는 항목은 삭제하지 않습니다. 기존 기록을 먼저 확인하세요.");
  // CAS deletion logs the original selection through the existing DB audit trigger.
  const { data: removed, error } = await supabase
    .from("work_session_formula_versions")
    .delete()
    .eq("id", row.id)
    .eq("user_id", uid)
    .eq("updated_at", row.updated_at)
    .select("id")
    .single();
  if (error || !removed)
    throw new Error("다른 화면에서 변경됐거나 삭제하지 못했습니다. 최신 값을 불러오세요.");
  if (taskIds.length) {
    const { data: referenced, error: referenceError } = await supabase
      .from("work_blocks")
      .select("work_session_task_id")
      .eq("user_id", uid)
      .in("work_session_task_id", taskIds);
    if (referenceError) throw referenceError;
    const keep = new Set((referenced ?? []).map((b) => b.work_session_task_id));
    const unused = taskIds.filter((id) => !keep.has(id));
    if (unused.length) {
      const { error: taskError } = await supabase
        .from("work_session_tasks")
        .delete()
        .eq("user_id", uid)
        .in("id", unused)
        .eq("status", "NOT_STARTED")
        .is("actual_started_at", null)
        .is("completed_at", null)
        .is("note", null);
      if (taskError) throw taskError;
    }
  }
  const plannerIds = [
    ...(row.planner_task_id ? [row.planner_task_id] : []),
    ...(blockResult.data ?? []).flatMap((b) => (b.planner_task_id ? [b.planner_task_id] : [])),
  ];
  return await syncWorkSessionToPlanner(row.work_session_id, { deletePlannerTaskIds: plannerIds });
}
