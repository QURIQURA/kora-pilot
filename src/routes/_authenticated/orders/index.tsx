import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { GripVertical, Flame } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  ordersQuery,
  cakeSizesQuery,
  dietaryTagsQuery,
  orderDietaryTagLinksQuery,
  pilotSettingsQuery,
  orderStatusLabel,
  orderStatusColor,
  ORDER_STATUSES,
  ORDER_RECIPIENT_RELATIONSHIP_OPTIONS,
  type OrderStatus,
  type OrderListRow,
} from "@/lib/queries";
import { toLocalDateString, koreanWeekdayShort } from "@/lib/datetime";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader, primaryButtonClass, buttonClass, selectClass } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [{ title: "PILOT — Orders" }, { name: "description", content: "SHCS orders" }],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const orders = useQuery(ordersQuery());
  const settings = useQuery(pilotSettingsQuery());
  const statusColors =
    (settings.data?.order_status_colors as Record<string, string> | null) ?? null;
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
    const keyOf = (o: OrderListRow) =>
      o.pickup_at ?? (o.event_date ? `${o.event_date}T00:00:00` : null);
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

type ColumnKey =
  "order" | "customer" | "recipient" | "occasion" | "dietary" | "date" | "product" | "cake_size" | "status";

// 2026-10-06 사용자 요청: 열 간격을 내용 길이에 맞춰 재배분 — ORDER는 짧으니 줄이고,
// DATE/PRODUCT처럼 긴 텍스트가 많은 열에 더 넓게 배정. STATUS도 "FINAL TOUCH"처럼
// 긴 라벨이 생겨서 한 칸 늘림. gap도 늘려서 옆 열과 안 붙어 보이게.
// 2026-10-12 사용자 요청: CAKE SIZE 열 추가(orders.cake_size — 주문 상세에 이미 있던 필드).
// 2026-10-12 사용자 재요청: 요일이 붙으니 DATE가 줄바꿈됨 — "칼럼 사이즈를 사용자가 직접
// 바꿀 수 있고 바꾼 대로 저장"되길 원해서, Tailwind의 고정 col-span 방식(12칸 분할)을
// 버리고 픽셀 단위 너비(DEFAULT_COLUMN_WIDTHS) + 드래그 리사이즈로 교체했다. 순서(ORDER)와
// 마찬가지로 너비도 브라우저 localStorage에만 저장되는 개인 화면 설정이라 DB엔 안 남긴다.
const COLUMN_LABELS: Record<ColumnKey, string> = {
  order: "ORDER",
  customer: "CUSTOMER",
  recipient: "RECIPIENT",
  occasion: "OCCASION",
  dietary: "DIETARY REQUIREMENT",
  date: "DATE",
  product: "PRODUCT",
  cake_size: "CAKE SIZE",
  status: "STATUS",
};
const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  order: 90,
  customer: 150,
  recipient: 110,
  occasion: 100,
  dietary: 170,
  date: 190,
  product: 150,
  cake_size: 100,
  status: 150,
};
const MIN_COLUMN_WIDTH = 60;
const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  "order",
  "customer",
  "recipient",
  "occasion",
  "dietary",
  "date",
  "product",
  "cake_size",
  "status",
];
const COLUMN_ORDER_STORAGE_KEY = "kora-pilot:orders-column-order";
const COLUMN_WIDTHS_STORAGE_KEY = "kora-pilot:orders-column-widths";

function loadColumnOrder(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    const parsed = JSON.parse(raw) as string[];
    // 저장된 값에 알 수 없는 키가 섞여있거나(과거 버전) 새 컬럼이 추가된 경우를 대비해,
    // DEFAULT_COLUMN_ORDER와 대조해서 유효한 키만 남기고 빠진 키는 뒤에 보충한다.
    const valid = parsed.filter((k): k is ColumnKey =>
      (DEFAULT_COLUMN_ORDER as string[]).includes(k),
    );
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

function loadColumnWidths(): Record<ColumnKey, number> {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, number>>;
    const next = { ...DEFAULT_COLUMN_WIDTHS };
    for (const key of DEFAULT_COLUMN_ORDER) {
      const v = parsed[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= MIN_COLUMN_WIDTH) next[key] = v;
    }
    return next;
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

/** 컬럼 너비(드래그 리사이즈) — 순서와 마찬가지로 localStorage에만 저장. */
function useColumnWidths() {
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);
  useEffect(() => {
    setWidths(loadColumnWidths());
  }, []);
  const setWidth = (key: ColumnKey, px: number) => {
    setWidths((prev) => {
      const next = { ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(px)) };
      try {
        localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패해도(프라이빗 모드 등) 화면 표시는 그대로 유지 — 조용히 무시.
      }
      return next;
    });
  };
  return { widths, setWidth };
}

/** 뷰포트가 md(768px) 이상인지 — 그 미만에서는 행이 1열로 쌓이는 모바일 레이아웃이라
 * 픽셀 그리드 템플릿을 적용하지 않는다. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

/** 리사이즈 핸들 — 헤더 셀 오른쪽 가장자리의 드래그 바. 드래그 중엔 커서 이동량만큼
 * 실시간으로 onResize(미리보기)를 호출하고, 떼는 순간 onResizeEnd(저장)를 호출한다. */
function ColumnResizeHandle({
  startWidth,
  onResize,
  onResizeEnd,
}: {
  startWidth: number;
  onResize: (px: number) => void;
  onResizeEnd: (px: number) => void;
}) {
  const onMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let latest = startWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      latest = startWidth + (moveEvent.clientX - startX);
      onResize(Math.max(MIN_COLUMN_WIDTH, latest));
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onResizeEnd(Math.max(MIN_COLUMN_WIDTH, latest));
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="드래그해서 열 너비 변경"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
      className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize select-none"
    >
      <span className="mx-auto block h-full w-px bg-border hover:bg-foreground/40" />
    </span>
  );
}

function OrdersTable({
  rows,
  statusColors,
}: {
  rows: OrderListRow[];
  statusColors: Record<string, string> | null;
}) {
  const { order: columnOrder, reorder } = useColumnOrder();
  const { widths: columnWidths, setWidth } = useColumnWidths();
  const [draggingKey, setDraggingKey] = useState<ColumnKey | null>(null);
  // 리사이즈 드래그 중엔 로컬 state만 바꿔 매끄럽게 미리보이고(저장은 떼는 순간 한 번만),
  // 드래그 중이 아닐 땐 저장된 폭(columnWidths)을 그대로 쓴다.
  const [previewWidths, setPreviewWidths] = useState<Record<ColumnKey, number> | null>(null);
  const isDesktop = useIsDesktop();

  const effectiveWidths = previewWidths ?? columnWidths;
  const gridTemplateColumns = isDesktop
    ? columnOrder.map((key) => `${effectiveWidths[key]}px`).join(" ")
    : undefined;

  return (
    <div className="overflow-x-auto border border-border bg-card">
      <div className="hidden items-center border-b border-border py-2 md:flex">
        <div className="grid flex-1 gap-x-4 gap-y-1 px-3" style={{ gridTemplateColumns }}>
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
              className={`label-caps relative flex cursor-grab items-center gap-1 text-xs text-muted-foreground active:cursor-grabbing ${draggingKey === key ? "opacity-40" : ""}`}
            >
              <GripVertical size={10} className="shrink-0 opacity-50" />
              <span className="truncate">{COLUMN_LABELS[key]}</span>
              <ColumnResizeHandle
                startWidth={effectiveWidths[key]}
                onResize={(px) => setPreviewWidths({ ...effectiveWidths, [key]: px })}
                onResizeEnd={(px) => {
                  setWidth(key, px);
                  setPreviewWidths(null);
                }}
              />
            </span>
          ))}
        </div>
      </div>
      <ul>
        {rows.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            statusColors={statusColors}
            columnOrder={columnOrder}
            gridTemplateColumns={gridTemplateColumns}
          />
        ))}
      </ul>
    </div>
  );
}

// 2026-10-06 사용자 재요청: 목록에서 STATUS를 색상 배지로만 보여주면 바꾸려고 누를 때마다
// 매번 ORDER DETAIL로 들어가야 했음(행 전체가 Link라 배지를 눌러도 그냥 이동만 됨) — 이제
// 목록에서 바로 드롭다운으로 상태를 바꿀 수 있다. 행 전체를 <a>로 감싸면 그 안에 <select>를
// 넣는 게 유효하지 않은 HTML이라(클릭 버블링도 꼬였다), 행을 Link 대신 onClick 네비게이션으로
// 바꾸고 STATUS 드롭다운 쪽만 stopPropagation으로 분리했다.
// 2026-10-15 사용자 요청: "지금 진행중인 오더를 하이라이트" — STATUS 값(DESIGN/PRODUCTION
// 등)으로 자동 판정하지 않고, "리스트에서 직접 선택할 수 있게" 해달라는 사용자 피드백에 따라
// orders.is_in_progress 불리언 컬럼을 추가해 ORDER 번호 옆 불꽃 아이콘을 클릭하면 수동으로
// on/off 토글한다. 켜진 행은 왼쪽 강조 바 + 은은한 배경 틴트로 다른 오더와 구분된다.
function OrderRow({
  order: o,
  statusColors,
  columnOrder,
  gridTemplateColumns,
}: {
  order: OrderListRow;
  statusColors: Record<string, string> | null;
  columnOrder: ColumnKey[];
  gridTemplateColumns: string | undefined;
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

  const toggleInProgress = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({ is_in_progress: !o.is_in_progress })
        .eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const dietaryTags = useQuery(dietaryTagsQuery());
  const dietaryLinks = useQuery(orderDietaryTagLinksQuery());
  const orderTagNames = (dietaryLinks.data ?? [])
    .filter((l) => l.order_id === o.id)
    .map((l) => (dietaryTags.data ?? []).find((t) => t.id === l.dietary_tag_id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => t.name);

  const cakeSizes = useQuery(cakeSizesQuery());
  const cakeSizeName = o.cake_size_id
    ? (cakeSizes.data ?? []).find((c) => c.id === o.cake_size_id)?.name
    : undefined;

  const cells: Record<ColumnKey, ReactNode> = {
    order: (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          title={o.is_in_progress ? "진행중 표시 해제" : "진행중으로 표시"}
          disabled={toggleInProgress.isPending}
          onClick={(e) => {
            e.stopPropagation();
            toggleInProgress.mutate();
          }}
          className={cn(
            "shrink-0 rounded-full p-0.5 transition-colors",
            o.is_in_progress
              ? "text-amber-500"
              : "text-muted-foreground/25 hover:text-muted-foreground",
          )}
        >
          <Flame size={13} fill={o.is_in_progress ? "currentColor" : "none"} />
        </button>
        <span className="truncate font-mono text-sm">{o.order_number}</span>
      </span>
    ),
    customer: <span className="text-sm">{o.customers?.name || o.requester_legacy || "—"}</span>,
    // 2026-10-21 사용자 요청: RECIPIENT 컬럼에 받는 사람 이름이 아니라 "관계"(recipient_relationship)를
    // 표시. Other는 직접 적은 메모가 있으면 그걸, 옵션에 없는 예전 값은 원문 그대로 보여준다.
    recipient: (
      <span className="text-sm">
        {o.recipient_relationship === "Other" && o.recipient_relationship_other_note?.trim()
          ? o.recipient_relationship_other_note.trim()
          : o.recipient_relationship
            ? (ORDER_RECIPIENT_RELATIONSHIP_OPTIONS.find(
                (r) => r.value === o.recipient_relationship,
              )?.label ?? o.recipient_relationship)
            : "—"}
      </span>
    ),
    occasion: <span className="text-sm text-muted-foreground">{o.occasion || "—"}</span>,
    date: (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
        {o.pickup_at ? (
          <>
            {new Date(o.pickup_at).toLocaleString("en-AU", {
              timeZone: "Australia/Sydney",
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            ({koreanWeekdayShort(toLocalDateString(new Date(o.pickup_at)))})
          </>
        ) : o.event_date ? (
          <>
            {o.event_date} ({koreanWeekdayShort(o.event_date)})
          </>
        ) : (
          "—"
        )}
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
    dietary:
      orderTagNames.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {orderTagNames.map((n) => (
            <span
              key={n}
              className="label-caps border border-foreground px-1.5 py-0.5 text-[10px] text-foreground"
            >
              {n}
            </span>
          ))}
        </span>
      ),
    cake_size: <span className="text-sm text-muted-foreground">{cakeSizeName || o.cake_size || "—"}</span>,
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
          if (e.key === "Enter")
            void navigate({ to: "/orders/$orderId", params: { orderId: o.id } });
        }}
        className={cn(
          "grid grid-cols-1 gap-1 border-l-4 px-3 py-3 cursor-pointer md:items-center md:gap-x-4 md:gap-y-1",
          o.is_in_progress
            ? "border-l-amber-400 bg-amber-50 hover:bg-amber-100"
            : "border-l-transparent hover:bg-secondary",
        )}
        style={{ gridTemplateColumns }}
      >
        {columnOrder.map((key) => (
          <span key={key} className="min-w-0 overflow-hidden">
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
