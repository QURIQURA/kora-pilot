import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  ordersQuery,
  pilotSettingsQuery,
  orderStatusLabel,
  orderStatusColor,
  ORDER_STATUSES,
  type OrderListRow,
  type OrderStatus,
} from "@/lib/queries";
import { toLocalDateString } from "@/lib/datetime";
import { readableTextColor } from "@/lib/pilot";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader, primaryButtonClass, buttonClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "PILOT — Orders" },
      { name: "description", content: "SHCS orders" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const orders = useQuery(ordersQuery());
  const settings = useQuery(pilotSettingsQuery());
  const statusColors = (settings.data?.order_status_colors as Record<string, string> | null) ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"LIST" | "CALENDAR">("LIST");

  // New Order는 아무 정보 없이도 즉시 생성된다 — 주문번호만 자동 발급되고 나머지는
  // 상세 페이지에서 천천히 채운다(DM 놓치지 않는 게 목적이라, 입력을 막으면 안 됨).
  const createOrder = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      // order_number는 DB 트리거(set_order_number)가 자동 발급 — 여기서 넘기지 않는다.
      const { data, error } = await supabase
        .from("orders")
        .insert({ user_id: userId } as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      void navigate({ to: "/orders/$orderId", params: { orderId: id } });
    },
  });

  // 2026-10-06 사용자 요청: ORDERS LIST에서 Order Detail을 열지 않고도 Status를 바로 바꿀 수
  // 있게 — 행의 STATUS 배지 자체를 Dropdown으로 만들고, 여기서 바로 업데이트한다.
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  // 2026-10-06 사용자 요청: PICK UP/DELIVERY 날짜 역순(최신 날짜가 위) — pickup_at 있으면
  // 그걸, 없으면 event_date, 둘 다 없으면 맨 뒤로(날짜 없는 건 역순 기준이 없으므로 그대로 둠).
  const rows = useMemo(() => {
    const list = [...(orders.data ?? [])];
    const keyOf = (o: OrderListRow) => o.pickup_at ?? (o.event_date ? `${o.event_date}T00:00:00` : null);
    list.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka && kb) return kb.localeCompare(ka);
      if (ka) return -1;
      if (kb) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
    return list;
  }, [orders.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="ORDERS"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => setView((v) => (v === "LIST" ? "CALENDAR" : "LIST"))}
            >
              {view === "LIST" ? "CALENDAR VIEW" : "LIST VIEW"}
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={createOrder.isPending}
              onClick={() => createOrder.mutate()}
            >
              + NEW ORDER
            </button>
          </div>
        }
      />

      {orders.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          message="NO ORDERS YET"
          actionLabel="+ NEW ORDER"
          onAction={() => createOrder.mutate()}
        />
      ) : view === "LIST" ? (
        <OrdersTable
          rows={rows}
          statusColors={statusColors}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
        />
      ) : (
        <OrdersCalendar rows={rows} />
      )}
    </div>
  );
}

function OrdersTable({
  rows,
  statusColors,
  onStatusChange,
}: {
  rows: OrderListRow[];
  statusColors: Record<string, string> | null;
  onStatusChange: (id: string, status: OrderStatus) => void;
}) {
  return (
    <div className="border border-border bg-card">
      {/* 2026-10-06 사용자 요청: 열 간격을 내용 길이에 맞춰 재배분 — ORDER는 짧으니 줄이고,
          DATE/PRODUCT처럼 긴 텍스트가 많은 열에 더 넓게 배정. STATUS도 "FINAL TOUCH"처럼
          긴 라벨이 생겨서 한 칸 늘림. gap도 늘려서 옆 열과 안 붙어 보이게. */}
      <div className="hidden items-center border-b border-border py-2 md:flex">
        <div className="grid flex-1 grid-cols-12 gap-x-4 gap-y-1 px-3">
          <span className="label-caps col-span-1 text-xs text-muted-foreground">ORDER</span>
          <span className="label-caps col-span-2 text-xs text-muted-foreground">CUSTOMER</span>
          <span className="label-caps col-span-2 text-xs text-muted-foreground">RECIPIENT</span>
          <span className="label-caps col-span-1 text-xs text-muted-foreground">OCCASION</span>
          <span className="label-caps col-span-2 text-xs text-muted-foreground">DATE</span>
          <span className="label-caps col-span-2 text-xs text-muted-foreground">PRODUCT</span>
          <span className="label-caps col-span-2 text-xs text-muted-foreground">STATUS</span>
        </div>
      </div>
      <ul>
        {rows.map((o) => (
          <li key={o.id} className="border-b border-border last:border-b-0">
            <Link
              to="/orders/$orderId"
              params={{ orderId: o.id }}
              className="grid grid-cols-1 gap-1 px-3 py-3 hover:bg-secondary md:grid-cols-12 md:items-center md:gap-x-4 md:gap-y-1"
            >
              <span className="col-span-1 truncate font-mono text-sm">{o.order_number}</span>
              <span className="col-span-2 text-sm">{o.customers?.name || o.requester_legacy || "—"}</span>
              <span className="col-span-2 text-sm">{o.recipient || "—"}</span>
              <span className="col-span-1 text-sm text-muted-foreground">{o.occasion || "—"}</span>
              <span className="col-span-2 font-mono text-xs text-muted-foreground">
                {o.pickup_at
                  ? new Date(o.pickup_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })
                  : o.event_date || "—"}
              </span>
              <span className="col-span-2 text-sm text-muted-foreground">
                {o.products?.name || (
                  // 2026-10-06 사용자 요청: 행 전체를 칠하면 미감이 안 좋다 — PRODUCT CATEGORY의
                  // 색상 배지(CategoryBadge)처럼 TBD 텍스트에만 작은 배지로 강조.
                  <span className="label-caps inline-block bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground">
                    TBD
                  </span>
                )}
              </span>
              <span className="col-span-2">
                <StatusSelect
                  status={o.status}
                  color={orderStatusColor(statusColors, o.status)}
                  onChange={(status) => onStatusChange(o.id, status)}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 2026-10-06 사용자 요청: ORDERS LIST에서 바로 Status를 바꿀 수 있게 — 기존 색상 배지(StatusChip)를
// <select>로 바꿔 한눈에 보이는 색상은 그대로 유지하면서 클릭 한 번으로 변경 가능하게 했다.
// 행 전체가 Link라 클릭이 상세 페이지로 이동시키는데, select 조작은 stopPropagation으로 막아서
// 상세 페이지를 열지 않고도 이 자리에서 바로 저장된다(색상은 orderStatusColor() 공통 로직 재사용).
function StatusSelect({
  status,
  color,
  onChange,
}: {
  status: string;
  color: string;
  onChange: (status: OrderStatus) => void;
}) {
  return (
    <select
      className="label-caps inline-block cursor-pointer border-0 px-2 py-0.5 text-[11px] outline-none"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
      value={status}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value as OrderStatus);
      }}
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {orderStatusLabel(s)}
        </option>
      ))}
    </select>
  );
}

/** 간단한 월간 캘린더 — pickup_at 없으면 event_date 기준으로 날짜 칸에 주문을 배치한다. */
function OrdersCalendar({ rows }: { rows: OrderListRow[] }) {
  const today = toLocalDateString();
  const [monthCursor, setMonthCursor] = useState(() => today.slice(0, 7)); // "YYYY-MM"

  const byDate = useMemo(() => {
    const map = new Map<string, OrderListRow[]>();
    for (const o of rows) {
      const date = o.pickup_at ? o.pickup_at.slice(0, 10) : o.event_date;
      if (!date) continue;
      const list = map.get(date) ?? [];
      list.push(o);
      map.set(date, list);
    }
    return map;
  }, [rows]);

  const [yearStr, monthStr] = monthCursor.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // 2026-10-06 사용자 요청: 캘린더 시작요일을 월요일로 — getDay()는 0=Sun 기준이라
  // 월요일을 0으로 다시 맞춘다(0=Mon … 6=Sun).
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, "0");
      const m = String(month).padStart(2, "0");
      return `${year}-${m}-${d}`;
    }),
  ];

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonthCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className={buttonClass} onClick={() => shiftMonth(-1)}>
          ← PREV
        </button>
        <span className="label-caps">{monthCursor}</span>
        <button type="button" className={buttonClass} onClick={() => shiftMonth(1)}>
          NEXT →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
          <div key={d} className="bg-card px-1 py-1 text-center text-[10px] text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((date, i) => (
          <div key={i} className="min-h-[72px] bg-card p-1">
            {date && (
              <>
                <span
                  className={`font-mono text-[11px] ${date === today ? "font-bold text-foreground" : "text-muted-foreground"}`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                <ul className="mt-1 space-y-0.5">
                  {(byDate.get(date) ?? []).map((o) => (
                    <li key={o.id}>
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="block truncate border border-border px-1 text-[10px] hover:bg-secondary"
                        title={`${o.order_number} ${o.customers?.name ?? ""}`}
                      >
                        {o.order_number}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
