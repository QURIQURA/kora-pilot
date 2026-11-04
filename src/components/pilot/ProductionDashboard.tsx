import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DayWorkView,
  WorkSessionWorkspace,
  useProductionMerge,
} from "@/components/pilot/WorkSessionWorkspace";
import {
  CopyWarning,
  DietaryChips,
  orderTitle,
  useOrderDietaryNames,
} from "@/components/pilot/OrderTitle";
import { BlockTaskDetails, BlockTimerInline } from "@/components/pilot/BlockTaskDetails";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  dailyTasksQuery,
  dailyTaskTemplatesQuery,
  dashboardComponentsQuery,
  ordersQuery,
  workBlocksQuery,
  workflowTemplateStepsQuery,
  type DailyTask,
  type DailyTaskTemplate,
  type DashboardComponentRow,
  type WorkBlock,
} from "@/lib/queries";
import { addDays, formatDelivery, koreanWeekdayShort, toLocalDateString } from "@/lib/datetime";
import {
  removeDailyTask,
  syncDailyTaskToPlanner,
  syncWorkSessionToPlanner,
} from "@/lib/work-session";
import { cn } from "@/lib/utils";
import { buttonClass, inputClass } from "./ui";

/**
 * PRODUCTION 메인보드 DASHBOARD (2026-10-22 사용자 요청) —
 * 왼쪽 "작업 대기공간": 진행 중인 오더들의 CORE 컴포넌트(Sheet/Cream/Filling) 중 아직 날짜/시간에
 * 배정 안 된 것. 오른쪽 "데일리 타임라인": 날짜를 골라 컴포넌트를 끌어다 시간에 배정한다.
 * 배정한 조각이 "작업 블록"(work_blocks)이고, 블록 1개 = WANN 플래너 TASK 1개.
 * 같은 컴포넌트를 "분할"하면 1차/2차 … 블록이 따로 생긴다(계량은 총량 하나 유지 — 기존 세션 화면 그대로).
 * 기존 WORK SESSION 기록/화면은 건드리지 않고, 블록은 컴포넌트 행을 참조만 한다.
 */

const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 22 * 60;
const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP_MIN = 15;
const DEFAULT_DURATION_MIN = 60;
const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 }, (_, i) => i + 6);

// 오더별 구분색 — 상태 색상처럼 채도를 낮춘 톤(배경/강조선/글자).
const ORDER_PALETTE = [
  { bg: "#E8E4F3", accent: "#8B7FC7", text: "#3A2F6B" },
  { bg: "#DDEFE9", accent: "#4FA58C", text: "#1F5645" },
  { bg: "#F8E6D8", accent: "#D98A55", text: "#6B3A18" },
  { bg: "#F6DDE6", accent: "#C96F8D", text: "#6B2740" },
  { bg: "#E1E8F5", accent: "#6C8CCB", text: "#25406E" },
  { bg: "#EEE9D2", accent: "#B5A242", text: "#5A4E12" },
];

function toMin(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}
function toTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}
function hm(min: number): string {
  return toTime(min).slice(0, 5);
}
const snap = (m: number) => Math.round(m / SNAP_MIN) * SNAP_MIN;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type DragPayload =
  | { kind: "row"; rowId: string }
  | { kind: "block"; blockId: string; offsetMin: number }
  // DAILY TASK — 라이브러리 항목을 끌어다 놓기(dailyNew) / 타임라인의 데일리 태스크 옮기기(daily)
  | { kind: "dailyNew"; templateId: string }
  | { kind: "daily"; taskId: string; offsetMin: number };

// 데일리 태스크(제품과 무관한 작업) 표시색 — 오더 색과 구분되는 무채색 톤.
const DAILY_COLOR = { bg: "#ECECEC", accent: "#707070", text: "#2E2E2E" };

/** 시간이 겹치는 블록을 나란히(레인) 배치한다 — 겹침 묶음마다 레인 수만큼 폭을 나눈다. */
function layoutLanes(items: { id: string; start: number; end: number }[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) result.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ id: it.id, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}

export function ProductionDashboard() {
  const queryClient = useQueryClient();
  const components = useQuery(dashboardComponentsQuery());
  const blocksQuery = useQuery(workBlocksQuery());
  const stepsQuery = useQuery(workflowTemplateStepsQuery());
  const [date, setDate] = useState(() => toLocalDateString());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSessionNotes, setShowSessionNotes] = useState(false);
  // 타임라인 아래 작업 박스(계량/워크플로 등)가 보여줄 세션 — 블록 선택 또는 대기공간 카드 클릭으로 정해진다.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [poolOver, setPoolOver] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [resize, setResize] = useState<{ id: string; endMin: number } | null>(null);
  const dailyQuery = useQuery(dailyTasksQuery());
  const dailyTemplatesQuery = useQuery(dailyTaskTemplatesQuery());
  const ordersData = useQuery(ordersQuery());
  const dietaryOf = useOrderDietaryNames();
  const [pickedRowIds, setPickedRowIds] = useState<string[]>([]);
  const [selectedDailyId, setSelectedDailyId] = useState<string | null>(null);
  const [dailyName, setDailyName] = useState("");
  const [dailySave, setDailySave] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => components.data ?? [], [components.data]);
  const blocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

  // 컴포넌트의 기본 템플릿 단계들 — 대기공간에서 놓으면 단계마다 블록이 만들어진다.
  const stepsOf = (row: DashboardComponentRow) =>
    row.templateId ? (stepsQuery.data ?? []).filter((s) => s.template_id === row.templateId) : [];

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const blocksByRow = useMemo(() => {
    const map = new Map<string, WorkBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.work_session_formula_version_id) ?? [];
      list.push(b);
      map.set(b.work_session_formula_version_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.part_no - b.part_no);
    return map;
  }, [blocks]);

  // 오더별 구분색 — 오더 번호순으로 고정 배정해서 새로고침해도 색이 안 바뀐다.
  const orderColor = useMemo(() => {
    const ids = [...new Map(rows.map((r) => [r.order.id, r.order.order_number])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id]) => id);
    return (orderId: string) =>
      ORDER_PALETTE[Math.max(ids.indexOf(orderId), 0) % ORDER_PALETTE.length]!;
  }, [rows]);

  const isActive = (r: DashboardComponentRow) =>
    r.order.status !== "COMPLETED" &&
    r.sessionStatus !== "COMPLETED" &&
    r.sessionStatus !== "CANCELLED";

  const poolGroups = useMemo(() => {
    const groups = new Map<
      string,
      { order: DashboardComponentRow["order"]; rows: DashboardComponentRow[] }
    >();
    for (const r of rows) {
      if (!isActive(r)) continue;
      if ((blocksByRow.get(r.id) ?? []).length > 0) continue;
      const g = groups.get(r.order.id) ?? { order: r.order, rows: [] };
      g.rows.push(r);
      groups.set(r.order.id, g);
    }
    return [...groups.values()].sort((a, b) =>
      a.order.order_number.localeCompare(b.order.order_number),
    );
  }, [rows, blocksByRow]);
  const poolCount = poolGroups.reduce((n, g) => n + g.rows.length, 0);

  const dayBlocks = useMemo(
    () =>
      blocks.filter((b) => b.block_date === date && rowById.has(b.work_session_formula_version_id)),
    [blocks, date, rowById],
  );
  const effectiveEnd = (b: WorkBlock) => (resize?.id === b.id ? resize.endMin : toMin(b.end_time));
  const dailyTemplates = useMemo(() => dailyTemplatesQuery.data ?? [], [dailyTemplatesQuery.data]);
  const dayDailies = useMemo(
    () => (dailyQuery.data ?? []).filter((t) => t.task_date === date),
    [dailyQuery.data, date],
  );
  const dailyEnd = (t: DailyTask) => (resize?.id === t.id ? resize.endMin : toMin(t.end_time));
  const dailyLanes = useMemo(
    () =>
      layoutLanes(
        dayDailies.map((t) => ({ id: t.id, start: toMin(t.start_time), end: dailyEnd(t) })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayDailies, resize],
  );
  // 컴포넌트 블록이 선택돼 있으면 그쪽이 우선(둘이 동시에 선택되지 않게).
  const selectedDaily = selectedId
    ? null
    : (dayDailies.find((t) => t.id === selectedDailyId) ?? null);

  const selected = dayBlocks.find((b) => b.id === selectedId) ?? null;
  const selectedRow = selected ? rowById.get(selected.work_session_formula_version_id) : undefined;
  // 타임라인 아래 WORK VIEW 등은 "그날 블록이 속한 세션들"을 기본으로 보여준다(날짜 기준 작업공간).
  // 대기공간 카드를 눌러 고른 세션은, 그날 블록이 없어도 추가로 보여준다.
  const workspaceSessions = useMemo(() => {
    // WORK VIEW / ADJUST QUANTITY는 선택한 날짜에 블록이 있는 컴포넌트만(세션별로 묶어서) 보여준다.
    // 대기공간 카드를 눌러 고른 컴포넌트(아직 배정 전)는 그 카드만 추가로 보여준다.
    const bySession = new Map<string, string[]>();
    const sorted = [...dayBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const add = (rowId: string) => {
      const r = rowById.get(rowId);
      if (!r) return;
      const list = bySession.get(r.work_session_id) ?? [];
      if (!list.includes(rowId)) list.push(rowId);
      bySession.set(r.work_session_id, list);
    };
    for (const b of sorted) add(b.work_session_formula_version_id);
    if (focusRowId && (blocksByRow.get(focusRowId) ?? []).length === 0) add(focusRowId);
    return [...bySession.entries()].map(([sid, rowIds]) => ({ sid, rowIds }));
  }, [dayBlocks, rowById, blocksByRow, focusRowId]);
  // 합쳐진 WORK VIEW용: 타임라인 시간순으로 (세션 상관없이) 컴포넌트 열을 나열
  const dayWorkItems = useMemo(
    () =>
      workspaceSessions
        .flatMap(({ sid, rowIds }) => rowIds.map((rowId) => ({ sessionId: sid, rowId })))
        .sort((a, b) => {
          const first = (id: string) =>
            [...dayBlocks]
              .filter((x) => x.work_session_formula_version_id === id)
              .map((x) => x.start_time)
              .sort()[0] ?? "99:99";
          return first(a.rowId).localeCompare(first(b.rowId));
        }),
    [workspaceSessions, dayBlocks],
  );
  // 같은 레시피 버전 MERGE — 타임라인도 한 블록으로 합쳐 보여준다(같은 반죽을 함께 굽는 것).
  const { mergedVersions, toggleMerge } = useProductionMerge(dayWorkItems.map((i) => i.rowId));
  const stepKey = (b: WorkBlock) => b.step_name ?? `part-${b.part_no}`;
  /** 병합 그룹: 같은 버전 + 같은 단계의 블록들. 대표(가장 이른 블록)만 그리고 나머지는 숨긴다. */
  const mergeGroups = useMemo(() => {
    const byKey = new Map<string, WorkBlock[]>();
    for (const b of dayBlocks) {
      const row = rowById.get(b.work_session_formula_version_id);
      if (!row || !mergedVersions.has(row.formulaVersionId)) continue;
      const key = `${row.formulaVersionId}|${stepKey(b)}`;
      byKey.set(key, [...(byKey.get(key) ?? []), b]);
    }
    const hidden = new Set<string>();
    const primaries = new Map<string, { siblings: WorkBlock[]; orders: string[] }>();
    for (const list of byKey.values()) {
      const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
      if (new Set(sorted.map((b) => b.work_session_formula_version_id)).size < 2) continue;
      const [primary, ...rest] = sorted as [WorkBlock, ...WorkBlock[]];
      rest.forEach((b) => hidden.add(b.id));
      primaries.set(primary.id, {
        siblings: rest,
        orders: [
          ...new Set(
            sorted.map((b) => rowById.get(b.work_session_formula_version_id)?.order.order_number),
          ),
        ].filter((o): o is string => !!o),
      });
    }
    return { hidden, primaries };
  }, [dayBlocks, rowById, mergedVersions]);
  const visibleBlocks = useMemo(
    () => dayBlocks.filter((b) => !mergeGroups.hidden.has(b.id)),
    [dayBlocks, mergeGroups],
  );
  const lanes = useMemo(
    () =>
      layoutLanes(
        visibleBlocks.map((b) => ({ id: b.id, start: toMin(b.start_time), end: effectiveEnd(b) })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleBlocks, resize],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
  };
  const syncAfter = async (sessionId: string) => {
    const err = await syncWorkSessionToPlanner(sessionId);
    setWarning(err ? `플래너 동기화에 실패했어요: ${err}` : null);
  };
  const blockTitle = (b: WorkBlock, row: DashboardComponentRow) => {
    const siblings = blocksByRow.get(row.id) ?? [];
    if (siblings.length <= 1) return row.componentName;
    return b.step_name
      ? `${row.componentName} — ${b.step_name}`
      : `${row.componentName} (${b.part_no}차)`;
  };

  const createBlock = useMutation({
    mutationFn: async (v: {
      row: DashboardComponentRow;
      startMin: number;
      endMin: number;
      day: string;
    }) => {
      const user_id = await currentUserId();
      const steps = stepsOf(v.row);
      type Insert = {
        user_id: string;
        work_session_formula_version_id: string;
        block_date: string;
        start_time: string;
        end_time: string;
        part_no: number;
        step_name?: string | null;
        step_template_task_id?: string | null;
      };
      const inserts: Insert[] = [];
      if (steps.length === 0) {
        const partNo =
          (blocksByRow.get(v.row.id) ?? []).reduce((m, b) => Math.max(m, b.part_no), 0) + 1;
        inserts.push({
          user_id,
          work_session_formula_version_id: v.row.id,
          block_date: v.day,
          start_time: toTime(v.startMin),
          end_time: toTime(v.endMin),
          part_no: partNo,
        });
      } else {
        // 템플릿 단계 = 블록: 놓은 시각부터 단계 순서대로 이어 붙이고, 하루를 넘치면 다음 날 09:00로 넘긴다.
        let day = v.day;
        let cursor = v.startMin;
        steps.forEach((step, idx) => {
          const dur = step.timer_minutes
            ? Math.max(SNAP_MIN, Math.ceil(step.timer_minutes / SNAP_MIN) * SNAP_MIN)
            : DEFAULT_DURATION_MIN;
          if (cursor + dur > DAY_END_MIN) {
            day = addDays(day, 1);
            cursor = 9 * 60;
          }
          inserts.push({
            user_id,
            work_session_formula_version_id: v.row.id,
            block_date: day,
            start_time: toTime(cursor),
            end_time: toTime(cursor + dur),
            part_no: idx + 1,
            step_name: steps.length > 1 ? step.task_name : null,
            step_template_task_id: step.id,
          });
          cursor += dur;
        });
      }
      const { data, error } = await supabase.from("work_blocks").insert(inserts).select("id");
      if (error) throw error;
      await syncAfter(v.row.work_session_id);
      return data?.[0]?.id ?? null;
    },
    onSuccess: async (id) => {
      await refresh();
      if (id) setSelectedId(id);
    },
  });

  const updateBlock = useMutation({
    mutationFn: async (v: {
      block: WorkBlock;
      day?: string;
      startMin?: number;
      endMin?: number;
    }) => {
      const row = rowById.get(v.block.work_session_formula_version_id);
      const { error } = await supabase
        .from("work_blocks")
        .update({
          block_date: v.day ?? v.block.block_date,
          start_time: v.startMin !== undefined ? toTime(v.startMin) : v.block.start_time,
          end_time: v.endMin !== undefined ? toTime(v.endMin) : v.block.end_time,
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.block.id);
      if (error) throw error;
      // 병합된 블록의 대표를 옮기면 같이 굽는 나머지 블록도 같은 시간으로 따라간다.
      const merged = mergeGroups.primaries.get(v.block.id);
      const sessions = new Set<string>(row ? [row.work_session_id] : []);
      if (merged) {
        for (const sib of merged.siblings) {
          const { error: sibError } = await supabase
            .from("work_blocks")
            .update({
              block_date: v.day ?? v.block.block_date,
              start_time: v.startMin !== undefined ? toTime(v.startMin) : v.block.start_time,
              end_time: v.endMin !== undefined ? toTime(v.endMin) : v.block.end_time,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sib.id);
          if (sibError) throw sibError;
          const sibRow = rowById.get(sib.work_session_formula_version_id);
          if (sibRow) sessions.add(sibRow.work_session_id);
        }
      }
      for (const sid of sessions) await syncAfter(sid);
    },
    onSuccess: refresh,
  });

  /** 타이머 실제 시작시각에 맞춰 블록을 이동(길이 유지). 병합 대표면 같이 굽는 블록도 따라간다. */
  const retimeBlock = async (block: WorkBlock, iso: string) => {
    const d = new Date(iso);
    const startMin = d.getHours() * 60 + d.getMinutes();
    const oldStart = toMin(block.start_time);
    if (startMin === oldStart) return;
    const duration = toMin(block.end_time) - oldStart;
    await updateBlock.mutateAsync({ block, startMin, endMin: startMin + duration });
  };

  /** MERGE를 켜는 순간 같은 단계의 블록들을 가장 이른 블록의 시간으로 맞춘다. */
  const toggleMergeAndAlign = async (versionId: string) => {
    const turningOn = !mergedVersions.has(versionId);
    toggleMerge(versionId);
    if (!turningOn) return;
    const byStep = new Map<string, WorkBlock[]>();
    for (const b of dayBlocks) {
      const row = rowById.get(b.work_session_formula_version_id);
      if (!row || row.formulaVersionId !== versionId) continue;
      byStep.set(stepKey(b), [...(byStep.get(stepKey(b)) ?? []), b]);
    }
    const sessions = new Set<string>();
    for (const list of byStep.values()) {
      const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
      const primary = sorted[0];
      if (!primary || new Set(sorted.map((b) => b.work_session_formula_version_id)).size < 2)
        continue;
      for (const sib of sorted.slice(1)) {
        if (sib.start_time === primary.start_time && sib.end_time === primary.end_time) continue;
        const { error } = await supabase
          .from("work_blocks")
          .update({
            start_time: primary.start_time,
            end_time: primary.end_time,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sib.id);
        if (error) {
          setWarning(`블록 시간 맞추기 실패: ${error.message}`);
          return;
        }
        const sibRow = rowById.get(sib.work_session_formula_version_id);
        if (sibRow) sessions.add(sibRow.work_session_id);
      }
    }
    for (const sid of sessions) await syncAfter(sid);
    await refresh();
  };

  const splitBlock = useMutation({
    mutationFn: async (block: WorkBlock) => {
      const row = rowById.get(block.work_session_formula_version_id);
      if (!row) return null;
      const user_id = await currentUserId();
      const duration = toMin(block.end_time) - toMin(block.start_time);
      const startMin = Math.min(toMin(block.end_time), DAY_END_MIN - duration);
      const partNo =
        (blocksByRow.get(row.id) ?? []).reduce((m, b) => Math.max(m, b.part_no), 0) + 1;
      const { data, error } = await supabase
        .from("work_blocks")
        .insert({
          user_id,
          work_session_formula_version_id: row.id,
          block_date: block.block_date,
          start_time: toTime(startMin),
          end_time: toTime(startMin + duration),
          part_no: partNo,
        })
        .select("id")
        .single();
      if (error) throw error;
      await syncAfter(row.work_session_id);
      return data.id;
    },
    onSuccess: async (id) => {
      await refresh();
      if (id) setSelectedId(id);
    },
  });

  // TASK 시작시각이 기록되면 세션이 PLANNED일 때 IN_PROGRESS로 올린다(예전 WORKFLOW와 같은 규칙).
  const ensureSessionStarted = async (sessionId: string, iso: string) => {
    await supabase
      .from("work_sessions")
      .update({ status: "IN_PROGRESS", started_at: iso })
      .eq("id", sessionId)
      .eq("status", "PLANNED");
    await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
  };

  // 배정 해제 — 블록과 그 플래너 TASK를 함께 지운다(Edge Function이 둘 다 처리).
  const removeBlock = useMutation({
    mutationFn: async (clicked: WorkBlock) => {
      const row = rowById.get(clicked.work_session_formula_version_id);
      // 템플릿 단계 블록은 한 덩어리 — 하나를 해제하면 그 컴포넌트의 모든 단계 블록이 대기공간으로 돌아간다.
      const targets = clicked.step_name
        ? blocks.filter(
            (b) => b.work_session_formula_version_id === clicked.work_session_formula_version_id,
          )
        : [clicked];
      for (const block of targets) {
        // 블록이 자동으로 만든 작업 기록(WORKFLOW TASK)은, 아직 아무 값도 안 넣었을 때만 같이 지운다.
        if (block.work_session_task_id) {
          await supabase
            .from("work_session_tasks")
            .delete()
            .eq("id", block.work_session_task_id)
            .eq("status", "NOT_STARTED")
            .is("actual_started_at", null)
            .is("completed_at", null)
            .is("output_quantity", null)
            .is("active_labour_minutes", null);
        }
        const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
          body: { remove_block_id: block.id, work_session_id: row?.work_session_id },
        });
        if (error) throw error;
        if (data && typeof data === "object" && "error" in data && data.error) {
          throw new Error(String((data as { error: unknown }).error));
        }
      }
    },
    onSuccess: async () => {
      setSelectedId(null);
      setWarning(null);
      await refresh();
    },
  });

  // ── DAILY TASKS(제품과 무관한 작업) ─────────────────────────────────────────
  const refreshDaily = async () => {
    await queryClient.invalidateQueries({ queryKey: ["daily_tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["daily_task_templates"] });
  };
  const syncDaily = async (id: string) => {
    const err = await syncDailyTaskToPlanner(id);
    setWarning(err ? `플래너 동기화에 실패했어요: ${err}` : null);
  };

  const createDaily = useMutation({
    mutationFn: async (v: {
      name: string;
      startMin: number;
      endMin: number;
      day: string;
      template?: DailyTaskTemplate;
      saveToLibrary?: boolean;
    }) => {
      const user_id = await currentUserId();
      let templateId = v.template?.id ?? null;
      if (!v.template && v.saveToLibrary) {
        const maxSort = dailyTemplates.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const { data: tpl, error: tplErr } = await supabase
          .from("daily_task_templates")
          .insert({
            user_id,
            name: v.name,
            default_minutes: Math.max(SNAP_MIN, v.endMin - v.startMin),
            sort_order: maxSort + 1,
          })
          .select("id")
          .single();
        if (tplErr) throw tplErr;
        templateId = tpl.id;
      }
      const { data, error } = await supabase
        .from("daily_tasks")
        .insert({
          user_id,
          task_date: v.day,
          start_time: toTime(v.startMin),
          end_time: toTime(v.endMin),
          name: v.name,
          task_type: v.template?.task_type ?? null,
          note: v.template?.note ?? null,
          template_id: templateId,
        })
        .select("id")
        .single();
      if (error) throw error;
      await syncDaily(data.id);
      return data.id;
    },
    onSuccess: async (id) => {
      setDailyName("");
      setDailySave(false);
      await refreshDaily();
      setSelectedId(null);
      setSelectedDailyId(id);
    },
  });

  const updateDaily = useMutation({
    mutationFn: async (v: {
      task: DailyTask;
      day?: string;
      startMin?: number;
      endMin?: number;
      name?: string;
      note?: string | null;
      orderId?: string | null;
    }) => {
      const { error } = await supabase
        .from("daily_tasks")
        .update({
          task_date: v.day ?? v.task.task_date,
          start_time: v.startMin !== undefined ? toTime(v.startMin) : v.task.start_time,
          end_time: v.endMin !== undefined ? toTime(v.endMin) : v.task.end_time,
          name: v.name ?? v.task.name,
          note: v.note !== undefined ? v.note : v.task.note,
          order_id: v.orderId !== undefined ? v.orderId : v.task.order_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.task.id);
      if (error) throw error;
      await syncDaily(v.task.id);
    },
    onSuccess: refreshDaily,
  });

  const deleteDaily = useMutation({
    mutationFn: async (task: DailyTask) => {
      const err = await removeDailyTask(task.id);
      if (err) throw new Error(err);
    },
    onSuccess: async () => {
      setSelectedDailyId(null);
      setWarning(null);
      await refreshDaily();
    },
  });

  const busy =
    createBlock.isPending ||
    updateBlock.isPending ||
    splitBlock.isPending ||
    removeBlock.isPending ||
    createDaily.isPending ||
    updateDaily.isPending ||
    deleteDaily.isPending;
  const firstError = [
    createBlock,
    updateBlock,
    splitBlock,
    removeBlock,
    createDaily,
    updateDaily,
    deleteDaily,
  ].find((m) => m.isError)?.error;

  // ── 드래그 앤 드롭 ───────────────────────────────────────────────────────────
  const minutesAt = (clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    return DAY_START_MIN + ((clientY - (rect?.top ?? 0)) / PX_PER_HOUR) * 60;
  };

  const onGridDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload;
    } catch {
      return;
    }
    const raw = minutesAt(e.clientY);
    if (payload.kind === "dailyNew" || payload.kind === "daily") return; // 데일리 칸에서만 처리
    if (payload.kind === "row") {
      const row = rowById.get(payload.rowId);
      if (!row) return;
      const startMin = clamp(snap(raw), DAY_START_MIN, DAY_END_MIN - DEFAULT_DURATION_MIN);
      createBlock.mutate({ row, startMin, endMin: startMin + DEFAULT_DURATION_MIN, day: date });
    } else {
      const block = blocks.find((b) => b.id === payload.blockId);
      if (!block) return;
      const duration = toMin(block.end_time) - toMin(block.start_time);
      const startMin = clamp(snap(raw - payload.offsetMin), DAY_START_MIN, DAY_END_MIN - duration);
      updateBlock.mutate({ block, day: date, startMin, endMin: startMin + duration });
    }
  };

  const onDailyDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload;
    } catch {
      return;
    }
    const raw = minutesAt(e.clientY);
    if (payload.kind === "dailyNew") {
      const tpl = dailyTemplates.find((t) => t.id === payload.templateId);
      if (!tpl) return;
      const dur = Math.max(SNAP_MIN, Math.ceil(tpl.default_minutes / SNAP_MIN) * SNAP_MIN);
      const startMin = clamp(snap(raw), DAY_START_MIN, DAY_END_MIN - dur);
      createDaily.mutate({
        name: tpl.name,
        startMin,
        endMin: startMin + dur,
        day: date,
        template: tpl,
      });
    } else if (payload.kind === "daily") {
      const task = (dailyQuery.data ?? []).find((t) => t.id === payload.taskId);
      if (!task) return;
      const duration = toMin(task.end_time) - toMin(task.start_time);
      const startMin = clamp(snap(raw - payload.offsetMin), DAY_START_MIN, DAY_END_MIN - duration);
      updateDaily.mutate({ task, day: date, startMin, endMin: startMin + duration });
    }
  };

  // 새 데일리 태스크를 그날 마지막 데일리 뒤(없으면 09:00)에 넣는다.
  const quickAddDaily = (name: string, minutes: number, template?: DailyTaskTemplate) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const dur = Math.max(SNAP_MIN, Math.ceil(minutes / SNAP_MIN) * SNAP_MIN);
    const lastEnd = dayDailies.reduce((m, t) => Math.max(m, toMin(t.end_time)), 0);
    const startMin = clamp(lastEnd > 0 ? lastEnd : 9 * 60, DAY_START_MIN, DAY_END_MIN - dur);
    createDaily.mutate({
      name: trimmed,
      startMin,
      endMin: startMin + dur,
      day: date,
      ...(template ? { template } : {}),
      saveToLibrary: dailySave,
    });
  };

  const startResizeGeneric = (
    e: ReactPointerEvent<HTMLDivElement>,
    id: string,
    startMin: number,
    origEnd: number,
    commit: (endMin: number) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    let latest = origEnd;
    setResize({ id, endMin: origEnd });
    const move = (ev: PointerEvent) => {
      latest = clamp(
        snap(origEnd + (ev.clientY - startY) / PX_PER_MIN),
        startMin + SNAP_MIN,
        DAY_END_MIN,
      );
      setResize({ id, endMin: latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResize(null);
      if (latest !== origEnd) commit(latest);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const startResize = (e: ReactPointerEvent<HTMLDivElement>, block: WorkBlock) =>
    startResizeGeneric(e, block.id, toMin(block.start_time), toMin(block.end_time), (endMin) =>
      updateBlock.mutate({ block, endMin }),
    );
  const startDailyResize = (e: ReactPointerEvent<HTMLDivElement>, task: DailyTask) =>
    startResizeGeneric(e, task.id, toMin(task.start_time), toMin(task.end_time), (endMin) =>
      updateDaily.mutate({ task, endMin }),
    );

  // 터치/클릭용 빠른 배정 — 지금 현재 시각(5분 단위 내림)에 기본 1시간으로 넣는다(2026-11-04 요청).
  const quickAdd = (row: DashboardComponentRow) => {
    const now = new Date();
    const nowMin = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    const startMin = clamp(nowMin, DAY_START_MIN, DAY_END_MIN - DEFAULT_DURATION_MIN);
    createBlock.mutate({ row, startMin, endMin: startMin + DEFAULT_DURATION_MIN, day: date });
  };

  // 시간 배정 전 컴포넌트 여러 개를 지금 현재 시각부터 차례로 이어서 넣는다(템플릿 단계가 있으면 단계 합계만큼 차지).
  const addRowsToDay = async (rowIds: string[]) => {
    const now = new Date();
    let cursor = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
    for (const id of rowIds) {
      const row = rowById.get(id);
      if (!row) continue;
      const steps = stepsOf(row);
      const dur =
        steps.length === 0
          ? DEFAULT_DURATION_MIN
          : steps.reduce(
              (sum, st) =>
                sum +
                (st.timer_minutes
                  ? Math.max(SNAP_MIN, Math.ceil(st.timer_minutes / SNAP_MIN) * SNAP_MIN)
                  : DEFAULT_DURATION_MIN),
              0,
            );
      const startMin = clamp(cursor, DAY_START_MIN, DAY_END_MIN - DEFAULT_DURATION_MIN);
      await createBlock.mutateAsync({
        row,
        startMin,
        endMin: startMin + DEFAULT_DURATION_MIN,
        day: date,
      });
      cursor = startMin + dur;
    }
    setPickedRowIds([]);
  };

  const gridHeight = HOURS.length * PX_PER_HOUR;

  return (
    <div className="space-y-3">
      {(warning || firstError) && (
        <p className="border border-destructive px-3 py-2 font-mono text-xs text-destructive">
          {warning ?? (firstError as Error).message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ── 작업 대기공간 ── */}
        <section
          className={cn(
            "space-y-3 border bg-card p-3",
            poolOver ? "border-foreground bg-muted" : "border-border",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setPoolOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPoolOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setPoolOver(false);
            try {
              const payload = JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload;
              if (payload.kind === "daily") {
                const task = (dailyQuery.data ?? []).find((t) => t.id === payload.taskId);
                if (task) deleteDaily.mutate(task);
                return;
              }
              if (payload.kind !== "block") return;
              const blk = blocks.find((b) => b.id === payload.blockId);
              if (blk) removeBlock.mutate(blk);
            } catch {
              /* 다른 드래그는 무시 */
            }
          }}
        >
          <div>
            <p className="label-caps text-xs">작업 대기공간</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {poolCount === 0
                ? "시간 배정 전인 컴포넌트가 없어요"
                : `${poolCount}개 대기 중 · 타임라인으로 끌어다 놓거나 ADD`}
              {" · 블록을 여기로 끌면 시간 배정 해제(데일리 태스크는 삭제)"}
            </p>
          </div>
          {components.isLoading ? (
            <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
          ) : poolGroups.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              시간 배정 전인 컴포넌트가 없어요. ORDERS 탭에서 오더에 컴포넌트를 지정하면 여기에
              쌓여요.
            </p>
          ) : (
            poolGroups.map((g) => {
              const color = orderColor(g.order.id);
              const delivery = formatDelivery(g.order.pickupAt, g.order.eventDate);
              return (
                <div key={g.order.id} className="space-y-1.5">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className="label-caps px-1.5 py-0.5 text-[11px]"
                      style={{ background: color.bg, color: color.text }}
                    >
                      {g.order.order_number}
                    </span>
                    <span className="text-muted-foreground">
                      {orderTitle(g.order.customerName, g.order.productName)}
                    </span>
                    <DietaryChips names={dietaryOf(g.order.id)} />
                    {delivery && (
                      <span className="ml-auto font-mono text-[11px]">🚚 {delivery}</span>
                    )}
                  </p>
                  {g.rows.map((r) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ kind: "row", rowId: r.id } satisfies DragPayload),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => {
                        setSelectedId(null);
                        setFocusRowId(r.id);
                      }}
                      className="flex cursor-grab items-center gap-2 border border-border bg-background px-2 py-1.5"
                      style={{ borderLeft: `3px solid ${color.accent}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="label-caps text-[11px] text-muted-foreground">
                          {r.slot ?? "CORE"}
                        </p>
                        <p className="flex items-center gap-1 truncate text-sm">
                          <span className="truncate">{r.componentName}</span>
                          {r.unmodifiedCopy && <CopyWarning formulaId={r.formulaId} />}
                        </p>
                        {stepsOf(r).length > 1 && (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {stepsOf(r)
                              .map((s) => s.task_name)
                              .join(" → ")}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className={cn(buttonClass, "!min-h-[26px] px-1.5 text-[11px]")}
                        disabled={busy}
                        onClick={() => quickAdd(r)}
                      >
                        ADD
                      </button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </section>

        {/* ── 데일리 타임라인 ── */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => setDate(addDays(date, -1))}
              aria-label="이전 날"
            >
              ‹
            </button>
            <input
              type="date"
              className={cn(inputClass, "!w-40")}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button
              type="button"
              className={buttonClass}
              onClick={() => setDate(addDays(date, 1))}
              aria-label="다음 날"
            >
              ›
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setDate(toLocalDateString())}
            >
              TODAY
            </button>
            <span className="font-mono text-sm">
              {date} ({koreanWeekdayShort(date)})
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {dayBlocks.length}개 블록 · {dayDailies.length}개 데일리
            </span>
          </div>

          {/* ── DAILY / QUICK ADD: 데일리 태스크 + 시간 배정 전 컴포넌트 여러 개 한 번에 ── */}
          <div className="space-y-2 border border-border bg-card p-3">
            <p className="label-caps text-xs">DAILY TASKS · QUICK ADD</p>
            <div className="flex flex-wrap items-start gap-2">
              <form
                className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  quickAddDaily(dailyName, DEFAULT_DURATION_MIN);
                }}
              >
                <input
                  className={cn(inputClass, "min-w-[160px] flex-1")}
                  placeholder="즉석 작업 이름 (예: 오븐 청소)"
                  value={dailyName}
                  onChange={(e) => setDailyName(e.target.value)}
                />
                <label className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={dailySave}
                    onChange={(e) => setDailySave(e.target.checked)}
                  />
                  라이브러리에도 저장
                </label>
                <button
                  type="submit"
                  className={cn(buttonClass, "!min-h-[30px] px-2 text-[11px]")}
                  disabled={busy || !dailyName.trim()}
                >
                  + ADD
                </button>
              </form>

              <details className="relative">
                <summary
                  className={cn(buttonClass, "!min-h-[30px] cursor-pointer px-2 text-[11px]")}
                >
                  대기 중 컴포넌트에서 선택
                  {pickedRowIds.length > 0 ? ` (${pickedRowIds.length})` : ""} ▾
                </summary>
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-72 space-y-2 overflow-y-auto border border-border bg-background p-2 shadow-md">
                  {poolGroups.length === 0 ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      시간 배정 전인 컴포넌트가 없어요
                    </p>
                  ) : (
                    poolGroups.map((g) => (
                      <div key={g.order.id} className="space-y-0.5">
                        <p className="label-caps text-[10px] text-muted-foreground">
                          {g.order.order_number} ·{" "}
                          {orderTitle(g.order.customerName, g.order.productName)}
                          {dietaryOf(g.order.id).length > 0
                            ? ` · ${dietaryOf(g.order.id).join(", ")}`
                            : ""}
                          {formatDelivery(g.order.pickupAt, g.order.eventDate)
                            ? ` · 🚚 ${formatDelivery(g.order.pickupAt, g.order.eventDate)}`
                            : ""}
                        </p>
                        {g.rows.map((r) => (
                          <label key={r.id} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={pickedRowIds.includes(r.id)}
                              onChange={(e) =>
                                setPickedRowIds((cur) =>
                                  e.target.checked
                                    ? [...cur, r.id]
                                    : cur.filter((id) => id !== r.id),
                                )
                              }
                            />
                            <span className="label-caps w-12 shrink-0 text-[10px] text-muted-foreground">
                              {r.slot ?? "CORE"}
                            </span>
                            <span className="truncate">{r.componentName}</span>
                            {r.unmodifiedCopy && <CopyWarning formulaId={r.formulaId} />}
                          </label>
                        ))}
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    className={cn(buttonClass, "!min-h-[28px] w-full text-[11px]")}
                    disabled={busy || pickedRowIds.length === 0}
                    onClick={() => void addRowsToDay(pickedRowIds)}
                  >
                    선택한 {pickedRowIds.length}개를 {date} 타임라인에 추가
                  </button>
                </div>
              </details>
            </div>

            {dailyTemplates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dailyTemplates.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "text/plain",
                        JSON.stringify({
                          kind: "dailyNew",
                          templateId: t.id,
                        } satisfies DragPayload),
                      );
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="flex cursor-grab items-center gap-1.5 border border-border bg-background px-2 py-1"
                    style={{ borderLeft: `3px solid ${DAILY_COLOR.accent}` }}
                  >
                    <span className="text-xs">{t.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {t.default_minutes}분
                    </span>
                    <button
                      type="button"
                      className={cn(buttonClass, "!min-h-[22px] px-1.5 text-[10px]")}
                      disabled={busy}
                      onClick={() => quickAddDaily(t.name, t.default_minutes, t)}
                    >
                      ADD
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="relative border border-border bg-card"
            style={{ height: gridHeight, paddingLeft: 48 }}
          >
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border"
                style={{ top: (h - 6) * PX_PER_HOUR }}
              >
                <span className="absolute left-2 top-0.5 font-mono text-[11px] text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}

            <div className="flex h-full">
              <div
                ref={gridRef}
                className="relative h-full w-[68%]"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={onGridDrop}
                onClick={() => {
                  setSelectedId(null);
                  setSelectedDailyId(null);
                }}
              >
                {visibleBlocks.map((b) => {
                  const row = rowById.get(b.work_session_formula_version_id);
                  if (!row) return null;
                  const merged = mergeGroups.primaries.get(b.id);
                  const color = orderColor(row.order.id);
                  const start = toMin(b.start_time);
                  const end = effectiveEnd(b);
                  const pos = lanes.get(b.id) ?? { lane: 0, lanes: 1 };
                  const isSelected = b.id === selectedId;
                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      draggable={!resize}
                      onDragStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const offsetMin = ((e.clientY - rect.top) / PX_PER_HOUR) * 60;
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({
                            kind: "block",
                            blockId: b.id,
                            offsetMin,
                          } satisfies DragPayload),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(b.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(b.id);
                        }
                      }}
                      className={cn(
                        "absolute cursor-grab overflow-hidden px-2 py-1 text-left",
                        isSelected
                          ? "outline outline-2 outline-foreground"
                          : "border border-border",
                      )}
                      style={{
                        top: (start - DAY_START_MIN) * PX_PER_MIN,
                        height: Math.max((end - start) * PX_PER_MIN, 26),
                        left: `calc(${(pos.lane / pos.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / pos.lanes}% - 4px)`,
                        background: color.bg,
                        color: color.text,
                        borderLeft: `3px solid ${color.accent}`,
                      }}
                    >
                      <p className="truncate text-xs font-medium">
                        <span className="label-caps mr-1 text-[10px] opacity-70">
                          {row.slot ?? "CORE"}
                        </span>
                        {blockTitle(b, row)}
                      </p>
                      <p className="truncate font-mono text-[11px] opacity-80">
                        {merged
                          ? `MERGED ${merged.orders.length} · ${merged.orders.join(" + ")}`
                          : row.order.order_number}{" "}
                        · {hm(start)}–{hm(end)}
                      </p>
                      <div
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        title="길이 조절"
                        draggable={false}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => startResize(e, b)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mx-auto mt-1 h-0.5 w-6 bg-current opacity-40" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DAILY 칸 — 제품과 무관한 작업. 컴포넌트 블록과 겹치지 않게 오른쪽 별도 칸. */}
              <div
                className="relative h-full w-[32%] border-l border-dashed border-border bg-muted/30"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={onDailyDrop}
                onClick={() => setSelectedDailyId(null)}
              >
                <span className="label-caps pointer-events-none absolute right-1 top-0.5 text-[10px] text-muted-foreground">
                  DAILY
                </span>
                {dayDailies.map((t) => {
                  const start = toMin(t.start_time);
                  const end = dailyEnd(t);
                  const pos = dailyLanes.get(t.id) ?? { lane: 0, lanes: 1 };
                  const isSel = t.id === selectedDaily?.id;
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      draggable={!resize}
                      onDragStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({
                            kind: "daily",
                            taskId: t.id,
                            offsetMin: ((e.clientY - rect.top) / PX_PER_HOUR) * 60,
                          } satisfies DragPayload),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(null);
                        setSelectedDailyId(t.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(null);
                          setSelectedDailyId(t.id);
                        }
                      }}
                      className={cn(
                        "absolute cursor-grab overflow-hidden px-2 py-1 text-left",
                        isSel ? "outline outline-2 outline-foreground" : "border border-border",
                      )}
                      style={{
                        top: (start - DAY_START_MIN) * PX_PER_MIN,
                        height: Math.max((end - start) * PX_PER_MIN, 26),
                        left: `calc(${(pos.lane / pos.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / pos.lanes}% - 4px)`,
                        background: DAILY_COLOR.bg,
                        color: DAILY_COLOR.text,
                        borderLeft: `3px solid ${DAILY_COLOR.accent}`,
                      }}
                    >
                      <p className="truncate text-xs font-medium">
                        {t.order_id && (
                          <span className="label-caps mr-1 text-[10px] opacity-70">
                            {(ordersData.data ?? []).find((o) => o.id === t.order_id)?.order_number}
                          </span>
                        )}
                        {t.name}
                      </p>
                      <p className="truncate font-mono text-[11px] opacity-80">
                        {hm(start)}–{hm(end)}
                      </p>
                      <div
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        title="길이 조절"
                        draggable={false}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => startDailyResize(e, t)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mx-auto mt-1 h-0.5 w-6 bg-current opacity-40" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedDaily ? (
            <div
              key={`${selectedDaily.id}-${selectedDaily.updated_at}`}
              className="space-y-2 border border-border bg-card p-3"
            >
              <p className="label-caps text-[11px] text-muted-foreground">
                DAILY TASK · {selectedDaily.task_date} 의 Daily Project 하위 플래너 TASK
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] flex-1 space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">NAME</span>
                  <input
                    className={inputClass}
                    defaultValue={selectedDaily.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== selectedDaily.name)
                        updateDaily.mutate({ task: selectedDaily, name: v });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">DATE</span>
                  <input
                    type="date"
                    className={cn(inputClass, "!w-40")}
                    defaultValue={selectedDaily.task_date}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== selectedDaily.task_date)
                        updateDaily.mutate({ task: selectedDaily, day: e.target.value });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">START</span>
                  <input
                    type="time"
                    step={300}
                    className={cn(inputClass, "!w-28")}
                    defaultValue={selectedDaily.start_time.slice(0, 5)}
                    onBlur={(e) => {
                      if (!e.target.value) return;
                      const m = toMin(e.target.value);
                      if (
                        m !== toMin(selectedDaily.start_time) &&
                        m < toMin(selectedDaily.end_time)
                      )
                        updateDaily.mutate({ task: selectedDaily, startMin: m });
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">END</span>
                  <input
                    type="time"
                    step={300}
                    className={cn(inputClass, "!w-28")}
                    defaultValue={selectedDaily.end_time.slice(0, 5)}
                    onBlur={(e) => {
                      if (!e.target.value) return;
                      const m = toMin(e.target.value);
                      if (
                        m !== toMin(selectedDaily.end_time) &&
                        m > toMin(selectedDaily.start_time)
                      )
                        updateDaily.mutate({ task: selectedDaily, endMin: m });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={cn(buttonClass, "hover:text-destructive")}
                  disabled={busy}
                  onClick={() => {
                    if (confirm("이 데일리 태스크와 플래너 TASK를 삭제할까요?"))
                      deleteDaily.mutate(selectedDaily);
                  }}
                >
                  DELETE
                </button>
              </div>
              <label className="block space-y-1">
                <span className="label-caps block text-[11px] text-muted-foreground">
                  LINK TO ORDER (연결하면 플래너 TASK가 그 오더 프로젝트로 이동)
                </span>
                <select
                  className={inputClass}
                  value={selectedDaily.order_id ?? ""}
                  onChange={(e) =>
                    updateDaily.mutate({ task: selectedDaily, orderId: e.target.value || null })
                  }
                >
                  <option value="">— 연결 안 함 (Daily Project) —</option>
                  {(ordersData.data ?? [])
                    .filter((o) => o.status !== "COMPLETED" || o.id === selectedDaily.order_id)
                    .sort((a, b) => a.order_number.localeCompare(b.order_number))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.order_number} ·{" "}
                        {o.products?.name ?? o.customers?.name ?? o.recipient ?? ""}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="label-caps block text-[11px] text-muted-foreground">
                  NOTE (플래너 TASK 노트)
                </span>
                <textarea
                  className={cn(inputClass, "min-h-[52px] w-full")}
                  defaultValue={selectedDaily.note ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (selectedDaily.note ?? ""))
                      updateDaily.mutate({ task: selectedDaily, note: v || null });
                  }}
                />
              </label>
            </div>
          ) : selected && selectedRow ? (
            <div
              key={`${selected.id}-${selected.updated_at}`}
              className="space-y-2 border border-border bg-card p-3"
            >
              <p className="text-sm">
                <span className="label-caps mr-2 text-[11px] text-muted-foreground">
                  {selectedRow.order.order_number} · {selectedRow.slot ?? "CORE"}
                </span>
                {blockTitle(selected, selectedRow)}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">DATE</span>
                  <input
                    type="date"
                    className={cn(inputClass, "!w-40")}
                    defaultValue={selected.block_date}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== selected.block_date) {
                        updateBlock.mutate({ block: selected, day: e.target.value });
                      }
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">START</span>
                  <input
                    type="time"
                    step={300}
                    className={cn(inputClass, "!w-28")}
                    defaultValue={selected.start_time.slice(0, 5)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const m = toMin(v);
                      const end = toMin(selected.end_time);
                      if (m !== toMin(selected.start_time) && m < end) {
                        updateBlock.mutate({ block: selected, startMin: m });
                      }
                    }}
                  />
                </label>
                <label className="space-y-1">
                  <span className="label-caps block text-[11px] text-muted-foreground">END</span>
                  <input
                    type="time"
                    step={300}
                    className={cn(inputClass, "!w-28")}
                    defaultValue={selected.end_time.slice(0, 5)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const m = toMin(v);
                      if (m !== toMin(selected.end_time) && m > toMin(selected.start_time)) {
                        updateBlock.mutate({ block: selected, endMin: m });
                      }
                    }}
                  />
                </label>
                {selected.step_name ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    템플릿 단계 {selected.part_no}: {selected.step_name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => splitBlock.mutate(selected)}
                    title="같은 컴포넌트의 다음 차수 블록을 만들어요"
                  >
                    SPLIT (1차/2차)
                  </button>
                )}
                <button
                  type="button"
                  className={cn(buttonClass, "hover:text-destructive")}
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        selected.step_name
                          ? "배정을 해제할까요? 이 컴포넌트의 모든 단계 블록과 플래너 TASK가 삭제되고 대기공간으로 돌아갑니다."
                          : "배정을 해제할까요? 이 블록과 플래너에 만들어진 TASK가 삭제되고 컴포넌트는 대기공간으로 돌아갑니다.",
                      )
                    ) {
                      removeBlock.mutate(selected);
                    }
                  }}
                >
                  UNASSIGN
                </button>
                <Link
                  to="/production/$sessionId"
                  params={{ sessionId: selectedRow.work_session_id }}
                  className={buttonClass}
                >
                  OPEN SESSION
                </Link>
              </div>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              블록을 누르면 시간 수정·분할·배정 해제를 할 수 있어요. 아래쪽 가장자리를 끌면 길이가
              바뀌어요.
            </p>
          )}
        </section>
      </div>

      {/* ── 그날 작업의 WORK VIEW(계량) 등 — 블록이 속한 세션별로 ── */}
      {workspaceSessions.length > 0 ? (
        <>
          <DayWorkView
            key={date}
            items={dayWorkItems}
            focusedRowId={selected?.work_session_formula_version_id ?? null}
            focusKey={selected?.id ?? null}
            mergedVersions={mergedVersions}
            onToggleMerge={(versionId) => void toggleMergeAndAlign(versionId)}
            renderHeaderExtra={(selectionIds) => {
              const memberBlocks = selectionIds
                .flatMap((id) => {
                  const row = rowById.get(id);
                  if (!row) return [];
                  return dayBlocks
                    .filter((b) => b.work_session_formula_version_id === id)
                    .map((block) => ({ block, row }));
                })
                .sort((a, b) => a.block.start_time.localeCompare(b.block.start_time));
              // 병합이면 같은 단계끼리 한 타이머, 아니면 블록마다
              const seen = new Set<string>();
              const primaries = memberBlocks.filter(({ block }) => {
                const key =
                  selectionIds.length > 1 ? (block.step_name ?? `part-${block.part_no}`) : block.id;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              if (!primaries.length) return null;
              return (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {primaries.map(({ block, row }) => (
                    <BlockTimerInline
                      key={block.id}
                      block={block}
                      row={row}
                      onStarted={ensureSessionStarted}
                      onRetime={retimeBlock}
                      label={
                        primaries.length > 1 ? (block.step_name ?? `${block.part_no}차`) : undefined
                      }
                    />
                  ))}
                </div>
              );
            }}
            renderRecords={(selectionIds) => {
              const renderOne = (id: string) => {
                const row = rowById.get(id);
                if (!row) return null;
                const recordBlocks = dayBlocks
                  .filter((b) => b.work_session_formula_version_id === id)
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div key={id} className="space-y-1">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {row.order.order_number} · {row.componentName}
                    </p>
                    {recordBlocks.length ? (
                      recordBlocks.map((block) => (
                        <ProductionBlockRecord
                          key={block.id}
                          block={block}
                          row={row}
                          title={blockTitle(block, row)}
                          active={selected?.id === block.id}
                          onStarted={ensureSessionStarted}
                          onRetime={retimeBlock}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        타임라인에 배정하면 생산 기록을 입력할 수 있어요.
                      </p>
                    )}
                  </div>
                );
              };
              if (selectionIds.length < 2) return selectionIds.map(renderOne);
              // 병합된 컴포넌트는 같은 반죽을 함께 굽는 것이라 생산 기록도 한 벌로 보여준다.
              // 같은 단계(step_name/차수)의 블록끼리 묶고, 가장 이른 블록의 기록을 대표로 쓴다.
              const memberBlocks = selectionIds
                .flatMap((id) => {
                  const row = rowById.get(id);
                  if (!row) return [];
                  return dayBlocks
                    .filter((b) => b.work_session_formula_version_id === id)
                    .map((block) => ({ block, row }));
                })
                .sort((a, b) => a.block.start_time.localeCompare(b.block.start_time));
              const stepGroups = new Map<string, typeof memberBlocks>();
              for (const item of memberBlocks) {
                const key = item.block.step_name ?? `part-${item.block.part_no}`;
                stepGroups.set(key, [...(stepGroups.get(key) ?? []), item]);
              }
              if (stepGroups.size === 0) {
                return (
                  <p className="text-xs text-muted-foreground">
                    타임라인에 배정하면 생산 기록을 입력할 수 있어요.
                  </p>
                );
              }
              return [...stepGroups.entries()].map(([key, items]) => {
                const primary = items[0]!;
                const orders = [...new Set(items.map((i) => i.row.order.order_number))];
                return (
                  <ProductionBlockRecord
                    key={key}
                    block={primary.block}
                    row={primary.row}
                    title={blockTitle(primary.block, primary.row)}
                    active={items.some((i) => selected?.id === i.block.id)}
                    onStarted={ensureSessionStarted}
                    onRetime={retimeBlock}
                    mergedLabel={orders.join(" + ")}
                  />
                );
              });
            }}
            labels={Object.fromEntries(
              rows.map((r) => [r.id, `${r.order.order_number} · ${r.slot ?? ""}`]),
            )}
          />
          <details
            className="border border-border bg-card"
            onToggle={(e) => setShowSessionNotes(e.currentTarget.open)}
          >
            <summary className="label-caps cursor-pointer px-3 py-2 text-xs">세션 메모</summary>
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              세션 전체 메모입니다. 생산 수량과 기록은 위 컴포넌트 행에서 관리하세요.
            </p>
            {showSessionNotes &&
              workspaceSessions.map(({ sid, rowIds }) => (
                <div key={sid} className="border-t border-border p-3">
                  <p className="mb-2 font-mono text-xs">
                    {[
                      ...new Set(
                        rows
                          .filter((r) => r.work_session_id === sid)
                          .map((r) => r.order.order_number),
                      ),
                    ].join(" / ")}
                  </p>
                  <WorkSessionWorkspace sessionId={sid} rowIds={rowIds} embedded />
                </div>
              ))}
          </details>
        </>
      ) : (
        <p className="border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
          이 날짜에 배정된 작업이 없어요. 컴포넌트를 타임라인에 배정하면 아래에 계량(WORK VIEW)이
          열려요.
        </p>
      )}
    </div>
  );
}

/** WANN project/task hierarchy: production records mount only when their row is open. */
function ProductionBlockRecord({
  block,
  row,
  title,
  active,
  onStarted,
  onRetime,
  mergedLabel,
}: {
  block: WorkBlock;
  row: DashboardComponentRow;
  title: string;
  active: boolean;
  onStarted: (sessionId: string, iso: string) => void | Promise<void>;
  onRetime?: ((block: WorkBlock, iso: string) => void | Promise<void>) | undefined;
  /** 병합 컴포넌트의 한 벌 기록 — 이 기록이 함께 다루는 오더들 */
  mergedLabel?: string;
}) {
  // 기본으로 열어 둔다(사용자가 닫지 않는 한) — 타이머·관찰값을 바로 입력할 수 있게.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 py-2 text-left text-xs"
        onClick={() => setExpanded((v) => !v)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span>
          {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
        </span>
        <span className="flex-1">
          {block.step_name ?? `${block.part_no}차 생산`}
          {mergedLabel && (
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">{mergedLabel}</span>
          )}
        </span>
        <span className="text-muted-foreground">기록</span>
      </button>
      {expanded && (
        <BlockTaskDetails
          block={block}
          row={row}
          title={title}
          onStarted={onStarted}
          onRetime={onRetime}
          embedded
        />
      )}
    </div>
  );
}
