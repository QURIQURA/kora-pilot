import { toast } from "sonner";
import { ComponentPlanReadout } from "./ComponentPlanReadout";
import { ProductionOrderSizeEditor } from "./ProductionOrderSizeEditor";
import { removePlannedComponent } from "@/lib/production-plan-actions";
import { invalidateProductionSync } from "@/lib/production-sync";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CORE_SLOTS,
  CORE_SLOT_LABELS,
  dashboardComponentsQuery,
  orderStatusLabel,
  ordersQuery,
  workBlocksQuery,
  workSessionsQuery,
  workSessionFormulaVersionsQuery,
  type CoreSlot,
  type DashboardComponentRow,
} from "@/lib/queries";
import { buildProductionOrderCards } from "@/lib/production-orders";
import { OrderComponentPlanRow } from "./OrderComponentPlanRow";
import { formatDelivery } from "@/lib/datetime";
import { ensureWorkSessionForOrder } from "@/lib/work-session";
import { cn } from "@/lib/utils";
import { AddFormulaVersionForm } from "@/components/pilot/WorkSessionWorkspace";
import {
  DashboardComponentCopyForm,
  DashboardComponentNewForm,
} from "@/components/pilot/DashboardComponentCopyForm";
import { CopyWarning, DietaryChips, orderTitle, useOrderDietaryNames } from "./OrderTitle";
import { buttonClass } from "./ui";

/**
 * PRODUCTION > ORDERS 탭(2026-10-22 사용자 요청) — 진행 중인 오더(완료 전) 전체 목록.
 * 여기서 오더에 컴포넌트(TASK)를 지정한다: 기존 컴포넌트 지정 / 기존 컴포넌트를 복사해 새로 만들기(최신 버전 하나만) /
 * WORK SESSION이 없는 오더는 바로 세션 만들기. 컴포넌트가 지정되면 DASHBOARD의 "작업 대기공간"(시간 배정 전)으로 올라간다.
 */
export function ProductionOrdersTab({ completed = false }: { completed?: boolean } = {}) {
  const queryClient = useQueryClient();
  const orders = useQuery(ordersQuery());
  const sessions = useQuery(workSessionsQuery());
  const components = useQuery(dashboardComponentsQuery());
  const blocks = useQuery(workBlocksQuery());
  const [adding, setAdding] = useState<{ orderId: string; slot: CoreSlot } | null>(null);
  const dietaryOf = useOrderDietaryNames();
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"pick" | "copy" | "new">("pick");

  const firstBlockByRow = useMemo(() => {
    const map = new Map<string, { date: string; time: string; count: number }>();
    for (const b of [...(blocks.data ?? [])].sort(
      (a, b) =>
        a.block_date.localeCompare(b.block_date) || a.start_time.localeCompare(b.start_time),
    )) {
      const cur = map.get(b.work_session_formula_version_id);
      if (cur) cur.count += 1;
      else
        map.set(b.work_session_formula_version_id, {
          date: b.block_date,
          time: b.start_time.slice(0, 5),
          count: 1,
        });
    }
    return map;
  }, [blocks.data]);

  const list = useMemo(
    () =>
      buildProductionOrderCards(
        orders.data ?? [],
        components.data ?? [],
        sessions.data ?? [],
        completed,
      ),
    [orders.data, components.data, sessions.data, completed],
  );

  const refresh = async (sessionId?: string) => {
    if (sessionId) {
      await queryClient.invalidateQueries({
        queryKey: ["work_session_formula_versions", sessionId],
      });
      await queryClient.invalidateQueries({ queryKey: ["work_session_tasks", sessionId] });
    }
    await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard_components"] });
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
  };

  const createSession = useMutation({
    mutationFn: async (order: NonNullable<typeof orders.data>[number]) => {
      await ensureWorkSessionForOrder(order.id);
    },
    onSuccess: async (_, order) => {
      setSessionErrors((all) => {
        const next = { ...all };
        delete next[order.id];
        return next;
      });
      await refresh();
    },
    onError: (error, order) =>
      setSessionErrors((all) => ({ ...all, [order.id]: (error as Error).message })),
  });

  // 모든 진행 중 오더는 WORK SESSION을 기본으로 가진다 — 없는 오더가 보이면 자동으로 채운다.
  const ensuredRef = useRef(new Set<string>());
  useEffect(() => {
    if (completed || orders.isError || sessions.isError || !orders.data || !sessions.data) return;
    const missing = orders.data.filter(
      (o) =>
        o.status !== "COMPLETED" &&
        o.status !== "CANCELLED" &&
        !ensuredRef.current.has(o.id) &&
        !sessions.data.some((s) => s.order_id === o.id),
    );
    if (missing.length === 0) return;
    for (const o of missing) ensuredRef.current.add(o.id);
    void (async () => {
      let prepared = false;
      for (const o of missing) {
        try {
          await ensureWorkSessionForOrder(o.id);
          prepared = true;
        } catch (error) {
          setSessionErrors((all) => ({ ...all, [o.id]: (error as Error).message }));
        }
      }
      if (prepared) await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
    })();
  }, [orders.data, sessions.data, queryClient, completed]);

  if (orders.isLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }
  if (orders.isError)
    return (
      <div role="alert" className="space-y-2 text-sm text-destructive">
        주문 목록을 불러오지 못했습니다.{" "}
        <button type="button" className={buttonClass} onClick={() => void orders.refetch()}>
          다시 불러오기
        </button>
      </div>
    );
  if (list.length === 0) {
    return (
      <p className="font-mono text-xs text-muted-foreground">
        {completed ? "완료된 오더가 없어요." : "진행 중인 오더가 없어요."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        {completed
          ? `완료된 오더 ${list.length}개 · 오더가 COMPLETED가 되면 ORDERS에서 자동으로 여기로 옮겨져요.`
          : `진행 중인 오더 ${list.length}개 · 여기서 컴포넌트·레시피·사용 목표·생산 배수를 설정해요. 지정한 항목은 DASHBOARD 작업 대기공간으로 올라가고, Order 상세에는 읽기 전용으로 표시돼요.`}
      </p>
      {(sessions.isError || components.isError || blocks.isError) && (
        <p role="alert" className="text-xs text-destructive">
          주문 카드는 표시했지만 일부 생산 정보를 불러오지 못했습니다.{" "}
          <button type="button" className="underline" onClick={() => void refresh()}>
            생산 정보 재시도
          </button>
        </p>
      )}
      {createSession.isError && (
        <p className="font-mono text-xs text-destructive">
          {(createSession.error as Error).message}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map(({ order, rows, session, ambiguousSession }) => (
          <section key={order.id} className="space-y-2 border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-caps border border-foreground px-1.5 py-0.5 text-[11px]">
                {order.order_number}
              </span>
              <Link
                to="/orders/$orderId"
                params={{ orderId: order.id }}
                className="text-sm underline-offset-2 hover:underline"
              >
                {orderTitle(order.customers?.name, order.products?.name, order.recipient ?? "")}
              </Link>
              <DietaryChips names={dietaryOf(order.id)} />
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {orderStatusLabel(order.status)}
              </span>
              {formatDelivery(order.pickup_at, order.event_date) && (
                <span className="ml-auto font-mono text-[11px]">
                  🚚 {formatDelivery(order.pickup_at, order.event_date)}
                </span>
              )}
            </div>

            <ProductionOrderSizeEditor
              order={order}
              sessionId={session?.id ?? ""}
              readOnly={completed || order.status === "CANCELLED" || ambiguousSession}
            />
            {ambiguousSession && (
              <p role="alert" className="text-xs text-destructive">
                연결된 Work Session이 여러 개입니다. 임의로 선택하지 않았어요. 세션 연결을 먼저
                확인하세요.
              </p>
            )}
            {!session && !ambiguousSession && !completed && order.status !== "CANCELLED" && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={sessionErrors[order.id] ? "text-destructive" : "text-muted-foreground"}
                >
                  {sessionErrors[order.id]
                    ? `생산 준비 실패: ${sessionErrors[order.id]}`
                    : sessions.isLoading
                      ? "생산 정보를 불러오는 중…"
                      : "생산 준비 중 · 주문은 목록에 유지됩니다."}
                </span>
                {!sessions.isLoading && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={createSession.isPending}
                    onClick={() => createSession.mutate(order)}
                  >
                    생산 준비 재시도
                  </button>
                )}
              </div>
            )}
            <ProductionOrderComponentList
              sessionId={session?.id ?? ""}
              dashboardRows={rows}
              firstBlockByRow={firstBlockByRow}
              readOnly={completed || order.status === "CANCELLED"}
            />

            {/* 슬롯 버튼은 세션 유무와 상관없이 항상 — 세션이 없으면 누르는 순간 자동으로 만든다 */}
            <div
              className={cn("space-y-1.5", (completed || order.status === "CANCELLED") && "hidden")}
            >
              <div className="flex flex-wrap gap-1">
                {CORE_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={cn(
                      buttonClass,
                      "!min-h-[26px] px-1.5 text-[11px]",
                      adding?.orderId === order.id && adding.slot === slot && "bg-secondary",
                    )}
                    disabled={
                      createSession.isPending ||
                      ambiguousSession ||
                      sessions.isError ||
                      sessions.isLoading
                    }
                    onClick={async () => {
                      if (adding?.orderId === order.id && adding.slot === slot) {
                        setAdding(null);
                        return;
                      }
                      if (!session) {
                        try {
                          await createSession.mutateAsync(order);
                        } catch {
                          return;
                        }
                      }
                      setAdding({ orderId: order.id, slot });
                    }}
                  >
                    + {CORE_SLOT_LABELS[slot].toUpperCase()}
                  </button>
                ))}
              </div>
              {adding?.orderId === order.id && (
                <div className="flex gap-1">
                  {(["pick", "copy", "new"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={cn(
                        buttonClass,
                        "!min-h-[24px] px-1.5 text-[10px]",
                        mode === m && "bg-secondary",
                      )}
                      onClick={() => setMode(m)}
                    >
                      {m === "pick"
                        ? "기존 컴포넌트 지정"
                        : m === "copy"
                          ? "복사해서 새로 만들기"
                          : "빈 컴포넌트 새로 만들기"}
                    </button>
                  ))}
                </div>
              )}
              {session && adding?.orderId === order.id && mode === "new" && (
                <DashboardComponentNewForm
                  key={`new-${adding.slot}`}
                  sessionId={session.id}
                  slot={adding.slot}
                  nextSort={rows.length}
                  onDone={async () => {
                    setAdding(null);
                    await refresh(session.id);
                  }}
                />
              )}
              {session && adding?.orderId === order.id && mode === "copy" && (
                <DashboardComponentCopyForm
                  key={`copy-${adding.slot}`}
                  sessionId={session.id}
                  slot={adding.slot}
                  nextSort={rows.length}
                  onDone={async () => {
                    setAdding(null);
                    await refresh(session.id);
                  }}
                />
              )}
              {session && adding?.orderId === order.id && mode === "pick" && (
                <AddFormulaVersionForm
                  key={adding.slot}
                  sessionId={session.id}
                  nextSort={rows.length}
                  kind="CORE"
                  slot={adding.slot}
                  productId={session.product_id}
                  productSizeId={session.product_size_id}
                  onDone={async () => {
                    setAdding(null);
                    await refresh(session.id);
                  }}
                />
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProductionOrderComponentList({
  sessionId,
  dashboardRows,
  firstBlockByRow,
  readOnly,
}: {
  sessionId: string;
  dashboardRows: DashboardComponentRow[];
  firstBlockByRow: Map<string, { date: string; time: string; count: number }>;
  readOnly: boolean;
}) {
  const selections = useQuery(workSessionFormulaVersionsQuery(sessionId));
  if (!sessionId) return null;
  if (selections.isLoading)
    return <p className="text-xs text-muted-foreground">컴포넌트 불러오는 중…</p>;
  if (selections.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        컴포넌트를 불러오지 못했습니다.{" "}
        <button type="button" className="underline" onClick={() => void selections.refetch()}>
          재시도
        </button>
      </p>
    );
  const rows = (selections.data ?? []).filter((r) => r.kind === "CORE");
  if (!rows.length)
    return <p className="text-xs text-muted-foreground">컴포넌트 미지정 · 아래에서 추가하세요.</p>;
  return (
    <ul className="divide-y divide-border border border-border">
      {rows.map((r) => (
        <ProductionOrderComponentItem
          key={r.id}
          row={r}
          dashboardRow={dashboardRows.find((d) => d.id === r.id)}
          block={firstBlockByRow.get(r.id)}
          readOnly={readOnly}
        />
      ))}
    </ul>
  );
}

function ProductionOrderComponentItem({
  row,
  dashboardRow,
  block,
  readOnly,
}: {
  row: import("@/lib/queries").WorkSessionFormulaVersionRow;
  dashboardRow: DashboardComponentRow | undefined;
  block: { date: string; time: string; count: number } | undefined;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const [removeWarning, setRemoveWarning] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => removePlannedComponent(row),
    onSuccess: (warning) => {
      setRemoveWarning(warning);
      if (warning) toast.error(warning);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => {
      void invalidateProductionSync(client);
    },
  });
  return (
    <li className="px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps text-[10px] text-muted-foreground">{row.slot ?? "CORE"}</span>
        <span className="min-w-0 flex-1 text-sm">
          {row.formula_versions.formulas.components?.name ?? row.formula_versions.formulas.name}
        </span>
        {dashboardRow?.unmodifiedCopy && <CopyWarning formulaId={dashboardRow.formulaId} />}
        <span className="font-mono text-[10px] text-muted-foreground">
          {block
            ? `${block.date.slice(5)} ${block.time}${block.count > 1 ? ` +${block.count - 1}` : ""}`
            : "시간 미배정"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <ComponentPlanReadout row={row} />
        {!readOnly && (
          <button
            type="button"
            aria-expanded={expanded}
            className="ml-auto underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "설정 닫기" : "레시피·수량 설정"}
          </button>
        )}
      </div>
      {expanded && !readOnly && (
        <div className="space-y-2">
          <OrderComponentPlanRow row={row} allowFormulaChange />
          <button
            type="button"
            className={buttonClass + " text-xs text-destructive"}
            disabled={remove.isPending}
            onClick={() => {
              if (
                confirm(
                  `이 주문의 ${row.formula_versions.formulas.components?.name ?? row.formula_versions.formulas.name} 지정을 삭제할까요? 예정 블록도 제거되며 원본 레시피는 유지됩니다.`,
                )
              )
                remove.mutate();
            }}
          >
            {remove.isPending ? "삭제 중…" : "이 주문에서 컴포넌트 삭제"}
          </button>
          {(remove.isError || removeWarning) && (
            <p role="alert" className="text-xs text-destructive">
              {remove.error?.message ?? removeWarning}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
