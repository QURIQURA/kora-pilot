import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  dashboardComponentsQuery,
  workBlocksQuery,
  type DashboardComponentRow,
  type WorkBlock,
} from "@/lib/queries";
import { addDays, koreanWeekdayShort, toLocalDateString } from "@/lib/datetime";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
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
  | { kind: "block"; blockId: string; offsetMin: number };

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
  const [date, setDate] = useState(() => toLocalDateString());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [resize, setResize] = useState<{ id: string; endMin: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => components.data ?? [], [components.data]);
  const blocks = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

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
    return (orderId: string) => ORDER_PALETTE[Math.max(ids.indexOf(orderId), 0) % ORDER_PALETTE.length]!;
  }, [rows]);

  const isActive = (r: DashboardComponentRow) =>
    r.order.status !== "COMPLETED" &&
    r.sessionStatus !== "COMPLETED" &&
    r.sessionStatus !== "CANCELLED";

  const poolGroups = useMemo(() => {
    const groups = new Map<string, { order: DashboardComponentRow["order"]; rows: DashboardComponentRow[] }>();
    for (const r of rows) {
      if (!isActive(r)) continue;
      if ((blocksByRow.get(r.id) ?? []).length > 0) continue;
      const g = groups.get(r.order.id) ?? { order: r.order, rows: [] };
      g.rows.push(r);
      groups.set(r.order.id, g);
    }
    return [...groups.values()].sort((a, b) => a.order.order_number.localeCompare(b.order.order_number));
  }, [rows, blocksByRow]);
  const poolCount = poolGroups.reduce((n, g) => n + g.rows.length, 0);

  const dayBlocks = useMemo(
    () => blocks.filter((b) => b.block_date === date && rowById.has(b.work_session_formula_version_id)),
    [blocks, date, rowById],
  );
  const effectiveEnd = (b: WorkBlock) => (resize?.id === b.id ? resize.endMin : toMin(b.end_time));
  const lanes = useMemo(
    () => layoutLanes(dayBlocks.map((b) => ({ id: b.id, start: toMin(b.start_time), end: effectiveEnd(b) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayBlocks, resize],
  );

  const selected = dayBlocks.find((b) => b.id === selectedId) ?? null;
  const selectedRow = selected ? rowById.get(selected.work_session_formula_version_id) : undefined;

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
    return `${row.componentName}${siblings.length > 1 ? ` (${b.part_no}차)` : ""}`;
  };

  const createBlock = useMutation({
    mutationFn: async (v: { row: DashboardComponentRow; startMin: number; endMin: number; day: string }) => {
      const user_id = await currentUserId();
      const partNo = (blocksByRow.get(v.row.id) ?? []).reduce((m, b) => Math.max(m, b.part_no), 0) + 1;
      const { data, error } = await supabase
        .from("work_blocks")
        .insert({
          user_id,
          work_session_formula_version_id: v.row.id,
          block_date: v.day,
          start_time: toTime(v.startMin),
          end_time: toTime(v.endMin),
          part_no: partNo,
        })
        .select("id")
        .single();
      if (error) throw error;
      await syncAfter(v.row.work_session_id);
      return data.id;
    },
    onSuccess: async (id) => {
      await refresh();
      setSelectedId(id);
    },
  });

  const updateBlock = useMutation({
    mutationFn: async (v: { block: WorkBlock; day?: string; startMin?: number; endMin?: number }) => {
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
      if (row) await syncAfter(row.work_session_id);
    },
    onSuccess: refresh,
  });

  const splitBlock = useMutation({
    mutationFn: async (block: WorkBlock) => {
      const row = rowById.get(block.work_session_formula_version_id);
      if (!row) return null;
      const user_id = await currentUserId();
      const duration = toMin(block.end_time) - toMin(block.start_time);
      const startMin = Math.min(toMin(block.end_time), DAY_END_MIN - duration);
      const partNo = (blocksByRow.get(row.id) ?? []).reduce((m, b) => Math.max(m, b.part_no), 0) + 1;
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

  // 배정 해제 — 블록과 그 플래너 TASK를 함께 지운다(Edge Function이 둘 다 처리).
  const removeBlock = useMutation({
    mutationFn: async (block: WorkBlock) => {
      const row = rowById.get(block.work_session_formula_version_id);
      const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
        body: { remove_block_id: block.id, work_session_id: row?.work_session_id },
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(String((data as { error: unknown }).error));
      }
    },
    onSuccess: async () => {
      setSelectedId(null);
      setWarning(null);
      await refresh();
    },
  });

  const busy =
    createBlock.isPending || updateBlock.isPending || splitBlock.isPending || removeBlock.isPending;
  const firstError = [createBlock, updateBlock, splitBlock, removeBlock].find((m) => m.isError)?.error;

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

  const startResize = (e: ReactPointerEvent<HTMLDivElement>, block: WorkBlock) => {
    e.preventDefault();
    e.stopPropagation();
    const startMin = toMin(block.start_time);
    const origEnd = toMin(block.end_time);
    const startY = e.clientY;
    let latest = origEnd;
    setResize({ id: block.id, endMin: origEnd });
    const move = (ev: PointerEvent) => {
      latest = clamp(snap(origEnd + (ev.clientY - startY) / PX_PER_MIN), startMin + SNAP_MIN, DAY_END_MIN);
      setResize({ id: block.id, endMin: latest });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResize(null);
      if (latest !== origEnd) updateBlock.mutate({ block, endMin: latest });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 터치/클릭용 빠른 배정 — 그날 마지막 블록 뒤(없으면 09:00)에 기본 1시간으로 넣는다.
  const quickAdd = (row: DashboardComponentRow) => {
    const lastEnd = dayBlocks.reduce((m, b) => Math.max(m, toMin(b.end_time)), 0);
    const startMin = clamp(lastEnd > 0 ? lastEnd : 9 * 60, DAY_START_MIN, DAY_END_MIN - DEFAULT_DURATION_MIN);
    createBlock.mutate({ row, startMin, endMin: startMin + DEFAULT_DURATION_MIN, day: date });
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
        <section className="space-y-3 border border-border bg-card p-3">
          <div>
            <p className="label-caps text-xs">작업 대기공간</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {poolCount === 0
                ? "배정 안 된 컴포넌트가 없어요"
                : `${poolCount}개 대기 중 · 타임라인으로 끌어다 놓거나 ADD`}
            </p>
          </div>
          {components.isLoading ? (
            <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
          ) : poolGroups.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              오더에서 Work Session을 만들고 Sheet/Cream/Filling을 추가하면 여기에 쌓여요.
            </p>
          ) : (
            poolGroups.map((g) => {
              const color = orderColor(g.order.id);
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
                      {g.order.productName ?? g.order.customerName ?? ""}
                    </span>
                  </p>
                  {g.rows.map((r) => (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "row", rowId: r.id } satisfies DragPayload));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="flex cursor-grab items-center gap-2 border border-border bg-background px-2 py-1.5"
                      style={{ borderLeft: `3px solid ${color.accent}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="label-caps text-[11px] text-muted-foreground">{r.slot ?? "CORE"}</p>
                        <p className="truncate text-sm">{r.componentName}</p>
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
            <button type="button" className={buttonClass} onClick={() => setDate(addDays(date, -1))} aria-label="이전 날">
              ‹
            </button>
            <input
              type="date"
              className={cn(inputClass, "!w-40")}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button type="button" className={buttonClass} onClick={() => setDate(addDays(date, 1))} aria-label="다음 날">
              ›
            </button>
            <button type="button" className={buttonClass} onClick={() => setDate(toLocalDateString())}>
              TODAY
            </button>
            <span className="font-mono text-sm">
              {date} ({koreanWeekdayShort(date)})
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {dayBlocks.length}개 블록
            </span>
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

            <div
              ref={gridRef}
              className="relative h-full"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={onGridDrop}
              onClick={() => setSelectedId(null)}
            >
              {dayBlocks.map((b) => {
                const row = rowById.get(b.work_session_formula_version_id);
                if (!row) return null;
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
                        JSON.stringify({ kind: "block", blockId: b.id, offsetMin } satisfies DragPayload),
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
                      isSelected ? "outline outline-2 outline-foreground" : "border border-border",
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
                      <span className="label-caps mr-1 text-[10px] opacity-70">{row.slot ?? "CORE"}</span>
                      {blockTitle(b, row)}
                    </p>
                    <p className="truncate font-mono text-[11px] opacity-80">
                      {row.order.order_number} · {hm(start)}–{hm(end)}
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
          </div>

          {selected && selectedRow ? (
            <div key={`${selected.id}-${selected.updated_at}`} className="space-y-2 border border-border bg-card p-3">
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
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => splitBlock.mutate(selected)}
                  title="같은 컴포넌트의 다음 차수 블록을 만들어요"
                >
                  SPLIT (1차/2차)
                </button>
                <button
                  type="button"
                  className={cn(buttonClass, "hover:text-destructive")}
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "배정을 해제할까요? 이 블록과 플래너에 만들어진 TASK가 삭제되고 컴포넌트는 대기공간으로 돌아갑니다.",
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
              블록을 누르면 시간 수정·분할·배정 해제를 할 수 있어요. 아래쪽 가장자리를 끌면 길이가 바뀌어요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
