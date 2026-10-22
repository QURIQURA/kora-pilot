// WORK SESSION의 CORE ELEMENT(SHEET/CREAM/FILLING)를 WANN 프로젝트 하위 TASK로 동기화한다.
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
// 2026-10-22 추가 개편 (연 요청):
// - TASK 제목에서 슬롯 라벨("Pastry Base —", "Cream & Aerated Components —")을 뺐다.
//   제목 = 품목 이름 + 배치용량 × 배수. 예: "EARLGREY CHIFFON 770g ×2", "Yogurt Cream cheese mousse ×1".
// - 오더에 연결되지 않은 세션(production timeline에서 직접 추가)의 TASK는 지우지 않고, 그 TASK 날짜의
//   "Daily Project — YYYY-MM-DD (요일)" 프로젝트(planner_multiple_tasks)를 찾거나 만들어 그 하위에 넣는다.
//   나중에 세션이 오더에 연결되면 다음 동기화 때 multiple_task_id가 오더 프로젝트로 옮겨간다.
//
// 2026-10-22 추가:
// - WORKFLOW TEMPLATE 단계에서 만든 블록(work_blocks.step_name)은 제목에 " — 단계명"이 붙는다(단계가 둘 이상일 때).
// - 블록에 연결된 작업 기록(work_session_tasks)의 관찰값(상태/높이/온도)을 플래너 TASK의 상세항목
//   (planner_task_subitems)에 "관찰 — …" 한 줄로 넣는다. 값이 모두 비면 그 줄을 지운다.
//
// (데일리 태스크에 order_id가 있으면 그 오더의 WANN 프로젝트 하위로 들어간다 — 나중에 오더에 연결한 경우.)
// 2026-10-22 DAILY TASK: 요청 본문에 daily_task_id / remove_daily_task_id를 받아, 컴포넌트와 무관한 작업(daily_tasks)을
//   그 날짜의 "Daily Project — …" 하위 TASK로 동기화/삭제한다(제목=작업 이름, notes=메모).
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
const DAILY_PROJECT_PREFIX = "Daily Project";
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CoreRow = {
  id: string;
  slot: string | null;
  planner_task_id: string | null;
  multiplier: number | string | null;
  capacity_qty: number | string | null;
  base_weight_qty: number | string | null;
  capacities: { name: string; weight_g: number | null } | null;
  base_weight_presets: { name: string; weight_g: number | null } | null;
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
  step_name: string | null;
  work_session_task_id: string | null;
  planner_task_id: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 숫자를 소수 둘째 자리까지, 끝의 0은 떼고 표기. */
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** 품목 이름 + 배치용량 × 배수. 용량(틀/목표중량)이 없으면 배수만 붙인다. */
const taskTitle = (row: CoreRow): string => {
  const formula = row.formula_versions?.formulas ?? null;
  const name = formula?.components?.name ?? formula?.name ?? "—";
  const capGrams = row.capacities?.weight_g ?? null;
  const bwGrams = row.base_weight_presets?.weight_g ?? null;
  if (capGrams != null) {
    const qty = Number(row.capacity_qty ?? row.multiplier ?? 1);
    return `${name} ${fmt(capGrams)}g ×${fmt(qty)}`;
  }
  if (bwGrams != null) {
    const qty = Number(row.base_weight_qty ?? row.multiplier ?? 1);
    return `${name} ${fmt(bwGrams)}g ×${fmt(qty)}`;
  }
  return `${name} ×${fmt(Number(row.multiplier ?? 1))}`;
};

/** 캔버라(Australia/Sydney) 기준 오늘 날짜 YYYY-MM-DD. */
const canberraToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());

type ObservationTask = {
  id: string;
  observation_status: string | null;
  observation_height_start_mm: number | null;
  observation_height_mid_mm: number | null;
  observation_height_end_mm: number | null;
  observation_temperature_c: number | null;
  task_type: string | null;
  actual_started_at: string | null;
  completed_at: string | null;
};

/** 캔버라 시각 HH:mm. */
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** 관찰값을 한 줄로. 값이 하나도 없으면 null. */
const observationLine = (t: ObservationTask | undefined): string | null => {
  if (!t) return null;
  const parts: string[] = [];
  if (t.observation_status) parts.push(t.observation_status);
  const heights = [
    t.observation_height_start_mm,
    t.observation_height_mid_mm,
    t.observation_height_end_mm,
  ];
  if (heights.some((h) => h != null)) {
    parts.push(`높이 ${heights.map((h) => (h == null ? "-" : fmt(Number(h)))).join("→")}mm`);
  }
  if (t.observation_temperature_c != null)
    parts.push(`${fmt(Number(t.observation_temperature_c))}°C`);
  // 베이크 TASK는 실제 구운 시간(시작→종료, 소요 분)도 함께 — 2026-10-22 "bake time도 함께".
  if (t.task_type?.trim().toLowerCase() === "bake" && t.actual_started_at) {
    const range = t.completed_at
      ? `${hhmm(t.actual_started_at)}→${hhmm(t.completed_at)} (${Math.round(
          (new Date(t.completed_at).getTime() - new Date(t.actual_started_at).getTime()) / 60000,
        )}분)`
      : `${hhmm(t.actual_started_at)}→ (진행 중)`;
    parts.push(`굽기 ${range}`);
  }
  return parts.length > 0 ? `관찰 — ${parts.join(" · ")}` : null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    let sessionId: string | null = body.work_session_id ?? null;
    const removeBlockId: string | null = body.remove_block_id ?? null;
    const deleteIds: string[] = Array.isArray(body.delete_planner_task_ids)
      ? body.delete_planner_task_ids.filter((s: unknown) => typeof s === "string")
      : [];
    if (!sessionId && !removeBlockId && !body.daily_task_id && !body.remove_daily_task_id)
      return json({ error: "work_session_id required" }, 400);

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

    /** 그 날짜의 Daily Project를 찾거나 만든다. 같은 호출 안에서는 캐시. */
    const dailyProjectCache = new Map<string, string>();
    const dailyProjectFor = async (date: string): Promise<string> => {
      const cached = dailyProjectCache.get(date);
      if (cached) return cached;
      const { data: existing, error: findError } = await wann
        .from("planner_multiple_tasks")
        .select("id")
        .eq("user_id", WANN_USER_ID)
        .eq("category_id", WANN_SHCO_CATEGORY_ID)
        .eq("date", date)
        .like("name", `${DAILY_PROJECT_PREFIX}%`)
        .order("created_at", { ascending: true })
        .limit(1);
      if (findError) throw findError;
      let id = existing?.[0]?.id as string | undefined;
      if (!id) {
        const weekday = WEEKDAYS_KO[new Date(`${date}T00:00:00Z`).getUTCDay()];
        const { data: created, error: createError } = await wann
          .from("planner_multiple_tasks")
          .insert({
            user_id: WANN_USER_ID,
            category_id: WANN_SHCO_CATEGORY_ID,
            name: `${DAILY_PROJECT_PREFIX} — ${date} (${weekday})`,
            date,
            end_date: date,
          })
          .select("id")
          .single();
        if (createError) throw createError;
        id = created.id as string;
      }
      dailyProjectCache.set(date, id);
      return id;
    };

    const common = {
      user_id: WANN_USER_ID,
      category_id: WANN_SHCO_CATEGORY_ID,
      subtag_id: WANN_PRODUCTION_SUBTAG_ID,
      category_ids: [WANN_SHCO_CATEGORY_ID],
      recurrence: "none",
      // 유니크 인덱스(세션당 1개) 때문에 새 TASK에는 채우지 않는다. 기존 TASK를 UPDATE할 때는 null로 풀어준다.
      kora_work_session_id: null,
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

    // DAILY TASK(컴포넌트와 무관한 작업) — 2026-10-22.
    // daily_task_id: daily_tasks 한 줄을 그 날짜의 Daily Project 하위 TASK로 만들거나 갱신(날짜가 바뀌면 프로젝트도 이동).
    // remove_daily_task_id: 대기공간으로 되돌리거나 삭제할 때 TASK와 행을 함께 지운다.
    const removeDailyTaskId: string | null = body.remove_daily_task_id ?? null;
    const dailyTaskId: string | null = body.daily_task_id ?? null;
    if (removeDailyTaskId) {
      const { data: dt, error: dtError } = await kora
        .from("daily_tasks")
        .select("id, planner_task_id")
        .eq("id", removeDailyTaskId)
        .maybeSingle();
      if (dtError) throw dtError;
      if (dt) {
        if (dt.planner_task_id) await deleteWannTasks([dt.planner_task_id]);
        const { error: delError } = await kora.from("daily_tasks").delete().eq("id", dt.id);
        if (delError) throw delError;
      }
      return json({ synced: true, removed_daily_task: removeDailyTaskId });
    }
    if (dailyTaskId) {
      const { data: dt, error: dtError } = await kora
        .from("daily_tasks")
        .select("id, task_date, start_time, end_time, name, note, planner_task_id, order_id")
        .eq("id", dailyTaskId)
        .single();
      if (dtError) throw dtError;
      // 오더에 연결된 데일리 태스크는 그 오더의 WANN 프로젝트 하위로, 연결이 없거나 프로젝트가 아직 없으면 그날의 Daily Project로.
      let linkedProjectId: string | null = null;
      if (dt.order_id) {
        const { data: linkedOrder, error: linkedError } = await kora
          .from("orders")
          .select("wann_project_id")
          .eq("id", dt.order_id)
          .maybeSingle();
        if (linkedError) throw linkedError;
        linkedProjectId = linkedOrder?.wann_project_id ?? null;
      }
      const taskId = await upsertTask(dt.planner_task_id, {
        ...common,
        multiple_task_id: linkedProjectId ?? (await dailyProjectFor(dt.task_date)),
        title: dt.name,
        notes: dt.note ?? null,
        due_date: dt.task_date,
        due_time: dt.start_time,
        end_time: dt.end_time,
      });
      if (taskId !== dt.planner_task_id) {
        const { error: linkError } = await kora
          .from("daily_tasks")
          .update({ planner_task_id: taskId })
          .eq("id", dt.id);
        if (linkError) throw linkError;
      }
      return json({
        synced: true,
        task_ids: [taskId],
        daily_project_ids: [...dailyProjectCache.values()],
      });
    }

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
      .select(
        "id, slot, planner_task_id, multiplier, capacity_qty, base_weight_qty, " +
          "capacities(name, weight_g), base_weight_presets(name, weight_g), " +
          "formula_versions(formulas(name, components(name)))",
      )
      .eq("work_session_id", sessionId)
      .eq("kind", "CORE");
    if (coreRowsError) throw coreRowsError;
    const coreRows = (coreRowsRaw ?? []) as unknown as CoreRow[];

    let blocks: Block[] = [];
    if (coreRows.length > 0) {
      const { data: blocksRaw, error: blocksError } = await kora
        .from("work_blocks")
        .select(
          "id, work_session_formula_version_id, block_date, start_time, end_time, part_no, step_name, work_session_task_id, planner_task_id",
        )
        .in(
          "work_session_formula_version_id",
          coreRows.map((r) => r.id),
        );
      if (blocksError) throw blocksError;
      blocks = (blocksRaw ?? []) as Block[];
    }

    const obsByTaskId = new Map<string, ObservationTask>();
    const taskIdsForObs = blocks
      .map((b) => b.work_session_task_id)
      .filter((id): id is string => !!id);
    if (taskIdsForObs.length > 0) {
      const { data: obsRows, error: obsError } = await kora
        .from("work_session_tasks")
        .select(
          "id, observation_status, observation_height_start_mm, observation_height_mid_mm, observation_height_end_mm, observation_temperature_c, task_type, actual_started_at, completed_at",
        )
        .in("id", taskIdsForObs);
      if (obsError) throw obsError;
      for (const t of (obsRows ?? []) as ObservationTask[]) obsByTaskId.set(t.id, t);
    }

    let orderProjectId: string | null = null;
    if (session.order_id) {
      const { data: order, error: orderError } = await kora
        .from("orders")
        .select("wann_project_id")
        .eq("id", session.order_id)
        .single();
      if (orderError) throw orderError;
      orderProjectId = order.wann_project_id;
    }

    // 오더는 연결됐는데 WANN 프로젝트가 아직 없음 → 만들어둔 TASK 전부 정리하고 끝낸다.
    // (오더 미연결은 아래에서 Daily Project로 보낸다.)
    if (session.order_id && !orderProjectId) {
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
      return json({ synced: false, reason: "order has no wann project yet" });
    }

    /** 오더 프로젝트가 있으면 그것, 없으면(오더 미연결) 그 날짜의 Daily Project. */
    const projectFor = async (date: string | null): Promise<string> =>
      orderProjectId ?? (await dailyProjectFor(date ?? canberraToday()));

    /** 플래너 TASK의 상세항목에 "관찰 — …" 한 줄을 맞춘다(없으면 추가, 있으면 수정, 값이 비면 삭제). */
    const syncObservationSubitem = async (plannerTaskId: string, line: string | null) => {
      const { data: existing, error: findError } = await wann
        .from("planner_task_subitems")
        .select("id, content")
        .eq("task_id", plannerTaskId)
        .like("content", "관찰 —%");
      if (findError) throw findError;
      const current = existing?.[0];
      if (!line) {
        if (existing && existing.length > 0) {
          await wann
            .from("planner_task_subitems")
            .delete()
            .in(
              "id",
              existing.map((e) => e.id),
            );
        }
        return;
      }
      if (current) {
        if (current.content !== line) {
          const { error: upError } = await wann
            .from("planner_task_subitems")
            .update({ content: line, updated_at: new Date().toISOString() })
            .eq("id", current.id);
          if (upError) throw upError;
        }
        return;
      }
      const { data: maxRows } = await wann
        .from("planner_task_subitems")
        .select("sort_order")
        .eq("task_id", plannerTaskId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const { error: insError } = await wann.from("planner_task_subitems").insert({
        task_id: plannerTaskId,
        content: line,
        sort_order: (maxRows?.[0]?.sort_order ?? -1) + 1,
      });
      if (insError) throw insError;
    };

    const syncedTaskIds: string[] = [];
    for (const row of coreRows) {
      const baseTitle = taskTitle(row);

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
            multiple_task_id: await projectFor(block.block_date),
            title:
              rowBlocks.length > 1
                ? block.step_name
                  ? `${baseTitle} — ${block.step_name}`
                  : `${baseTitle} (${block.part_no}차)`
                : baseTitle,
            due_date: block.block_date,
            due_time: block.start_time,
            end_time: block.end_time,
          });
          syncedTaskIds.push(taskId);
          await syncObservationSubitem(
            taskId,
            observationLine(
              block.work_session_task_id ? obsByTaskId.get(block.work_session_task_id) : undefined,
            ),
          );
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
          multiple_task_id: await projectFor(session.scheduled_date),
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

    return json({
      synced: true,
      project_id: orderProjectId,
      daily_project_ids: [...dailyProjectCache.values()],
      task_ids: syncedTaskIds,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
