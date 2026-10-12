import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
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
  type OrderStatus,
  type OrderListRow,
} from "@/lib/queries";
import { toLocalDateString } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader, primaryButtonClass, buttonClass, selectClass } from "@/components/pilot/ui";

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
        <OrdersTable rows={rows} statusColors={statusColors} />
      ) : (
        <OrdersCalendar rows={rows} />
      )}
    </div>
  );
}

type ColumnKey = "order" | "customer" | "recipient" | "occasion" | "date" | "product" | "status";

// 2026-10-06 사용자 요청: 열 간격을 내용 길이에 맞춰 재배분 — ORDER는 짧으니 줄이고,
// DATE/PRODUCT처럼 긴 텍스트가 많은 열에 더 넓게 배정. STATUS도 "FINAL TOUCH"처럼
// 긴 라벨이 생겨서 한 칸 늘림. gap도 늘려서 옆 열과 안 붙어 보이게.
const COLUMN_LABELS: Record<ColumnKey, string> = {
  order: "ORDER",
  customer: "CUSTOMER",
  recipient: "RECIPIENT",
  occasion: "OCCASION",
  date: "DATE",
  product: "PRODUCT",
  status: "STATUS",
};
const COLUMN_SPANS: Record<ColumnKey, string> = {
  order: "col-span-1",
  customer: "col-span-2",
  recipient: "col-span-2",
  occasion: "col-span-1",
  date: "col-span-2",
  product: "col-span-2",
  status: "col-span-2",
};
const DEFAULT_COLUMN_ORDER: ColumnKey[] = ["order", "customer", "recipient", "occasion", "date", "product", "status"];
const COLUMN_ORDER_STORAGE_KEY = "kora-pilot:orders-column-order";

function loadColumnOrder(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    const parsed = JSON.parse(raw) as string[];
    // 저장된 값에 알 수 없는 키가 섞여있거나(과거 버전) 새 컬럼이 추가된 경우를 대비해,
    // DEFAULT_COLUMN_ORDER와 대조해서 유효한 키만 남기고 빠진 키는 뒤에 보충한다.
    const valid = parsed.filter((k): k is ColumnKey => (DEFAULT_COLUMN_ORDER as string[]).includes(k));
    const missing = DEFAULT_COLUMN_ORDER.filter((k) => !valid.includes(k));
    return [...valid, ...missing];
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
}

/** 컬럼 드래그 순서 — 브라우저(localStorage)에만 저장되는 개인 화면 설정이라 DB엔 안 남긴다. */
function useColumnOrder() {
  const [order, setOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  useEffect(() => {
    setOrder(loadColumnOrder());
  }, []);
  const reorder = (dragKey: ColumnKey, dropKey: ColumnKey) => {
    if (dragKey === dropKey) return;
    setOrder((prev) => {
      const next = prev.filter((k) => k !== dragKey);
      const dropIdx = next.indexOf(dropKey);
      next.splice(dropIdx, 0, dragKey);
      try {
        localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패해도(프라이빗 모드 등) 화면 표시는 그대로 유지 — 조용히 무시.
      }
      return next;
    });
  };
  return { order, reorder };
}

function OrdersTable({
  rows,
  statusColors,
}: {
  rows: OrderListRow[];
  statusColors: Record<string, string> | null;
}) {
  const { order: columnOrder, reorder } = useColumnOrder();
  const [draggingKey, setDraggingKey] = useState<ColumnKey | null>(null);

  return (
    <div className="border border-border bg-card">
      <div className="hidden items-center border-b border-border py-2 md:flex">
        <div className="grid flex-1 grid-cols-12 gap-x-4 gap-y-1 px-3">
          {columnOrder.map((key) => (
            <span
              key={key}
              draggable
              onDragStart={() => setDraggingKey(key)}
              onDragEnd={() => setDraggingKey(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingKey) reorder(draggingKey, key);
                setDraggingKey(null);
              }}
              title="드래그해서 열 순서 변경"
              className={`label-caps ${COLUMN_SPANS[key]} flex cursor-grab items-center gap-1 text-xs text-muted-foreground active:cursor-grabbing ${draggingKey === key ? "opacity-40" : ""}`}
            >
              <GripVertical size={10} className="shrink-0 opacity-50" />
              {COLUMN_LABELS[key]}
            </span>
          ))}
        </div>
      </div>
      <ul>
        {rows.map((o) => (
          <OrderRow key={o.id} order={o} statusColors={statusColors} columnOrder={columnOrder} />
        ))}
      </ul>
    </div>
  );
}

// 2026-10-06 사용자 재요청: 목록에서 STATUS를 색상 배지로만 보여주면 바꾸려고 누를 때마다
// 매번 ORDER DETAIL로 들어가야 했음(행 전체가 Link라 배지를 눌러도 그냥 이동만 됨) — 이제
// 목록에서 바로 드롭다운으로 상태를 바꿀 수 있다. 행 전체를 <a>로 감싸면 그 안에 <select>를
// 넣는 게 유효하지 않은 HTML이라(클릭 버블링도 꼬임), 행을 Link 대신 onClick 네비게이션으로
// 바꾸고 STATUS 드롭다운 쪽만 stopPropagation으로 분리했다.
function OrderRow({
  order: o,
  statusColors,
  columnOrder,
}: {
  order: OrderListRow;
  statusColors: Record<string, string> | null;
  columnOrder: ColumnKey[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const cells: Record<ColumnKey, ReactNode> = {
    order: <span className="truncate font-mono text-sm">{o.order_number}</span>,
    customer: <span className="text-sm">{o.customers?.name || o.requester_legacy || "—"}</span>,
    recipient: <span className="text-sm">{o.recipient || "—"}</span>,
    occasion: <span className="text-sm text-muted-foreground">{o.occasion || "—"}</span>,
    date: (
      <span className="font-mono text-xs text-muted-foreground">
        {o.pickup_at
          ? new Date(o.pickup_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })
          : o.event_date || "—"}
      </span>
    ),
    product: (
      <span className="text-sm text-muted-foreground">
        {o.products?.name || (
          // 2026-10-06 사용자 요청: 행 전체를 칠하면 미감이 안 좋다 — PRODUCT CATEGORY의
          // 색상 배지(CategoryBadge)처럼 TBD 텍스트에만 작은 배지로 강조.
          <span className="label-caps inline-block bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground">
            TBD
          </span>
        )}
      </span>
    ),
    status: (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: orderStatusColor(statusColors, o.status) }}
          aria-hidden
        />
        <select
          className={`${selectClass} !w-auto !min-h-0 border-none bg-transparent px-1 py-0.5 text-[11px]`}
          value={o.status}
          disabled={updateStatus.isPending}
          onChange={(e) => updateStatus.mutate(e.target.value as OrderStatus)}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>
    ),
  };

  return (
    <li className="border-b border-border last:border-b-0">
      <div
        role="link"
        tabIndex={0}
        onClick={() => void navigate({ to: "/orders/$orderId", params: { orderId: o.id } })}
        onKeyDown={(e) => {
          if (e.key === "Enter") void navigate({ to: "/orders/$orderId", params: { orderId: o.id } });
        }}
        className="grid grid-cols-1 gap-1 px-3 py-3 hover:bg-secondary cursor-pointer md:grid-cols-12 md:items-center md:gap-x-4 md:gap-y-1"
      >
        {columnOrder.map((key) => (
          <span key={key} className={COLUMN_SPANS[key]}>
            {cells[key]}
          </span>
        ))}
      </div>
    </li>
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
