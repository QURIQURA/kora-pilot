import { supabase } from "@/integrations/supabase/client";
import { currentUserId, type DashboardComponentRow, type WorkBlock } from "@/lib/queries";
import { newTimer } from "@/lib/task-timers";

/** 블록 날짜+시각(로컬)을 ISO로 */
function blockIso(date: string, time: string | null | undefined): string | null {
  if (!time) return null;
  const d = new Date(`${date}T${time.slice(0, 5)}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 블록의 마지막 시각이 지금보다 이전이면 true — 일정이 이미 지난 블록 */
export function isBlockPast(block: Pick<WorkBlock, "block_date" | "start_time" | "end_time">) {
  const iso = blockIso(block.block_date, block.end_time ?? block.start_time);
  return iso != null && new Date(iso).getTime() < Date.now();
}

/**
 * 타이머를 못 눌렀지만 이미 끝낸 작업을 일괄 완료 처리한다.
 * TASK가 없으면 만들고, 시작/종료 시각이 비어 있으면 블록의 계획 시각으로 채운다(이미 기록된 값은 유지).
 */
export async function completeComponentBlocks(
  row: DashboardComponentRow,
  blocks: WorkBlock[],
  doneTaskIds: Set<string>,
): Promise<void> {
  const userId = await currentUserId();
  for (const block of blocks) {
    if (block.work_session_task_id && doneTaskIds.has(block.work_session_task_id)) continue;
    let taskId = block.work_session_task_id;
    if (!taskId) {
      const { data: created, error } = await supabase
        .from("work_session_tasks")
        .insert({
          user_id: userId,
          work_session_id: row.work_session_id,
          formula_version_id: row.formulaVersionId,
          task_name: block.step_name ?? row.componentName,
          task_type: row.slot === "SHEET" ? "Bake" : null,
          timers: [newTimer()] as never,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      taskId = created.id;
      const { error: linkErr } = await supabase
        .from("work_blocks")
        .update({ work_session_task_id: taskId })
        .eq("id", block.id);
      if (linkErr) throw linkErr;
    }
    const { data: cur, error: curErr } = await supabase
      .from("work_session_tasks")
      .select("actual_started_at, completed_at")
      .eq("id", taskId)
      .single();
    if (curErr) throw curErr;
    const start = cur.actual_started_at ?? blockIso(block.block_date, block.start_time);
    const end = cur.completed_at ?? blockIso(block.block_date, block.end_time) ?? start;
    const { error: upErr } = await supabase
      .from("work_session_tasks")
      .update({ status: "DONE", actual_started_at: start, completed_at: end })
      .eq("id", taskId)
      .eq("user_id", userId);
    if (upErr) throw upErr;
  }
}
