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
// 이 앱은 1인 사용자 — 로그인한 소유자만 이 함수를 쓸 수 있다(서비스 키로 WANN을 수정하므로 반드시 필요).
const KORA_OWNER_ID = "53e168e4-72aa-418e-812a-6caaf315a205";
const DAILY_PROJECT_PREFIX = "Daily Project";
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CoreRow = {
  id: string;
  formula_version_id: string;
  base_grams?: number | null;
  slot: string | null;
  planner_task_id: string | null;
  multiplier: number | string | null;
  capacity_qty: number | string | null;
  mould_id?: string | null;
  base_weight_qty: number | string | null;
  capacities: { name: string; weight_g: number | null } | null;
  moulds: (MouldDims & { reference_weight_g?: number | null }) | null;
  formula_version_base_mould?: { reference_weight_g: number | null } | null;
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

/**
 * 사이즈 약어 체계: 모양-사이즈-높이 — Ø8″-H5 (원형) / ■6″-H5 (정사각) / ▬30×20-H4 (직사각, cm).
 * src/lib/size-label.ts와 같은 규칙의 복제본 — 바꾸면 함께 바꾼다.
 */
type MouldDims = {
  name: string;
  diameter_mm: number | null;
  width_mm: number | null;
  length_mm: number | null;
  height_mm: number | null;
};
const pos = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const cmStr = (mm: number) => String(Math.round((mm / 10) * 10) / 10);
const mmToInch = (mm: number): number | null => {
  const inch = mm / 25.4;
  const half = Math.round(inch * 2) / 2;
  return Math.abs(inch - half) <= 0.15 ? half : null;
};
const sizeAbbr = (m: MouldDims): string => {
  const n = m.name.toLowerCase();
  const w = pos(m.width_mm);
  const l = pos(m.length_mm);
  const d = pos(m.diameter_mm);
  const shape: "ROUND" | "SQUARE" | "RECTANGLE" | null = /round|원형|라운드/.test(n)
    ? "ROUND"
    : /square|정사각|스퀘어/.test(n)
      ? "SQUARE"
      : /rect|직사각/.test(n)
        ? "RECTANGLE"
        : d
          ? "ROUND"
          : w && l
            ? w === l
              ? "SQUARE"
              : "RECTANGLE"
            : null;
  const h = pos(m.height_mm);
  const height = h ? `-H${cmStr(h)}` : "";
  if (shape === "RECTANGLE") return `▬${l ? cmStr(l) : "?"}×${w ? cmStr(w) : "?"}${height}`;
  if (shape) {
    const side = shape === "ROUND" ? d : (w ?? l);
    const nameInch =
      m.name.match(/(\d+(?:\.\d+)?)\s*(?:"|''|″|”|inch|in\b|인치)/i) ??
      m.name.match(/(\d+(?:\.\d+)?)\s*$/);
    const inch = (side ? mmToInch(side) : null) ?? (nameInch ? Number(nameInch[1]) : null);
    const size = inch != null ? `${inch}″` : side ? `${cmStr(side)}cm` : "?";
    return `${shape === "ROUND" ? "Ø" : "■"}${size}${height}`;
  }
  return m.name.trim();
};

/**
 * 품목 이름 + 사이즈 × 수량.
 * - SHEET: 몰드 기준 — "EARLGREY CHIFFON 8inch round ×2" (몰드가 없으면 배수만)
 * - 그 외(CREAM/FILLING…): 기준중량(base weight) 기준 — "Yogurt Cream 1200g ×1"
 *   기준중량은 프리셋이 있으면 그 값, 없으면 레시피 BASE(×1) 재료 합계(g).
 */
const taskTitle = (row: CoreRow): string => {
  const formula = row.formula_versions?.formulas ?? null;
  const name = formula?.components?.name ?? formula?.name ?? "—";
  if (row.slot === "SHEET") {
    const mould =
      row.moulds ??
      (row.capacities
        ? {
            name: row.capacities.name,
            diameter_mm: null,
            width_mm: null,
            length_mm: null,
            height_mm: null,
          }
        : null);
    if (mould) {
      // 몰드 기준: 개수 = 배수 × (레시피 기본 몰드 기준중량 ÷ 목표 몰드 기준중량) → "8인치 ×1" (6인치 ×2 아님)
      const target = row.moulds?.reference_weight_g ?? null;
      const baseRef = row.formula_version_base_mould?.reference_weight_g ?? null;
      const byRef =
        target && baseRef && target > 0 && baseRef > 0
          ? Math.round(((Number(row.multiplier ?? 1) * baseRef) / target) * 100) / 100
          : null;
      const qty = byRef ?? Number(row.capacity_qty ?? row.multiplier ?? 1);
      return `${name} ${sizeAbbr(mould)} ×${fmt(qty)}`;
    }
    return `${name} ×${fmt(Number(row.multiplier ?? 1))}`;
  }
  const bwGrams = row.base_weight_presets?.weight_g ?? row.base_grams ?? null;
  if (bwGrams != null && bwGrams > 0) {
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
  status?: string | null;
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
    // 2026-11-06: 인증 — 로그인한 소유자의 토큰이 아니면 거절한다(anon 키만으로는 호출 불가).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authError } = token
      ? await authClient.auth.getUser(token)
      : { data: { user: null }, error: new Error("no token") };
    if (authError || authData.user?.id !== KORA_OWNER_ID)
      return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    let sessionId: string | null = body.work_session_id ?? null;
    const removeBlockId: string | null = body.remove_block_id ?? null;
    const deleteIds: string[] = Array.isArray(body.delete_planner_task_ids)
      ? body.delete_planner_task_ids.filter((s: unknown) => typeof s === "string")
      : [];
    const completeOrderId: string | null =
      body.complete_order_delivery_id ?? body.order_delivery?.order_id ?? null;
    const pullDeliveries = Boolean(body.pull_planner_deliveries);
    if (
      !sessionId &&
      !removeBlockId &&
      !body.daily_task_id &&
      !body.remove_daily_task_id &&
      !completeOrderId &&
      !pullDeliveries &&
      !body.mindmap
    )
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

    // 2026-11-13 마인드맵 노드 ↔ 플래너 TASK. body.mindmap = { op, ... }
    // - get{ids}: TASK 상태 조회(원천은 플래너) / search{q}: 기존 TASK 검색(연결용)
    // - create{board_id,node_id,title,due_date?,notes?}: "Mindmap — 보드명" 프로젝트 하위에 TASK 생성.
    //   같은 보드·노드·제목(link_url+title)이 이미 있으면 새로 만들지 않고 duplicate:true 로 기존 것을 돌려준다.
    // - complete{id,completed}: 완료 체크. 모든 조회·수정은 WANN 소유자(WANN_USER_ID)의 TASK로 한정한다.
    if (body.mindmap) {
      const m = body.mindmap as Record<string, unknown>;
      const toRef = async (rows: Record<string, unknown>[]) => {
        const pids = [...new Set(rows.map((r) => r.multiple_task_id).filter(Boolean))] as string[];
        const names = new Map<string, string>();
        if (pids.length > 0) {
          const { data: ps } = await wann
            .from("planner_multiple_tasks")
            .select("id, name")
            .in("id", pids);
          for (const p of ps ?? []) names.set(p.id as string, p.name as string);
        }
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          completed: Boolean(r.completed),
          due_date: (r.due_date as string | null) ?? null,
          project_id: (r.multiple_task_id as string | null) ?? null,
          project_name: r.multiple_task_id
            ? (names.get(r.multiple_task_id as string) ?? null)
            : null,
        }));
      };
      const cols = "id, title, completed, due_date, multiple_task_id";
      if (m.op === "get") {
        const ids = Array.isArray(m.ids)
          ? m.ids.filter((x) => typeof x === "string").slice(0, 200)
          : [];
        const { data, error } = await wann
          .from("planner_tasks")
          .select(cols)
          .eq("user_id", WANN_USER_ID)
          .in("id", ids);
        if (error) return json({ error: error.message }, 500);
        return json({ tasks: await toRef(data ?? []) });
      }
      if (m.op === "search") {
        const q = String(m.q ?? "")
          .trim()
          .replace(/[%,()]/g, " ");
        let query = wann
          .from("planner_tasks")
          .select(cols)
          .eq("user_id", WANN_USER_ID)
          .order("completed", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(15);
        if (q) query = query.ilike("title", `%${q}%`);
        const { data, error } = await query;
        if (error) return json({ error: error.message }, 500);
        return json({ tasks: await toRef(data ?? []) });
      }
      if (m.op === "complete") {
        const completed = Boolean(m.completed);
        const { error } = await wann
          .from("planner_tasks")
          .update({ completed, completed_at: completed ? new Date().toISOString() : null })
          .eq("id", String(m.id ?? ""))
          .eq("user_id", WANN_USER_ID);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      if (m.op === "create") {
        const boardId = String(m.board_id ?? "");
        const nodeId = String(m.node_id ?? "");
        const title = String(m.title ?? "").trim();
        if (!boardId || !nodeId || !title)
          return json({ error: "board_id, node_id, title 필요" }, 400);
        const linkUrl = `pilot-mindmap://${boardId}/${nodeId}`;
        const { data: dup } = await wann
          .from("planner_tasks")
          .select(cols)
          .eq("user_id", WANN_USER_ID)
          .eq("link_url", linkUrl)
          .ilike("title", title.replace(/[%_]/g, "\\$&"))
          .limit(1);
        if (dup && dup.length > 0) return json({ task: (await toRef(dup))[0], duplicate: true });
        const { data: board } = await kora
          .from("design_moodboards")
          .select("title")
          .eq("id", boardId)
          .maybeSingle();
        const prefix = m.prefix === "Value Matrix" ? "Value Matrix" : "Mindmap";
        const projName = `${prefix} — ${board?.title ?? "보드"}`;
        let projectId: string | null = null;
        const { data: pj } = await wann
          .from("planner_multiple_tasks")
          .select("id")
          .eq("user_id", WANN_USER_ID)
          .eq("name", projName)
          .limit(1);
        projectId = (pj?.[0]?.id as string | undefined) ?? null;
        if (!projectId) {
          const { data: created, error: pErr } = await wann
            .from("planner_multiple_tasks")
            .insert({ user_id: WANN_USER_ID, name: projName, category_id: WANN_SHCO_CATEGORY_ID })
            .select("id")
            .single();
          if (pErr) return json({ error: pErr.message }, 500);
          projectId = created.id as string;
        }
        const { data: ins, error: iErr } = await wann
          .from("planner_tasks")
          .insert({
            user_id: WANN_USER_ID,
            title,
            notes: typeof m.notes === "string" && m.notes ? m.notes : null,
            due_date: typeof m.due_date === "string" && m.due_date ? m.due_date : null,
            category_id: WANN_SHCO_CATEGORY_ID,
            multiple_task_id: projectId,
            link_url: linkUrl,
            completed: false,
          })
          .select(cols)
          .single();
        if (iErr) return json({ error: iErr.message }, 500);
        return json({ task: (await toRef([ins]))[0], duplicate: false });
      }
      return json({ error: "unknown mindmap op" }, 400);
    }

    // 2026-11-09 오더 완료 ↔ 플래너 Delivery 양방향 동기화.
    // - order_delivery { order_id, completed }: 오더 상태가 COMPLETED로 바뀌면 그 오더 WANN 프로젝트
    //   (orders.wann_project_id) 안 Delivery(is_delivery) TASK를 체크, COMPLETED에서 되돌리면 체크 해제.
    // - pull_planner_deliveries: 플래너에서 Delivery를 체크했는데 아직 COMPLETED가 아닌 오더를 COMPLETED로 넘긴다
    //   (WANN은 별도 프로젝트라 푸시할 수 없어서, KORA 앱이 주기적으로 이 호출을 한다).
    const orderDelivery = body.order_delivery as
      { order_id?: string; completed?: boolean } | undefined;
    const legacyCompleteId: string | null = body.complete_order_delivery_id ?? null;
    if (orderDelivery?.order_id || legacyCompleteId) {
      const orderId = orderDelivery?.order_id ?? legacyCompleteId!;
      const completed = orderDelivery ? Boolean(orderDelivery.completed) : true;
      const { data: ord, error: ordErr } = await kora
        .from("orders")
        .select("wann_project_id")
        .eq("id", orderId)
        .maybeSingle();
      if (ordErr) return json({ error: ordErr.message }, 500);
      if (!ord?.wann_project_id) return json({ ok: true, delivery_changed: 0 });
      const { data: changed, error: changeErr } = await wann
        .from("planner_tasks")
        .update({ completed, completed_at: completed ? new Date().toISOString() : null })
        .eq("multiple_task_id", ord.wann_project_id)
        .eq("is_delivery", true)
        .eq("completed", !completed)
        .select("id");
      if (changeErr) return json({ error: changeErr.message }, 500);
      return json({ ok: true, delivery_changed: changed?.length ?? 0 });
    }
    if (body.pull_planner_deliveries) {
      const { data: open, error: openErr } = await kora
        .from("orders")
        .select("id, wann_project_id")
        .not("wann_project_id", "is", null)
        .not("status", "in", "(COMPLETED,CANCELLED)");
      if (openErr) return json({ error: openErr.message }, 500);
      const projectIds = (open ?? []).map((o) => o.wann_project_id as string);
      if (projectIds.length === 0) return json({ ok: true, completed_orders: 0 });
      const { data: doneDeliveries, error: pullErr } = await wann
        .from("planner_tasks")
        .select("multiple_task_id")
        .in("multiple_task_id", projectIds)
        .eq("is_delivery", true)
        .eq("completed", true);
      if (pullErr) return json({ error: pullErr.message }, 500);
      const doneProjects = new Set((doneDeliveries ?? []).map((t) => t.multiple_task_id as string));
      const orderIds = (open ?? [])
        .filter((o) => doneProjects.has(o.wann_project_id as string))
        .map((o) => o.id as string);
      if (orderIds.length > 0) {
        const { error: upErr } = await kora
          .from("orders")
          .update({ status: "COMPLETED" })
          .in("id", orderIds);
        if (upErr) return json({ error: upErr.message }, 500);
      }
      return json({ ok: true, completed_orders: orderIds.length });
    }

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
        "id, slot, formula_version_id, planner_task_id, multiplier, capacity_qty, mould_id, base_weight_qty, " +
          "capacities(name, weight_g), moulds(name, diameter_mm, width_mm, length_mm, height_mm, reference_weight_g), base_weight_presets(name, weight_g), " +
          "formula_versions(default_mould_id, formulas(name, components(name)))",
      )
      .eq("work_session_id", sessionId)
      .eq("kind", "CORE");
    if (coreRowsError) throw coreRowsError;
    const coreRows = (coreRowsRaw ?? []) as unknown as CoreRow[];
    // 레시피 기본 몰드 기준중량(예: 6인치 340g) — 제목의 몰드 개수 역산용
    const baseMouldIds = [
      ...new Set(
        coreRows
          .map(
            (r) =>
              (r.formula_versions as { default_mould_id?: string | null } | null)?.default_mould_id,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (baseMouldIds.length > 0) {
      const { data: baseMoulds } = await kora
        .from("moulds")
        .select("id, reference_weight_g")
        .in("id", baseMouldIds);
      const refById = new Map((baseMoulds ?? []).map((m) => [m.id, m.reference_weight_g]));
      for (const r of coreRows) {
        const id = (r.formula_versions as { default_mould_id?: string | null } | null)
          ?.default_mould_id;
        r.formula_version_base_mould = id ? { reference_weight_g: refById.get(id) ?? null } : null;
      }
    }

    // 기준중량 프리셋이 없는 비-SHEET 품목의 제목용 — 레시피 BASE(×1) 재료 합계(g).
    const versionIds = [...new Set(coreRows.map((r) => r.formula_version_id))];
    if (versionIds.length > 0) {
      const { data: ingRaw, error: ingError } = await kora
        .from("formula_version_ingredients")
        .select("formula_version_id, amount, unit")
        .in("formula_version_id", versionIds);
      if (ingError) throw ingError;
      const totals = new Map<string, number | null>();
      for (const ing of (ingRaw ?? []) as {
        formula_version_id: string;
        amount: number;
        unit: string;
      }[]) {
        const factor =
          ing.unit === "g" || ing.unit === "ml"
            ? 1
            : ing.unit === "kg" || ing.unit === "l"
              ? 1000
              : null;
        const prev = totals.get(ing.formula_version_id);
        if (prev === null) continue;
        if (factor == null) {
          if (Number(ing.amount) > 0) totals.set(ing.formula_version_id, null);
          continue;
        }
        totals.set(ing.formula_version_id, (prev ?? 0) + Number(ing.amount) * factor);
      }
      for (const r of coreRows) r.base_grams = totals.get(r.formula_version_id) ?? null;
    }

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
          "id, observation_status, observation_height_start_mm, observation_height_mid_mm, observation_height_end_mm, observation_temperature_c, task_type, actual_started_at, completed_at, status",
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
    } else {
      // 2026-11-06: 팝업 품목에 연결된 세션이면 그 팝업의 WANN 프로젝트 아래로 넣는다(CONFIRMED 때 생성된 프로젝트).
      const { data: popup, error: popupError } = await kora
        .from("orders")
        .select("wann_project_id")
        .eq("order_kind", "POPUP")
        .contains("popup_plan", { items: [{ work_session_id: sessionId }] })
        .not("wann_project_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (popupError) throw popupError;
      orderProjectId = popup?.wann_project_id ?? null;
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

    const doneTask = (taskId: string | null): string | null => {
      const t = taskId ? obsByTaskId.get(taskId) : undefined;
      return t && t.status === "DONE" ? (t.completed_at ?? new Date().toISOString()) : null;
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
            // 2026-11-07: KORA 작업이 DONE이면 플래너 TASK도 완료로 — 반대(미완료 → 완료 해제)는 건드리지 않는다
            // (플래너에서 직접 체크한 완료를 덮어쓰지 않기 위해).
            ...(doneTask(block.work_session_task_id)
              ? { completed: true, completed_at: doneTask(block.work_session_task_id) }
              : {}),
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
