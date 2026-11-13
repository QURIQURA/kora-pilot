import { PopupStagePicker } from "./PopupStageSelect";
import { PopupChecklistSection } from "./PopupChecklistSection";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  cakeSizesQuery,
  currentUserId,
  customersQuery,
  productComponentsQuery,
  productsQuery,
  type OrderListRow,
  type OrderStatus,
} from "@/lib/queries";
import { formatDateTime, formatTime, localDateTimeToISO, toLocalDateString } from "@/lib/datetime";
import { readPopupPlan, validatePopupPlan, type PopupItem } from "@/lib/popup";
import { invalidateProductionSync } from "@/lib/production-sync";
import {
  paymentLabel,
  popupPreordersQuery,
  preordersForItem,
  type PopupPreorder,
} from "@/lib/popup-preorders";
import { ProductSelect } from "./ProductSelect";
import { OrderMoodboardSection } from "./OrderMoodboardSection";
import { OrderResultPhotosSection } from "./OrderResultPhotosSection";
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

const inputTime = (iso: string | null) =>
  iso ? `${toLocalDateString(new Date(iso))}T${formatTime(iso)}` : "";
const isoTime = (text: string) =>
  text ? localDateTimeToISO(text.slice(0, 10), text.slice(11)) : null;
const initial = (order: OrderListRow) => ({
  orderNumber: order.order_number ?? "",
  plan: readPopupPlan(order.popup_plan),
  start: inputTime(order.pickup_at),
  status: order.status as OrderStatus,
});

export function PopupOrderWorkspace({ order }: { order: OrderListRow }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"POP UP DETAIL" | "VISUALS">("POP UP DETAIL");
  const [draft, setDraft] = useState(() => initial(order));
  const baseline = useRef({ state: initial(order), updatedAt: order.updated_at });
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current.state);
  const [end, setEnd] = useState(() => inputTime(readPopupPlan(order.popup_plan).ends_at || null));
  const conflict =
    (dirty || end !== inputTime(draft.plan.ends_at || null)) &&
    order.updated_at !== baseline.current.updatedAt;
  useEffect(() => {
    if (
      JSON.stringify(draft) === JSON.stringify(baseline.current.state) &&
      end === inputTime(baseline.current.state.plan.ends_at || null)
    ) {
      const state = initial(order);
      baseline.current = { state, updatedAt: order.updated_at };
      setDraft(state);
      setEnd(inputTime(state.plan.ends_at || null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.updated_at]);
  const standards = useQuery(cakeSizesQuery());
  const products = useQuery(productsQuery());
  const plan = draft.plan;
  // 저장된 값 기준으로 프리오더를 찾는다(입력 중인 미저장 값마다 다시 조회하지 않도록).
  const savedPlan = baseline.current.state.plan;
  const preorders = useQuery(
    popupPreordersQuery({
      id: order.id,
      order_number: baseline.current.state.orderNumber,
      pickup_at: isoTime(baseline.current.state.start),
      ends_at: savedPlan.ends_at,
    }),
  );
  const validation = validatePopupPlan(plan);
  const save = useMutation({
    mutationFn: async () => {
      if (validation) throw new Error(validation);
      if (!draft.orderNumber.trim()) throw new Error("오더 번호를 입력하세요");
      if (conflict) throw new Error("다른 화면에서 변경됐습니다. 최신 값을 불러오세요");
      const start = isoTime(draft.start);
      const ends = isoTime(end);
      if (ends && (!start || ends <= start))
        throw new Error("종료 시각은 시작 시각 이후로 입력하세요");
      const saved = { ...draft, plan: { ...plan, ends_at: ends ?? "" } };
      const { data, error } = await supabase.rpc("save_popup_order_details", {
        p_order_number: draft.orderNumber.trim(),
        p_order_id: order.id,
        p_expected_updated_at: baseline.current.updatedAt,
        p_plan: saved.plan as unknown as Json,
        p_start: start,
        p_status: draft.status,
      });
      if (error) throw error;
      const result = data as {
        updated_at: string;
        status: string;
        popup_plan: Json;
        order_number: string;
      };
      return {
        state: {
          ...saved,
          orderNumber: result.order_number,
          plan: readPopupPlan(result.popup_plan),
          status: result.status as OrderStatus,
        },
        updatedAt: result.updated_at,
      };
    },
    onSuccess: async (result) => {
      baseline.current = result;
      setDraft(result.state);
      await invalidateProductionSync(client);
    },
  });
  // 2026-11-13 (연): 품목 행에서 바로 프리오더(일반 ORDERS 행) 생성. 번호는 "<팝업번호>.N",
  // 제품/픽업 시각은 팝업 품목·시작 시각을 물려받고, 주문자·결제는 열린 오더 상세에서 채운다.
  // 생산은 팝업 세션이 맡으므로 별도 WORK SESSION은 만들지 않는다.
  // 2026-11-13 (연): 품목 행에서 바로 프리오더(일반 ORDERS 행) 생성 — 케이크 오더 폼으로 보내지 않고
  // 이 페이지 안의 작은 창에서 고객(기존 선택 또는 새로 추가)·수량만 받는다. 제품은 품목으로 이미 정해져 있다.
  // 번호는 "<팝업번호>.N", 픽업은 팝업 시작 시각. 생산은 팝업 세션이 맡으므로 별도 WORK SESSION은 만들지 않는다.
  const [preorderFor, setPreorderFor] = useState<PopupItem | null>(null);
  const addPreorder = useMutation({
    mutationFn: async ({
      item,
      customerId,
      newCustomer,
      quantity,
    }: {
      item: PopupItem;
      customerId: string | null;
      newCustomer: { name: string; phone: string; instagram: string } | null;
      quantity: number;
    }) => {
      if (dirty || end !== inputTime(plan.ends_at || null)) await save.mutateAsync();
      const number = baseline.current.state.orderNumber.trim();
      if (!number) throw new Error("팝업 오더 번호를 먼저 저장하세요");
      const uid = await currentUserId();
      let customer = customerId;
      if (!customer && newCustomer) {
        const { data: created, error: customerError } = await supabase
          .from("customers")
          .insert({
            user_id: uid,
            name: newCustomer.name.trim(),
            phone: newCustomer.phone.trim() || null,
            instagram_handle: newCustomer.instagram.trim().replace(/^@/, "") || null,
          } as never)
          .select("id")
          .single();
        if (customerError) throw customerError;
        customer = created.id;
      }
      if (!customer) throw new Error("고객을 선택하거나 새로 입력하세요");
      const prefix = `${number}.`;
      const { data: existing, error: existingError } = await supabase
        .from("orders")
        .select("order_number")
        .like("order_number", `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      if (existingError) throw existingError;
      const max = (existing ?? []).reduce((m, o) => {
        const n = Number((o.order_number ?? "").slice(prefix.length));
        return Number.isInteger(n) && n > m ? n : m;
      }, 0);
      const { error } = await supabase.from("orders").insert({
        user_id: uid,
        order_number: `${prefix}${max + 1}`,
        customer_id: customer,
        product_id: item.product_id || null,
        quantity: Math.max(1, Math.floor(quantity) || 1),
        pickup_at: isoTime(baseline.current.state.start),
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      setPreorderFor(null);
      await client.invalidateQueries({ queryKey: ["orders"] });
      await client.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  const session = useMutation({
    mutationFn: async (item: PopupItem) => {
      // 새로 추가한 품목처럼 미저장 변경이 있으면 먼저 저장한 뒤(2026-11-09) 세션을 만든다.
      if (dirty || end !== inputTime(plan.ends_at || null)) await save.mutateAsync();
      const { data, error } = await supabase.rpc("create_popup_item_session", {
        p_order_id: order.id,
        p_item_id: item.id,
        p_expected_updated_at: baseline.current.updatedAt,
      });
      if (error) throw error;
      return (data as { session_id: string }).session_id;
    },
    onSuccess: async () => {
      await invalidateProductionSync(client);
      void navigate({ to: "/production", search: { tab: "ORDERS" } });
    },
  });
  const pending = save.isPending || session.isPending || addPreorder.isPending;
  const changeItem = (id: string, patch: Partial<PopupItem>) =>
    setDraft((d) => ({
      ...d,
      plan: { ...d.plan, items: d.plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
    }));
  const setPlan = (patch: Partial<typeof plan>) =>
    setDraft((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const changed = dirty || end !== inputTime(plan.ends_at || null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          <Link to="/orders" className="text-xs underline">
            ← ORDERS
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="label-caps w-[10rem] max-w-full border-0 bg-transparent p-0 text-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={draft.orderNumber}
              aria-label="ORDER NUMBER"
              maxLength={200}
              disabled={pending}
              onChange={(e) => setDraft((d) => ({ ...d, orderNumber: e.target.value }))}
            />
            <span aria-hidden="true">·</span>
            <input
              className="label-caps min-w-[12rem] flex-1 border-0 bg-transparent p-0 text-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={plan.title}
              aria-label="POP UP TITLE"
              maxLength={200}
              disabled={pending}
              onChange={(e) => setPlan({ title: e.target.value })}
            />
          </div>
        </div>
        <PopupStagePicker
          value={plan.stage_id || (draft.status === "COMPLETED" ? "COMPLETED" : "")}
          disabled={pending}
          onChange={(stage_id) => setPlan({ stage_id })}
        />
      </div>
      <div className="flex gap-2 border-b border-border">
        {(["POP UP DETAIL", "VISUALS"] as const).map((t) => (
          <button
            type="button"
            key={t}
            className={`label-caps border-b-2 px-3 py-2 text-xs ${t === tab ? "border-foreground" : "border-transparent text-muted-foreground"}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "VISUALS" ? (
        <div className="space-y-3">
          <OrderMoodboardSection orderId={order.id} />
          <OrderResultPhotosSection orderId={order.id} />
        </div>
      ) : (
        <fieldset disabled={pending} className="space-y-3">
          <SectionCard title="POP UP DETAIL">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]">
              <Field label="팝업 이름">
                <input
                  className={inputClass}
                  value={plan.title}
                  maxLength={200}
                  onChange={(e) => setPlan({ title: e.target.value })}
                />
              </Field>
              <Field label="장소">
                <input
                  className={inputClass}
                  value={plan.location}
                  onChange={(e) => setPlan({ location: e.target.value })}
                />
              </Field>
              <Field label="시작 · Canberra / Sydney">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={draft.start}
                  onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                />
              </Field>
              <Field label="종료">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
          </SectionCard>
          <SectionCard
            title={`생산 품목 & PREORDER · ${plan.items.length}개`}
            action={
              <button
                type="button"
                className={buttonClass}
                disabled={pending || plan.items.length >= 100}
                onClick={() =>
                  setPlan({
                    items: [
                      ...plan.items,
                      {
                        id: crypto.randomUUID(),
                        product_id: "",
                        standard_id: "",
                        label: "",
                        quantity: 1,
                        ready_quantity: 0,
                        unit: "개",
                        work_session_id: "",
                      },
                    ],
                  })
                }
              >
                + 품목 추가
              </button>
            }
          >
            {/* 2026-11-13 (연): 품목당 한 행 — 왼쪽은 기존 생산 품목, 오른쪽은 그 품목의 프리오더(기존 ORDERS) */}
            <div className="space-y-2">
              {plan.items.length > 0 && (
                <div className="label-caps hidden text-xs text-muted-foreground lg:grid lg:grid-cols-2">
                  <span className="px-2.5">생산 품목</span>
                  <span className="px-2.5">PREORDER</span>
                </div>
              )}
              {plan.items.map((item, index) => (
                <div key={item.id} className="grid border border-border lg:grid-cols-2">
                  <div className="min-w-0 space-y-2 p-2.5">
                    <p className="label-caps text-xs text-muted-foreground">#{index + 1}</p>
                    <div className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <Field label="제품">
                        <ProductSelect
                          value={item.product_id}
                          emptyLabel="제품 선택 (없으면 오른쪽에 직접 입력)"
                          onChange={(id) => {
                            const product = products.data?.find((p) => p.id === id);
                            changeItem(item.id, {
                              product_id: id,
                              ...(product ? { label: product.name } : {}),
                            });
                          }}
                        />
                      </Field>
                      <Field label="품목 이름">
                        <input
                          className={inputClass}
                          value={item.label}
                          maxLength={300}
                          placeholder="예: 커스타드 프로피테롤"
                          onChange={(e) => changeItem(item.id, { label: e.target.value })}
                        />
                      </Field>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => {
                          if (
                            !item.work_session_id ||
                            confirm("품목을 목록에서 제거할까요? 연결된 생산 기록은 유지됩니다.")
                          )
                            setPlan({ items: plan.items.filter((i) => i.id !== item.id) });
                        }}
                      >
                        제거
                      </button>
                    </div>
                    {item.product_id && <PopupItemComponents productId={item.product_id} />}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.6fr)_6rem_6rem_5rem]">
                      <Field label="공용 완성 규격">
                        <select
                          className={selectClass}
                          value={item.standard_id}
                          onChange={(e) => changeItem(item.id, { standard_id: e.target.value })}
                        >
                          <option value="">해당 없음 / 미지정</option>
                          {(standards.data ?? []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="계획 수량">
                        <input
                          aria-label={`${item.label || "품목"} 계획 수량`}
                          className={inputClass}
                          type="number"
                          min="1"
                          step="1"
                          value={Number.isNaN(item.quantity) ? "" : item.quantity}
                          onChange={(e) =>
                            changeItem(item.id, {
                              quantity: e.target.value === "" ? NaN : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="준비 완료 수량">
                        <input
                          aria-label={`${item.label || "품목"} 준비 수량`}
                          className={inputClass}
                          type="number"
                          min="0"
                          step="1"
                          value={Number.isNaN(item.ready_quantity) ? "" : item.ready_quantity}
                          onChange={(e) =>
                            changeItem(item.id, {
                              ready_quantity: e.target.value === "" ? NaN : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="단위">
                        <input
                          className={inputClass}
                          value={item.unit}
                          maxLength={40}
                          placeholder="개 / 박스 / 세트"
                          onChange={(e) => changeItem(item.id, { unit: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        준비 {Number.isFinite(item.ready_quantity) ? item.ready_quantity : 0} /{" "}
                        {Number.isFinite(item.quantity) ? item.quantity : 0} {item.unit} ·{" "}
                        {item.work_session_id
                          ? "생산 세션 연결됨"
                          : "생산 배수는 세션에서 별도로 설정합니다."}
                      </p>
                      {item.work_session_id ? (
                        <Link
                          className={buttonClass}
                          to="/production/$sessionId"
                          params={{ sessionId: item.work_session_id }}
                        >
                          생산 세션 열기
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={
                            pending ||
                            draft.status === "COMPLETED" ||
                            (changed && (!!validation || conflict || !draft.orderNumber.trim()))
                          }
                          title={changed ? "저장한 뒤 생산 세션을 만듭니다" : undefined}
                          onClick={() => session.mutate(item)}
                        >
                          {changed ? "저장 후 생산 세션 만들기" : "생산 세션 만들기"}
                        </button>
                      )}
                    </div>
                  </div>
                  <PopupItemPreorders
                    item={item}
                    preorders={preorders.data ?? []}
                    loading={preorders.isLoading}
                    error={preorders.error?.message}
                    onAdd={() => setPreorderFor(item)}
                    addDisabled={
                      pending ||
                      !item.product_id ||
                      draft.status === "COMPLETED" ||
                      (changed && (!!validation || conflict || !draft.orderNumber.trim()))
                    }
                    addLabel={
                      !item.product_id
                        ? "제품 선택 후 프리오더 추가"
                        : changed
                          ? "저장 후 프리오더 추가"
                          : "+ 프리오더 추가"
                    }
                  />
                </div>
              ))}
            </div>
            {!plan.items.length && (
              <p className="text-sm text-muted-foreground">
                프로피테롤·케이크 등 생산할 품목과 수량을 추가하세요.
              </p>
            )}
          </SectionCard>
          {preorderFor && (
            <PreorderDialog
              item={preorderFor}
              popupLabel={`${baseline.current.state.orderNumber} · ${plan.title}`}
              pending={addPreorder.isPending}
              error={addPreorder.error?.message}
              onClose={() => {
                addPreorder.reset();
                setPreorderFor(null);
              }}
              onSubmit={(v) => addPreorder.mutate({ item: preorderFor, ...v })}
            />
          )}
          <PopupChecklistSection plan={plan} onChange={setPlan} />
          <SectionCard title="운영 메모">
            <textarea
              className={inputClass}
              rows={4}
              value={plan.notes}
              placeholder="준비 순서, 픽업, 운반, 판매 시 참고할 내용"
              onChange={(e) => setPlan({ notes: e.target.value })}
            />
          </SectionCard>
        </fieldset>
      )}
      <div className="sticky bottom-0 space-y-2 border border-border bg-background p-3">
        {conflict && (
          <p role="alert" className="text-sm text-destructive">
            다른 화면에서 변경되었습니다.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                const state = initial(order);
                baseline.current = { state, updatedAt: order.updated_at };
                setDraft(state);
                setEnd(inputTime(state.plan.ends_at || null));
              }}
            >
              최신 값 불러오기 (미저장 변경 취소)
            </button>
          </p>
        )}
        {(save.isError || session.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {(save.error ?? session.error)?.message}
          </p>
        )}
        {validation && changed && <p className="text-xs text-destructive">{validation}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={pending || !changed || !!validation || !draft.orderNumber.trim() || conflict}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "저장 중…" : "SAVE POP UP"}
          </button>
          <span className="text-xs text-muted-foreground">
            {changed ? "타이틀·품목·수량·체크 상태를 저장하세요" : "✓ SAVED"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 팝업 품목에 연결된 제품의 하위 컴포넌트 목록(2026-11-09) — 제품을 고르면 무엇을 만들어야 하는지 바로 보인다. */
function PopupItemComponents({ productId }: { productId: string }) {
  const comps = useQuery(productComponentsQuery(productId));
  if (comps.isLoading)
    return <p className="text-xs text-muted-foreground">하위 컴포넌트 불러오는 중…</p>;
  const rows = comps.data ?? [];
  if (rows.length === 0)
    return (
      <p className="text-xs text-muted-foreground">이 제품에는 하위 컴포넌트가 아직 없어요.</p>
    );
  return (
    <div className="space-y-1 border border-dashed border-border p-2">
      <p className="label-caps text-[10px] text-muted-foreground">
        하위 컴포넌트 · {rows.length}개
      </p>
      <ul className="space-y-0.5 text-xs">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-2">
            <span>{r.components?.name ?? r.ingredients?.name ?? "—"}</span>
            {r.quantity_g != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {Number(r.quantity_g)}g
              </span>
            )}
            {r.formula_versions && (
              <span className="font-mono text-[11px] text-muted-foreground">
                V{r.formula_versions.version_number}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 품목 행 오른쪽 칸 — 이 품목의 프리오더 오더를 항상 펼친 채로 보여준다(2026-11-13). 누르면 오더 상세로 이동. */
function PopupItemPreorders({
  item,
  preorders,
  loading,
  error,
  onAdd,
  addDisabled,
  addLabel,
}: {
  item: PopupItem;
  preorders: PopupPreorder[];
  loading: boolean;
  error?: string | undefined;
  /** "+ 프리오더 추가" — 이 품목의 제품·팝업 시작 시각을 물려받은 새 오더를 만들고 상세로 이동(2026-11-13). */
  onAdd: () => void;
  addDisabled: boolean;
  addLabel: string;
}) {
  const rows = preordersForItem(item, preorders);
  const total = rows.reduce((sum, o) => sum + (o.quantity ?? 1), 0);
  return (
    <div className="min-w-0 space-y-1.5 border-t border-border p-2.5 lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps text-xs text-muted-foreground lg:hidden">PREORDER</p>
        <button
          type="button"
          className={`${buttonClass} ml-auto`}
          disabled={addDisabled}
          title="이 품목의 프리오더 오더를 만들고 주문자 정보를 입력합니다"
          onClick={onAdd}
        >
          {addLabel}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? null : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-xs">
              <thead>
                <tr className="label-caps border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">주문번호</th>
                  <th className="py-1 pr-2 font-normal">주문자</th>
                  <th className="py-1 pr-2 font-normal">연락처</th>
                  <th className="py-1 pr-2 text-right font-normal">수량</th>
                  <th className="py-1 pr-2 font-normal">픽업</th>
                  <th className="py-1 font-normal">결제</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border last:border-b-0 hover:bg-secondary"
                  >
                    <td className="py-1 pr-2">
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="label-caps underline-offset-2 hover:underline"
                      >
                        {o.order_number || "—"}
                      </Link>
                    </td>
                    <td className="py-1 pr-2">{o.customers?.name || "—"}</td>
                    <td className="py-1 pr-2 font-mono tabular-nums">
                      {o.customers?.phone ? (
                        <a href={`tel:${o.customers.phone}`}>{o.customers.phone}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums">
                      {o.quantity ?? 1} {item.unit}
                    </td>
                    <td className="py-1 pr-2 font-mono tabular-nums">
                      {o.pickup_at ? formatTime(o.pickup_at) : "—"}
                    </td>
                    <td className="py-1">
                      <span
                        className={`label-caps inline-block border px-1.5 text-[10px] ${o.payment_status === "Paid in Full" ? "border-foreground" : "border-dashed border-border text-muted-foreground"}`}
                      >
                        {paymentLabel(o.payment_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            PREORDER {total} {item.unit}
            {Number.isFinite(item.quantity) &&
              ` · 현장 판매 ${Math.max(item.quantity - total, 0)} ${item.unit}`}
            {Number.isFinite(item.quantity) && total > item.quantity && (
              <span className="text-destructive"> · 계획 수량 초과</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** "+ 프리오더 추가" 작은 창 — 고객(기존 선택 / 새로 입력)과 수량만 받는다. 제품·픽업은 품목·팝업에서 정해진다. */
function PreorderDialog({
  item,
  popupLabel,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  item: PopupItem;
  popupLabel: string;
  pending: boolean;
  error?: string | undefined;
  onClose: () => void;
  onSubmit: (v: {
    customerId: string | null;
    newCustomer: { name: string; phone: string; instagram: string } | null;
    quantity: number;
  }) => void;
}) {
  const customers = useQuery(customersQuery());
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [quantity, setQuantity] = useState(1);
  const canSubmit =
    !pending && quantity >= 1 && (mode === "existing" ? !!customerId : !!name.trim());
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 sm:items-center sm:p-3">
      <div className="w-full max-w-md border border-border bg-background" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="label-caps">PREORDER · {item.label || "품목"}</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-3 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              customerId: mode === "existing" ? customerId : null,
              newCustomer: mode === "new" ? { name, phone, instagram } : null,
              quantity,
            });
          }}
        >
          <p className="text-xs text-muted-foreground">{popupLabel}</p>
          <div className="flex gap-1">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`${buttonClass} ${mode === m ? "border-foreground" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "existing" ? "기존 고객" : "새 고객"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <Field label="고객">
              <select
                className={selectClass}
                value={customerId}
                autoFocus
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— 선택 —</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "(이름 없음)"}
                    {c.instagram_handle ? ` · @${c.instagram_handle}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="이름">
                <input
                  className={inputClass}
                  value={name}
                  autoFocus
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="연락처">
                <input
                  className={inputClass}
                  value={phone}
                  inputMode="tel"
                  maxLength={40}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="인스타그램">
                <input
                  className={inputClass}
                  value={instagram}
                  placeholder="@handle"
                  maxLength={120}
                  onChange={(e) => setInstagram(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label={`수량 (${item.unit})`}>
            <input
              className={`${inputClass} !w-24`}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          {error && <p className="font-mono text-xs uppercase text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass} onClick={onClose}>
              취소
            </button>
            <button type="submit" className={primaryButtonClass} disabled={!canSubmit}>
              {pending ? "추가 중…" : "프리오더 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
