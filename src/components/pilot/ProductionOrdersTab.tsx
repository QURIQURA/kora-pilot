import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CORE_SLOTS,
  CORE_SLOT_LABELS,
  currentUserId,
  dashboardComponentsQuery,
  orderStatusLabel,
  ordersQuery,
  workBlocksQuery,
  workSessionsQuery,
  type CoreSlot,
  type DashboardComponentRow,
} from "@/lib/queries";
import { formatDelivery, generateTitle } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { AddFormulaVersionForm } from "@/components/pilot/WorkSessionWorkspace";
import { DashboardComponentCopyForm } from "@/components/pilot/DashboardComponentCopyForm";
import { DietaryChips, orderTitle, useOrderDietaryNames } from "./OrderTitle";
import { buttonClass } from "./ui";

/**
 * PRODUCTION > ORDERS 탭(2026-10-22 사용자 요청) — 진행 중인 오더(완료 전) 전체 목록.
 * 여기서 오더에 컴포넌트(TASK)를 지정한다: 기존 컴포넌트 지정 / 기존 컴포넌트를 복사해 새로 만들기(최신 버전 하나만) /
 * WORK SESSION이 없는 오더는 바로 세션 만들기. 컴포넌트가 지정되면 DASHBOARD의 "작업 대기공간"(시간 배정 전)으로 올라간다.
 */
export function ProductionOrdersTab() {
  const queryClient = useQueryClient();
  const orders = useQuery(ordersQuery());
  const sessions = useQuery(workSessionsQuery());
  const components = useQuery(dashboardComponentsQuery());
  const blocks = useQuery(workBlocksQuery());
  const [adding, setAdding] = useState<{ orderId: string; slot: CoreSlot } | null>(null);
  const dietaryOf = useOrderDietaryNames();
  const [mode, setMode] = useState<"pick" | "copy">("pick");

  const rowsByOrder = useMemo(() => {
    const map = new Map<string, DashboardComponentRow[]>();
    for (const r of components.data ?? []) {
      const list = map.get(r.order.id) ?? [];
      list.push(r);
      map.set(r.order.id, list);
    }
    return map;
  }, [components.data]);
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
      (orders.data ?? [])
        .filter((o) => o.status !== "COMPLETED")
        .map((o) => ({
          order: o,
          rows: rowsByOrder.get(o.id) ?? [],
          session:
            (sessions.data ?? []).find((s) => s.order_id === o.id && s.status !== "CANCELLED") ??
            null,
        }))
        // 컴포넌트가 아직 없는 오더를 위에(지정이 필요한 것부터), 그 다음 오더 번호순
        .sort(
          (a, b) =>
            Number(a.rows.length > 0) - Number(b.rows.length > 0) ||
            a.order.order_number.localeCompare(b.order.order_number),
        ),
    [orders.data, rowsByOrder, sessions.data],
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
      const userId = await currentUserId();
      const delivery = order.pickup_at ? order.pickup_at.slice(0, 10) : order.event_date;
      const baseName = order.products?.name || order.recipient || order.order_number;
      const { error } = await supabase.from("work_sessions").insert({
        user_id: userId,
        order_id: order.id,
        name: generateTitle(baseName, delivery),
        status: "PLANNED",
        product_id: order.product_id,
        product_size_id: order.product_size_id,
        cake_size_id: order.cake_size_id,
      });
      if (error) throw error;
    },
    onSuccess: () => refresh(),
  });

  if (orders.isLoading || components.isLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }
  if (list.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">진행 중인 오더가 없어요.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        진행 중인 오더 {list.length}개 · 여기서 컴포넌트를 지정하면 DASHBOARD의 작업 대기공간(시간
        배정 전)으로 올라가요.
      </p>
      {createSession.isError && (
        <p className="font-mono text-xs text-destructive">
          {(createSession.error as Error).message}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map(({ order, rows, session }) => (
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

            {rows.length === 0 ? (
              <p className="font-mono text-[11px] text-destructive">컴포넌트 미지정</p>
            ) : (
              <ul className="divide-y divide-border border border-border">
                {rows.map((r) => {
                  const b = firstBlockByRow.get(r.id);
                  return (
                    <li key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">
                        {r.slot ?? "CORE"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.componentName}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {b
                          ? `${b.date.slice(5)} ${b.time}${b.count > 1 ? ` +${b.count - 1}` : ""}`
                          : "시간 미배정"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {session ? (
              <div className="space-y-1.5">
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
                      onClick={() =>
                        setAdding(
                          adding?.orderId === order.id && adding.slot === slot
                            ? null
                            : { orderId: order.id, slot },
                        )
                      }
                    >
                      + {CORE_SLOT_LABELS[slot].toUpperCase()}
                    </button>
                  ))}
                </div>
                {adding?.orderId === order.id && (
                  <div className="flex gap-1">
                    {(["pick", "copy"] as const).map((m) => (
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
                        {m === "pick" ? "기존 컴포넌트 지정" : "복사해서 새로 만들기"}
                      </button>
                    ))}
                  </div>
                )}
                {adding?.orderId === order.id && mode === "copy" && (
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
                {adding?.orderId === order.id && mode === "pick" && (
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
            ) : (
              <button
                type="button"
                className={cn(buttonClass, "!min-h-[26px] px-1.5 text-[11px]")}
                disabled={createSession.isPending}
                onClick={() => createSession.mutate(order)}
              >
                + WORK SESSION 만들기
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
