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

/**
 * 이미 생산한(또는 생산 날짜가 지난) 컴포넌트를 다른 용도로 써버려서 다시 만들어야 할 때 —
 * 2026-11-09 사용자 요청("컴포넌트별로 적용"). 그 컴포넌트 행 하나만:
 *  1) 연결된 작업 기록(work_session_tasks)을 NOT_STARTED로 되돌리고 시작/완료 시각·타이머를 비운다.
 *  2) 시간 배정(work_blocks)을 풀면서 플래너 TASK도 함께 지운다(edge function remove_block_id).
 * 결과적으로 시간 미배정 상태로 DASHBOARD 작업 대기공간에 다시 올라간다. 오더·레시피·계량 기록은 건드리지 않는다.
 */
export async function reopenComponentForProduction(row: WorkSessionFormulaVersionRow) {
  const uid = await currentUserId();
  if (row.user_id !== uid) throw new Error("작업 항목에 접근할 수 없습니다");
  const { data: blocks, error: blockError } = await supabase
    .from("work_blocks")
    .select("id,work_session_task_id")
    .eq("user_id", uid)
    .eq("work_session_formula_version_id", row.id);
  if (blockError) throw blockError;
  const taskIds = [
    ...new Set(
      (blocks ?? []).flatMap((b) => (b.work_session_task_id ? [b.work_session_task_id] : [])),
    ),
  ];
  if (taskIds.length) {
    const { error: resetError } = await supabase
      .from("work_session_tasks")
      .update({ status: "NOT_STARTED", actual_started_at: null, completed_at: null, timers: [] })
      .eq("user_id", uid)
      .in("id", taskIds);
    if (resetError) throw resetError;
  }
  for (const block of blocks ?? []) {
    const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
      body: { remove_block_id: block.id, work_session_id: row.work_session_id },
    });
    if (error) throw error;
    if (data && typeof data === "object" && "error" in data && data.error)
      throw new Error(String((data as { error: unknown }).error));
  }
}
