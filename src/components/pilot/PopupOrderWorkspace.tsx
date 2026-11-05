import { PopupStagePicker } from "./PopupStageSelect";
import { PopupChecklistSection } from "./PopupChecklistSection";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { cakeSizesQuery, productsQuery, type OrderListRow, type OrderStatus } from "@/lib/queries";
import { formatDateTime, formatTime, localDateTimeToISO, toLocalDateString } from "@/lib/datetime";
import { readPopupPlan, validatePopupPlan, type PopupItem } from "@/lib/popup";
import { invalidateProductionSync } from "@/lib/production-sync";
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
      const result = data as { updated_at: string; status: string; popup_plan: Json; order_number: string };
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
  const session = useMutation({
    mutationFn: async (item: PopupItem) => {
      if (dirty || end !== inputTime(plan.ends_at || null))
        throw new Error("변경 내용을 먼저 저장하세요");
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
  const pending = save.isPending || session.isPending;
  const changeItem = (id: string, patch: Partial<PopupItem>) =>
    setDraft((d) => ({
      ...d,
      plan: { ...d.plan, items: d.plan.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
    }));
  const setPlan = (patch: Partial<typeof plan>) =>
    setDraft((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const changed = dirty || end !== inputTime(plan.ends_at || null);
  return (
    <div className="space-y-4">
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
        <div className="space-y-4">
          <OrderMoodboardSection orderId={order.id} />
          <OrderResultPhotosSection orderId={order.id} />
        </div>
      ) : (
        <fieldset disabled={pending} className="space-y-4">
          <SectionCard title="POP UP DETAIL">
            <div className="grid gap-3 sm:grid-cols-2">
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
            title={`생산 품목 · ${plan.items.length}개`}
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
            <div className="space-y-3">
              {plan.items.map((item) => (
                <div key={item.id} className="space-y-2 border border-border p-3">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <ProductSelect
                        value={item.product_id}
                        emptyLabel="직접 입력 / 제품 선택"
                        onChange={(id) => {
                          const product = products.data?.find((p) => p.id === id);
                          changeItem(item.id, {
                            product_id: id,
                            ...(product ? { label: product.name } : {}),
                          });
                        }}
                      />
                    </div>
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
                  <Field label="품목 이름">
                    <input
                      className={inputClass}
                      value={item.label}
                      maxLength={300}
                      placeholder="예: 커스타드 프로피테롤"
                      onChange={(e) => changeItem(item.id, { label: e.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                      disabled={pending || changed || draft.status === "COMPLETED"}
                      onClick={() => session.mutate(item)}
                    >
                      생산 세션 만들기
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!plan.items.length && (
              <p className="text-sm text-muted-foreground">
                프로피테롤·케이크 등 생산할 품목과 수량을 추가하세요.
              </p>
            )}
          </SectionCard>
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
