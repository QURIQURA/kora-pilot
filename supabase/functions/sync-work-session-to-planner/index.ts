// 2026-10-20 재설계 (사용자 요청: "work session의 production 일정이 잡힐때, 관련 오더의
// 프로젝트가 이미 자동 생성되니까 하위 태스크도 추가되는 시트/크림을 task 이름으로 해서
// 생성했으면 좋겠어"):
//
// 이전(2026-10-13~19)에는 WORK SESSION 하나당 "단독 TASK"(어느 프로젝트에도 속하지 않는) 하나를
// 만들고, 그 아래 WORKFLOW TASK들을 subitem으로 동기화했다. 이게 ORDER가 CONFIRMED될 때 만드는
// WANN 프로젝트와는 별개로 떠서 프로젝트 밖에 중복이 쌓이는 문제였다(2026-10-20 제거).
//
// 새 방식: WORK SESSION이 ORDER에 연결되어 있고(work_sessions.order_id) 그 ORDER에 이미 WANN
// 프로젝트가 있으면(orders.wann_project_id — ORDER CONFIRMED 전환 시 자동 생성, 이 함수와는
// 별개의 트리거), CORE ELEMENT(SHEET/CREAM/FILLING) 각각을 그 프로젝트 하위의 TASK 하나씩으로
// 만든다. TASK 제목은 "<슬롯 라벨> — <컴포넌트/포뮬라 이름>". DECORATIVE 요소는 대상이 아니다
// (CORE만 — 사용자가 명시한 "시트/크림").
//
// 멱등성: work_session_formula_versions.planner_task_id(KORA, 2026-10-20 추가, WANN 쪽
// planner_tasks에는 FK를 걸 수 없어 KORA 쪽에서 매칭을 기록)에 이미 값이 있으면 그 TASK를
// UPDATE(완료 체크 등 WANN 쪽 상태 보존), 없으면 INSERT 후 id를 저장한다. 더 이상 대상이 아닌
// (CORE 행이 지워졌거나 슬롯이 바뀐) 과거 TASK는 지운다.
//
// 이 함수는 KORA Business 프로젝트에서 실행되며, 두 개의 완전히 분리된 Supabase 프로젝트를
// 다룬다 — KORA Business(이 함수 자신의 SERVICE_ROLE_KEY, 환경변수로 자동 제공)와 WANN
// OS(별도 프로젝트 — service role key를 WANN_OS_SERVICE_ROLE_KEY 시크릿으로 저장). 두 프로젝트는
// 서로 다른 Auth 인스턴스라 사용자 JWT를 그대로 넘길 수 없고 매핑도 안 되어 있어 — WANN OS 쪽
// 고정 user_id/category_id/subtag_id를 하드코딩해서 쓴다(이 앱은 1인 사용자 — 연 전용).
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { work_session_id } = await req.json();
    if (!work_session_id) {
      return new Response(JSON.stringify({ error: "work_session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const kora = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const wannServiceKey = Deno.env.get("WANN_OS_SERVICE_ROLE_KEY");
    if (!wannServiceKey) {
      return new Response(
        JSON.stringify({ error: "WANN_OS_SERVICE_ROLE_KEY secret이 설정되지 않았습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const wann = createClient(WANN_OS_URL, wannServiceKey);

    const { data: session, error: sessionError } = await kora
      .from("work_sessions")
      .select("id, name, order_id, scheduled_date, scheduled_start_time, scheduled_end_time")
      .eq("id", work_session_id)
      .single();
    if (sessionError) throw sessionError;

    const { data: coreRowsRaw, error: coreRowsError } = await kora
      .from("work_session_formula_versions")
      .select(
        "id, slot, planner_task_id, formula_versions(formulas(name, components(name)))",
      )
      .eq("work_session_id", work_session_id)
      .eq("kind", "CORE");
    if (coreRowsError) throw coreRowsError;
    const coreRows = (coreRowsRaw ?? []) as unknown as CoreRow[];

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

    const existingTaskIds = coreRows.map((r) => r.planner_task_id).filter((id): id is string => !!id);

    // 동기화 조건이 깨졌으면(일정 없음 / 오더 미연결 / 오더에 WANN 프로젝트가 아직 없음) 기존에
    // 만들어둔 TASK가 있다면 전부 정리하고 끝낸다.
    if (!session.scheduled_date || !session.order_id || !projectId) {
      if (existingTaskIds.length > 0) {
        await wann.from("planner_tasks").delete().in("id", existingTaskIds);
        await kora
          .from("work_session_formula_versions")
          .update({ planner_task_id: null })
          .in(
            "id",
            coreRows.filter((r) => r.planner_task_id).map((r) => r.id),
          );
      }
      return new Response(
        JSON.stringify({
          synced: false,
          reason: !session.order_id
            ? "work session not linked to an order"
            : !projectId
              ? "order has no wann project yet"
              : "no scheduled_date",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const syncedTaskIds: string[] = [];
    for (const row of coreRows) {
      const formula = row.formula_versions?.formulas ?? null;
      const label = formula?.components?.name ?? formula?.name ?? "—";
      const slotLabel = (row.slot && CORE_SLOT_LABELS[row.slot]) || row.slot || "CORE";
      const title = `${slotLabel} — ${label}`;

      const payload = {
        user_id: WANN_USER_ID,
        title,
        due_date: session.scheduled_date,
        due_time: session.scheduled_start_time,
        end_time: session.scheduled_end_time,
        category_id: WANN_SHCO_CATEGORY_ID,
        subtag_id: WANN_PRODUCTION_SUBTAG_ID,
        category_ids: [WANN_SHCO_CATEGORY_ID],
        recurrence: "none",
        kora_work_session_id: work_session_id,
        multiple_task_id: projectId,
      };

      if (row.planner_task_id) {
        const { data: updated, error: updateError } = await wann
          .from("planner_tasks")
          .update(payload)
          .eq("id", row.planner_task_id)
          .select("id");
        if (updateError) throw updateError;
        if (updated && updated.length > 0) {
          syncedTaskIds.push(row.planner_task_id);
          continue;
        }
        // 대상 TASK가 WANN 쪽에서 이미 지워졌으면(사용자가 직접 삭제) 새로 만든다.
      }

      const { data: inserted, error: insertError } = await wann
        .from("planner_tasks")
        .insert(payload)
        .select("id")
        .single();
      if (insertError) throw insertError;
      syncedTaskIds.push(inserted.id);
      const { error: linkError } = await kora
        .from("work_session_formula_versions")
        .update({ planner_task_id: inserted.id })
        .eq("id", row.id);
      if (linkError) throw linkError;
    }

    // 더 이상 어떤 CORE 행도 가리키지 않는 과거 TASK(슬롯 삭제 등) 정리.
    const staleTaskIds = existingTaskIds.filter((id) => !syncedTaskIds.includes(id));
    if (staleTaskIds.length > 0) {
      await wann.from("planner_tasks").delete().in("id", staleTaskIds);
    }

    return new Response(
      JSON.stringify({ synced: true, project_id: projectId, task_ids: syncedTaskIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
