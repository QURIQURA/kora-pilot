// WORK SESSION의 CORE ELEMENT(SHEET/CREAM/FILLING)를 ORDER의 WANN 프로젝트 하위 TASK로 동기화한다.
//
// 2026-10-22 개편 (PRODUCTION 메인보드 DASHBOARD — 작업 대기공간 + 데일리 타임라인):
// - 컴포넌트 행(work_session_formula_versions, kind=CORE)에 "작업 블록"(work_blocks: 날짜/시작/종료/차수)이
//   있으면 블록 1개 = TASK 1개. 한 컴포넌트가 여러 블록(1차/2차)이면 제목에 " (n차)"가 붙는다.
// - 블록이 없는 컴포넌트 행은 예전과 동일하게 행 1개 = TASK 1개(날짜는 세션의 scheduled_date).
// - 이 함수가 만드는 TASK에는 kora_work_session_id를 채우지 않는다 — WANN planner_tasks에는 그 컬럼의
//   유니크 인덱스(세션당 TASK 1개, 예전 단독 TASK 시절 잔재)가 남아 있어 여러 TASK를 만들 수 없기 때문.
//   KORA ↔ WANN 매칭은 planner_task_id(행/블록 쪽)로만 기록한다.
// - 요청 본문: { work_session_id?, remove_block_id?, delete_planner_task_ids? }
//   remove_block_id: 블록을 지우면서(배정 해제) 그 TASK도 같이 지우고 재동기화.
//   delete_planner_task_ids: 컴포넌트 행 삭제처럼 KORA 행이 사라지기 전에 알던 TASK id를 정리.
//   (PRODUCTION 서브태그가 붙은 TASK만 지운다 — 직접 만든 TASK는 건드리지 않는다.)
//
// 멱등성: 이미 planner_task_id가 있으면 그 TASK를 UPDATE(WANN 쪽 완료 체크 등 보존), 없거나 WANN에서
// 지워졌으면 INSERT 후 id를 저장한다.
//
// KORA Business 프로젝트에서 실행되며, 별도 프로젝트인 WANN OS는 WANN_OS_SERVICE_ROLE_KEY 시크릿으로
// 접근한다. WANN OS 쪽 고정 user_id/category_id/subtag_id를 하드코딩해서 쓴다(1인 사용자 앱).
import { createClient } from "jsr:@supabase/supabase-js@2";

const WANN_OS_URL = "https://txrxzsrjqwhvjosutotp.supabase.co";
const WANN_USER_ID = "1f1dd73b-cfa9-47d3-855b-f1d58283885f";
const WANN_SHCO_CATEGORY_ID = "c8068046-5bb0-4043-acbb-60f862fcad52";
const WANN_PRODUCTION_SUBTAG_ID = "ce89b071-61c5-4378-8403-99b93990598f";

// src/lib/queries.ts의 CORE_SLOT_LABELS와 동일 — Edge Function은 앱 코드를 import할 수 없어 복제.
const CORE_SLOT_LABELS: Record<string, string> = {
  SHEET: "Pastry Base",
  CREAM: "Cream & Aerated Components",
  FILLING: "Fillings & Inserts",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CoreRow = {
  id: string;
  slot: string | null;
  planner_task_id: string | null;
  formula_versions: {
    formulas: { name: string; components: { name: string } | null } | null;
  } | null;
};

type Block = {
  id: string;
  work_session_formula_version_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  part_no: number;
  planner_task_id: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    let sessionId: string | null = body.work_session_id ?? null;
    const removeBlockId: string | null = body.remove_block_id ?? null;
    const deleteIds: string[] = Array.isArray(body.delete_planner_task_ids)
      ? body.delete_planner_task_ids.filter((s: unknown) => typeof s === "string")
      : [];
    if (!sessionId && !removeBlockId) return json({ error: "work_session_id required" }, 400);

    const kora = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const wannServiceKey = Deno.env.get("WANN_OS_SERVICE_ROLE_KEY");
    if (!wannServiceKey) {
      return json({ error: "WANN_OS_SERVICE_ROLE_KEY secret이 설정되지 않았습니다." }, 500);
    }
    const wann = createClient(WANN_OS_URL, wannServiceKey);

    const deleteWannTasks = async (ids: string[]) => {
      if (ids.length === 0) return;
      await wann
        .from("planner_tasks")
        .delete()
        .in("id", ids)
        .eq("subtag_id", WANN_PRODUCTION_SUBTAG_ID);
    };

    // 1) 블록 배정 해제 — 블록 행과 그 TASK를 함께 지운다.
    const taskIdsToDelete = [...deleteIds];
    if (removeBlockId) {
      const { data: blk, error: blkError } = await kora
        .from("work_blocks")
        .select("id, planner_task_id, work_session_formula_versions(work_session_id)")
        .eq("id", removeBlockId)
        .maybeSingle();
      if (blkError) throw blkError;
      if (blk) {
        if (blk.planner_task_id) taskIdsToDelete.push(blk.planner_task_id);
        const { error: delError } = await kora.from("work_blocks").delete().eq("id", removeBlockId);
        if (delError) throw delError;
        const joined = blk.work_session_formula_versions as unknown;
        const ws = Array.isArray(joined)
          ? (joined[0] as { work_session_id?: string } | undefined)?.work_session_id
          : (joined as { work_session_id?: string } | null)?.work_session_id;
        if (ws) sessionId = ws;
      }
    }
    await deleteWannTasks(taskIdsToDelete);
    if (!sessionId) return json({ synced: false, reason: "nothing to sync" });

    const { data: session, error: sessionError } = await kora
      .from("work_sessions")
      .select("id, name, order_id, scheduled_date, scheduled_start_time, scheduled_end_time")
      .eq("id", sessionId)
      .single();
    if (sessionError) throw sessionError;

    const { data: coreRowsRaw, error: coreRowsError } = await kora
      .from("work_session_formula_versions")
      .select("id, slot, planner_task_id, formula_versions(formulas(name, components(name)))")
      .eq("work_session_id", sessionId)
      .eq("kind", "CORE");
    if (coreRowsError) throw coreRowsError;
    const coreRows = (coreRowsRaw ?? []) as unknown as CoreRow[];

    let blocks: Block[] = [];
    if (coreRows.length > 0) {
      const { data: blocksRaw, error: blocksError } = await kora
        .from("work_blocks")
        .select(
          "id, work_session_formula_version_id, block_date, start_time, end_time, part_no, planner_task_id",
        )
        .in(
          "work_session_formula_version_id",
          coreRows.map((r) => r.id),
        );
      if (blocksError) throw blocksError;
      blocks = (blocksRaw ?? []) as Block[];
    }

    let projectId: string | null = null;
    if (session.order_id) {
      const { data: order, error: orderError } = await kora
        .from("orders")
        .select("wann_project_id")
        .eq("id", session.order_id)
        .single();
      if (orderError) throw orderError;
      projectId = order.wann_project_id;
    }

    // 오더 미연결 / 오더에 WANN 프로젝트가 아직 없음 → 만들어둔 TASK 전부 정리하고 끝낸다.
    if (!session.order_id || !projectId) {
      const rowTaskIds = coreRows.map((r) => r.planner_task_id).filter((id): id is string => !!id);
      const blockTaskIds = blocks.map((b) => b.planner_task_id).filter((id): id is string => !!id);
      await deleteWannTasks([...rowTaskIds, ...blockTaskIds]);
      if (rowTaskIds.length > 0) {
        await kora
          .from("work_session_formula_versions")
          .update({ planner_task_id: null })
          .in(
            "id",
            coreRows.filter((r) => r.planner_task_id).map((r) => r.id),
          );
      }
      if (blockTaskIds.length > 0) {
        await kora
          .from("work_blocks")
          .update({ planner_task_id: null })
          .in(
            "id",
            blocks.filter((b) => b.planner_task_id).map((b) => b.id),
          );
      }
      return json({
        synced: false,
        reason: !session.order_id
          ? "work session not linked to an order"
          : "order has no wann project yet",
      });
    }

    const common = {
      user_id: WANN_USER_ID,
      category_id: WANN_SHCO_CATEGORY_ID,
      subtag_id: WANN_PRODUCTION_SUBTAG_ID,
      category_ids: [WANN_SHCO_CATEGORY_ID],
      recurrence: "none",
      // 유니크 인덱스(세션당 1개) 때문에 새 TASK에는 채우지 않는다. 기존 TASK를 UPDATE할 때는 null로 풀어준다.
      kora_work_session_id: null,
      multiple_task_id: projectId,
    };

    /** 기존 TASK가 있으면 UPDATE, 없거나 WANN에서 지워졌으면 INSERT. 최종 TASK id를 돌려준다. */
    const upsertTask = async (
      existingId: string | null,
      payload: Record<string, unknown>,
    ): Promise<string> => {
      if (existingId) {
        const { data: updated, error: updateError } = await wann
          .from("planner_tasks")
          .update(payload)
          .eq("id", existingId)
          .select("id");
        if (updateError) throw updateError;
        if (updated && updated.length > 0) return existingId;
      }
      const { data: inserted, error: insertError } = await wann
        .from("planner_tasks")
        .insert(payload)
        .select("id")
        .single();
      if (insertError) throw insertError;
      return inserted.id;
    };

    const syncedTaskIds: string[] = [];
    for (const row of coreRows) {
      const formula = row.formula_versions?.formulas ?? null;
      const label = formula?.components?.name ?? formula?.name ?? "—";
      const slotLabel = (row.slot && CORE_SLOT_LABELS[row.slot]) || row.slot || "CORE";
      const baseTitle = `${slotLabel} — ${label}`;

      const rowBlocks = blocks
        .filter((b) => b.work_session_formula_version_id === row.id)
        .sort((a, b) => a.part_no - b.part_no || a.start_time.localeCompare(b.start_time));

      if (rowBlocks.length > 0) {
        // 블록이 있으면 TASK는 블록 단위. 예전 행 단위 TASK는 첫 블록이 이어받는다(완료 체크 등 보존).
        let legacyTaskId = row.planner_task_id;
        for (const block of rowBlocks) {
          let existingId = block.planner_task_id;
          if (!existingId && legacyTaskId) {
            existingId = legacyTaskId;
            legacyTaskId = null;
          }
          const taskId = await upsertTask(existingId, {
            ...common,
            title: rowBlocks.length > 1 ? `${baseTitle} (${block.part_no}차)` : baseTitle,
            due_date: block.block_date,
            due_time: block.start_time,
            end_time: block.end_time,
          });
          syncedTaskIds.push(taskId);
          if (taskId !== block.planner_task_id) {
            const { error: linkError } = await kora
              .from("work_blocks")
              .update({ planner_task_id: taskId })
              .eq("id", block.id);
            if (linkError) throw linkError;
          }
        }
        if (row.planner_task_id) {
          // 이어받지 못한 예전 TASK는 지우고, 행 쪽 연결은 비운다.
          if (legacyTaskId) await deleteWannTasks([legacyTaskId]);
          const { error: clearError } = await kora
            .from("work_session_formula_versions")
            .update({ planner_task_id: null })
            .eq("id", row.id);
          if (clearError) throw clearError;
        }
      } else {
        // 블록 없음 → 예전 방식(행 1개 = TASK 1개, 날짜는 세션의 scheduled_date).
        const taskId = await upsertTask(row.planner_task_id, {
          ...common,
          title: baseTitle,
          due_date: session.scheduled_date,
          due_time: session.scheduled_start_time,
          end_time: session.scheduled_end_time,
        });
        syncedTaskIds.push(taskId);
        if (taskId !== row.planner_task_id) {
          const { error: linkError } = await kora
            .from("work_session_formula_versions")
            .update({ planner_task_id: taskId })
            .eq("id", row.id);
          if (linkError) throw linkError;
        }
      }
    }

    return json({ synced: true, project_id: projectId, task_ids: syncedTaskIds });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
