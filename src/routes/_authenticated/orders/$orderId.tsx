import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  orderQuery,
  productsQuery,
  ORDER_STATUSES,
  ORDER_OCCASIONS,
  ORDER_RECIPIENT_RELATIONSHIPS,
  ORDER_CAKE_SIZES,
  ORDER_PAYMENT_STATUSES,
  type OrderStatus,
  type OrderOccasion,
  type OrderRecipientRelationship,
  type OrderCakeSize,
  type OrderPaymentStatus,
} from "@/lib/queries";
import { formatDateTime } from "@/lib/datetime";
import { CustomerSelect } from "@/components/pilot/CustomerSelect";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  head: () => ({
    meta: [{ title: "PILOT — Order" }, { name: "description", content: "Order detail" }],
  }),
  component: OrderDetailPage,
});

interface ExtractedOrderInfo {
  customer_name: string | null;
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  recipient: string | null;
  occasion: string | null;
  event_date: string | null;
  pickup_time: string | null;
  cake_size: string | null;
  quantity: number | null;
  preferences: string | null;
  special_requests: string | null;
}

const FIELD_LABELS: Record<keyof ExtractedOrderInfo, string> = {
  customer_name: "고객 이름",
  instagram_handle: "인스타그램",
  phone: "전화번호",
  email: "이메일",
  recipient: "받는 사람",
  occasion: "행사",
  event_date: "행사 날짜",
  pickup_time: "픽업/배달 시각",
  cake_size: "케익 사이즈",
  quantity: "수량",
  preferences: "취향",
  special_requests: "특별 요청",
};

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

/** AI가 뽑아낸 자유텍스트를 정형화된 Dropdown 옵션과 대소문자 무관 정확 일치로 매칭한다.
 * 못 찾으면 null — 억지로 추측해서 틀린 값을 넣지 않는다(기존 "AI가 추측하지 않는다" 원칙과 동일). */
function matchOption<T extends string>(options: readonly T[], value: string): T | null {
  const found = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  return found ?? null;
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const order = useQuery(orderQuery(orderId));
  const products = useQuery(productsQuery());

  const [dmText, setDmText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedOrderInfo | null>(null);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  const [customerId, setCustomerId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientRelationship, setRecipientRelationship] = useState<OrderRecipientRelationship | "">("");
  const [recipientRelationshipOtherNote, setRecipientRelationshipOtherNote] = useState("");
  const [occasion, setOccasion] = useState<OrderOccasion | "">("");
  const [occasionOtherNote, setOccasionOtherNote] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [cakeSize, setCakeSize] = useState<OrderCakeSize | "">("");
  const [customSize, setCustomSize] = useState("");
  const [customSizeCm, setCustomSizeCm] = useState("");
  const [quantity, setQuantity] = useState("");
  const [servings, setServings] = useState("");
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus | "">("");
  const [status, setStatus] = useState<OrderStatus>("NEW");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!order.data) return;
    const o = order.data;
    setDmText(o.raw_dm_text ?? "");
    setCustomerId(o.customer_id ?? "");
    setRecipient(o.recipient ?? "");
    setRecipientRelationship(o.recipient_relationship ?? "");
    setRecipientRelationshipOtherNote(o.recipient_relationship_other_note ?? "");
    setOccasion(o.occasion ?? "");
    setOccasionOtherNote(o.occasion_other_note ?? "");
    setEventDate(o.event_date ?? "");
    setPickupAt(isoToDatetimeLocal(o.pickup_at));
    setCakeSize(o.cake_size ?? "");
    setCustomSize(o.custom_size ?? "");
    setCustomSizeCm(o.custom_size_cm != null ? String(o.custom_size_cm) : "");
    setQuantity(o.quantity != null ? String(o.quantity) : "");
    setServings(o.servings != null ? String(o.servings) : "");
    setPrice(o.price != null ? String(o.price) : "");
    setPaymentStatus(o.payment_status ?? "");
    setStatus((o.status as OrderStatus) ?? "NEW");
    setProductId(o.product_id ?? "");
    setNotes(o.notes ?? "");
  }, [order.data]);

  const runExtraction = async () => {
    setExtractError(null);
    if (!dmText.trim()) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-order-info", {
        body: { text: dmText },
      });
      if (error) throw error;
      setExtracted(data.extracted as ExtractedOrderInfo);
      setAppliedKeys(new Set());
    } catch (err) {
      setExtractError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  };

  // AI 추출값은 여기서 폼 필드에 "프리필"만 한다 — 아직 저장이 아니다.
  // 사용자가 아래 폼을 다시 확인하고 SAVE를 눌러야 실제로 orders에 저장된다.
  const applyField = (key: keyof ExtractedOrderInfo) => {
    if (!extracted) return;
    const v = extracted[key];
    if (v == null) return;
    switch (key) {
      case "recipient":
        setRecipient(v as string);
        break;
      case "occasion": {
        // OCCASION은 이제 Dropdown — AI 추출 텍스트가 옵션과 정확히 일치할 때만 채우고,
        // 아니면 억지로 맞추지 않고 "Other" + 원문 메모로 보존한다(추측 금지 원칙과 동일).
        const matched = matchOption(ORDER_OCCASIONS, v as string);
        if (matched) {
          setOccasion(matched);
        } else {
          setOccasion("Other");
          setOccasionOtherNote(v as string);
        }
        break;
      }
      case "event_date":
        setEventDate(v as string);
        break;
      case "cake_size": {
        // CAKE SIZE도 Dropdown — Round/Square 등 모양까지는 AI가 단정할 수 없으므로,
        // 정확히 일치하지 않으면 "Custom"으로 두고 원문을 CUSTOM SIZE에 그대로 보존한다.
        const matched = matchOption(ORDER_CAKE_SIZES, v as string);
        if (matched) {
          setCakeSize(matched);
        } else {
          setCakeSize("Custom");
          setCustomSize(v as string);
        }
        break;
      }
      case "quantity":
        setQuantity(String(v));
        break;
      case "special_requests":
      case "preferences":
        setNotes((prev) => {
          const line = `${FIELD_LABELS[key]}: ${v}`;
          return prev.trim() ? `${prev}\n${line}` : line;
        });
        break;
      default:
        break;
    }
    setAppliedKeys((prev) => new Set(prev).add(key));
  };

  const applyAll = () => {
    if (!extracted) return;
    (Object.keys(extracted) as (keyof ExtractedOrderInfo)[]).forEach((k) => {
      if (extracted[k] != null) applyField(k);
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({
          raw_dm_text: dmText.trim() || null,
          extracted_json: extracted ? (extracted as unknown as Json) : order.data?.extracted_json ?? null,
          customer_id: customerId || null,
          recipient: recipient.trim() || null,
          recipient_relationship: recipientRelationship || null,
          recipient_relationship_other_note:
            recipientRelationship === "Other" ? recipientRelationshipOtherNote.trim() || null : null,
          occasion: occasion || null,
          occasion_other_note: occasion === "Other" ? occasionOtherNote.trim() || null : null,
          event_date: eventDate || null,
          pickup_at: datetimeLocalToIso(pickupAt),
          cake_size: cakeSize || null,
          custom_size: cakeSize === "Custom" ? customSize.trim() || null : null,
          custom_size_cm: cakeSize === "Custom" && customSizeCm.trim() ? Number(customSizeCm) : null,
          quantity: quantity.trim() ? Number(quantity) : null,
          servings: servings.trim() ? Number(servings) : null,
          price: price.trim() ? Number(price) : null,
          payment_status: paymentStatus || null,
          status,
          product_id: productId || null,
          notes: notes.trim() || null,
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      void navigate({ to: "/orders" });
    },
  });

  if (!order.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {order.isLoading ? "LOADING…" : "ORDER NOT FOUND"}
      </p>
    );
  }

  const extractedEntries = extracted
    ? (Object.keys(extracted) as (keyof ExtractedOrderInfo)[]).filter((k) => extracted[k] != null)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link to="/orders" className="label-caps text-xs text-muted-foreground hover:text-foreground">
            ← ORDERS
          </Link>
          <h1 className="label-caps text-lg text-foreground">{order.data.order_number}</h1>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            CREATED {formatDateTime(order.data.created_at)}
          </p>
        </div>
        <select
          className={selectClass + " w-auto"}
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus)}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <SectionCard title="INSTAGRAM DM">
        <p className="mb-2 font-mono text-[11px] text-muted-foreground">
          DM 대화 전체를 그대로 붙여넣고 "AI로 추출"을 누르세요. AI는 텍스트에 없는 정보는 추측하지
          않고 비워 둡니다 — 추출 결과는 바로 저장되지 않고, 아래에서 하나씩(또는 전체) "적용"해야
          폼에 채워지고, 그 후 SAVE를 눌러야 실제로 저장됩니다.
        </p>
        <textarea
          rows={6}
          className={inputClass}
          placeholder="여기에 DM 대화를 붙여넣으세요…"
          value={dmText}
          onChange={(e) => setDmText(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={extracting || !dmText.trim()}
            onClick={runExtraction}
          >
            {extracting ? "추출 중…" : "AI로 추출"}
          </button>
          {extractError && (
            <span className="font-mono text-xs uppercase text-destructive">{extractError}</span>
          )}
        </div>

        {extracted && (
          <div className="mt-3 border border-dashed border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label-caps text-xs text-muted-foreground">AI 추출 결과 (확인 후 적용)</span>
              {extractedEntries.length > 0 && (
                <button type="button" className={buttonClass} onClick={applyAll}>
                  모두 적용
                </button>
              )}
            </div>
            {extractedEntries.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                텍스트에서 확실하게 뽑을 수 있는 정보가 없었습니다 — 직접 입력해주세요.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {extractedEntries.map((k) => (
                  <li key={k} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-sm">
                      <span className="text-muted-foreground">{FIELD_LABELS[k]}: </span>
                      {String(extracted[k])}
                    </span>
                    <button
                      type="button"
                      className="label-caps px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => applyField(k)}
                    >
                      {appliedKeys.has(k) ? "적용됨" : "적용"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(extracted.customer_name || extracted.instagram_handle || extracted.phone || extracted.email) && (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                고객 연락처 정보(이름/인스타/전화/이메일)는 아래 CUSTOMER에서 "+ NEW CUSTOMER"로
                직접 만들어 연결하세요.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="주문 정보">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="CUSTOMER (= 요청자/구매자)">
            <CustomerSelect
              value={customerId}
              onChange={setCustomerId}
              initialNameForCreate={extracted?.customer_name ?? ""}
            />
          </Field>
          <Field label="PRODUCT">
            <select className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">TBD — 아직 미정</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="RECIPIENT (받는 사람)">
            <input className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </Field>
          <Field label="RECIPIENT RELATIONSHIP">
            <select
              className={selectClass}
              value={recipientRelationship}
              onChange={(e) => setRecipientRelationship(e.target.value as OrderRecipientRelationship | "")}
            >
              <option value="">— 선택 —</option>
              {ORDER_RECIPIENT_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {recipientRelationship === "Other" && (
              <input
                className={inputClass + " mt-1"}
                placeholder="직접 입력"
                value={recipientRelationshipOtherNote}
                onChange={(e) => setRecipientRelationshipOtherNote(e.target.value)}
              />
            )}
          </Field>
          <Field label="OCCASION">
            <select
              className={selectClass}
              value={occasion}
              onChange={(e) => setOccasion(e.target.value as OrderOccasion | "")}
            >
              <option value="">— 선택 —</option>
              {ORDER_OCCASIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {occasion === "Other" && (
              <input
                className={inputClass + " mt-1"}
                placeholder="직접 입력"
                value={occasionOtherNote}
                onChange={(e) => setOccasionOtherNote(e.target.value)}
              />
            )}
          </Field>
          <Field label="EVENT DATE">
            <input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="PICKUP / DELIVERY AT">
            <input
              type="datetime-local"
              className={inputClass}
              value={pickupAt}
              onChange={(e) => setPickupAt(e.target.value)}
            />
          </Field>
          <Field label="CAKE SIZE">
            <select
              className={selectClass}
              value={cakeSize}
              onChange={(e) => setCakeSize(e.target.value as OrderCakeSize | "")}
            >
              <option value="">— 선택 —</option>
              {ORDER_CAKE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {cakeSize === "Custom" && (
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  className={inputClass + " !w-40"}
                  placeholder="커스텀 사이즈 (예: 10인치 하트)"
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  className={inputClass + " !w-28"}
                  placeholder="cm (선택)"
                  value={customSizeCm}
                  onChange={(e) => setCustomSizeCm(e.target.value)}
                />
              </div>
            )}
          </Field>
          <Field label="QUANTITY">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="SERVINGS (인분)">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className={inputClass}
              placeholder="예: 10"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </Field>
          <Field label="PRICE (AUD)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputClass}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="PAYMENT STATUS">
            <select
              className={selectClass}
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as OrderPaymentStatus | "")}
            >
              <option value="">— 선택 —</option>
              {ORDER_PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="NOTES">
            <textarea rows={4} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        {save.isError && (
          <p className="mt-2 font-mono text-xs uppercase text-destructive">{(save.error as Error).message}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button type="button" className={primaryButtonClass} disabled={save.isPending} onClick={() => save.mutate()}>
            SAVE
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              if (confirm("DELETE THIS ORDER?")) remove.mutate();
            }}
          >
            DELETE ORDER
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
