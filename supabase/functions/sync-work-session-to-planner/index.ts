// 2026-10-13 사용자 요청: PRODUCTION Work Session에 "작업일정(날짜/시작-종료시간)"을 입력하면
// WANN Weekly OS(Planner, 별도 Supabase 프로젝트 "WANN OS")에 그 세션을 TASK 하나로 자동
// 연동하고, 이미 추가된 FORMULA별 TASK(work_session_tasks, 시작시간이 입력된 것들)를 그 TASK의
// "상세 항목"(subitems)으로 동기화한다. 작업일정을 지우면 Planner 쪽 TASK/상세항목도 함께 지운다.
//
// 이 함수는 KORA Business 프로젝트(이 함수가 배포되는 곳)에서 실행되며, 두 개의 완전히 분리된
// Supabase 프로젝트를 다룬다 — KORA Business(이 함수 자신의 SERVICE_ROLE_KEY, 환경변수로 자동 제공)
// 와 WANN OS(별도 프로젝트 — service role key를 WANN_OS_SERVICE_ROLE_KEY 시크릿으로 저장해서 씀,
// RLS를 우회해 해당 프로젝트 DB에 직접 쓰기 위함). 두 프로젝트는 서로 다른 Auth 인스턴스라 사용자
// JWT를 그대로 넘길 수 없고, 매핑도 안 되어 있어 — WANN OS 쪽 고정 user_id/category_id/subtag_id를
// 하드코딩해서 쓴다(이 앱은 1인 사용자 — 연 전용).
import { createClient } from "jsr:@supabase/supabase-js@2";

const WANN_OS_URL = "https://txrxzsrjqwhvjosutotp.supabase.co";
// Planner(WANN OS)의 고정 식별자 — 2026-10-13 조회로 확인한 값.
const WANN_USER_ID = "1f1dd73b-cfa9-47d3-855b-f1d58283885f";
const WANN_SHCO_CATEGORY_ID = "c8068046-5bb0-4043-acbb-60f862fcad52";
const WANN_PRODUCTION_SUBTAG_ID = "ce89b071-61c5-4378-8403-99b93990598f";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toSydneyTimeString(iso: string): string {
  // DB의 actual_started_at(timestamptz)을 Planner subitem의 "time"(지역 벽시계 시각)으로 변환.
  // 사용자가 Canberra(Australia/Sydney) 기준으로 입력한 값이므로 그 타임존으로 다시 풀어낸다.
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

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
      .select("id, name, scheduled_date, scheduled_start_time, scheduled_end_time")
      .eq("id", work_session_id)
      .single();
    if (sessionError) throw sessionError;

    // 기존에 연동된 Planner TASK가 있는지 먼저 확인(있으면 UPDATE/삭제 대상).
    const { data: existingTask } = await wann
      .from("planner_tasks")
      .select("id")
      .eq("kora_work_session_id", work_session_id)
      .maybeSingle();

    if (!session.scheduled_date) {
      // 작업일정을 지운 경우 — Planner 쪽 TASK/상세항목도 함께 삭제해서 동기화 상태를 유지한다.
      if (existingTask) {
        await wann.from("planner_task_subitems").delete().eq("task_id", existingTask.id);
        await wann.from("planner_tasks").delete().eq("id", existingTask.id);
      }
      return new Response(JSON.stringify({ synced: false, reason: "no scheduled_date" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taskPayload = {
      user_id: WANN_USER_ID,
      title: session.name,
      due_date: session.scheduled_date,
      due_time: session.scheduled_start_time,
      end_time: session.scheduled_end_time,
      category_id: WANN_SHCO_CATEGORY_ID,
      subtag_id: WANN_PRODUCTION_SUBTAG_ID,
      category_ids: [WANN_SHCO_CATEGORY_ID],
      recurrence: "none",
      kora_work_session_id: work_session_id,
    };

    let plannerTaskId: string;
    if (existingTask) {
      const { error: updateError } = await wann
        .from("planner_tasks")
        .update(taskPayload)
        .eq("id", existingTask.id);
      if (updateError) throw updateError;
      plannerTaskId = existingTask.id;
    } else {
      const { data: inserted, error: insertError } = await wann
        .from("planner_tasks")
        .insert(taskPayload)
        .select("id")
        .single();
      if (insertError) throw insertError;
      plannerTaskId = inserted.id;
    }

    // FORMULA별 TASK(시작시간이 입력된 것들)를 상세 항목으로 — 항상 전체 재구성(delete-then-insert)
    // 해서, 이후 WorkflowView에서 타임라인을 드래그/수정해도 다시 호출만 하면 그대로 다시 맞춰진다.
    const { data: tasks, error: tasksError } = await kora
      .from("work_session_tasks")
      .select(
        "id, task_name, actual_started_at, sort_order, formula_version_id, formula_versions(formulas(name, components(name)))",
      )
      .eq("work_session_id", work_session_id)
      .not("actual_started_at", "is", null)
      .order("actual_started_at", { ascending: true });
    if (tasksError) throw tasksError;

    await wann.from("planner_task_subitems").delete().eq("task_id", plannerTaskId);

    type TaskRow = {
      id: string;
      task_name: string;
      actual_started_at: string;
      sort_order: number;
      formula_versions: { formulas: { name: string; components: { name: string } | null } | null } | null;
    };
    const rows = (tasks ?? []) as unknown as TaskRow[];
    if (rows.length > 0) {
      const subitems = rows.map((t, idx) => {
        const formula = t.formula_versions?.formulas ?? null;
        const label = formula?.components?.name ?? formula?.name ?? null;
        const content = label ? `${label} · ${t.task_name}` : t.task_name;
        return {
          task_id: plannerTaskId,
          time: toSydneyTimeString(t.actual_started_at),
          content,
          sort_order: idx,
        };
      });
      const { error: subitemsError } = await wann.from("planner_task_subitems").insert(subitems);
      if (subitemsError) throw subitemsError;
    }

    return new Response(
      JSON.stringify({ synced: true, planner_task_id: plannerTaskId, subitem_count: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
