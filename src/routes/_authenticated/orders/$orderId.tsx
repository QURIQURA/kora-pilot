import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  orderQuery,
  productsQuery,
  pilotSettingsQuery,
  workSessionByOrderQuery,
  formulasQuery,
  currentUserId,
  ORDER_STATUSES,
  ORDER_OCCASIONS,
  ORDER_RECIPIENT_RELATIONSHIPS,
  ORDER_CAKE_SIZES,
  ORDER_PAYMENT_STATUSES,
  CORE_SLOTS,
  CORE_SLOT_LABELS,
  type CoreSlot,
  orderStatusLabel,
  orderStatusColor,
  type OrderListRow,
  type OrderStatus,
  type OrderOccasion,
  type OrderRecipientRelationship,
  type OrderCakeSize,
  type OrderPaymentStatus,
} from "@/lib/queries";
import { pickEffectiveFormulaVersion } from "@/lib/formula";
import { formatDateTime, generateTitle } from "@/lib/datetime";
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

// 2026-10-06 사용자 요청: Satisfaction(만족도) — Status와는 별개의 5단계 평가.
const SATISFACTION_LABELS: Record<number, string> = {
  1: "Very Dissatisfied",
  2: "Dissatisfied",
  3: "Neutral",
  4: "Satisfied",
  5: "Very Satisfied",
};

/** Maker/Customer Satisfaction 공용 별점 입력 — value가 ""(미입력/미수집)이면 별이 전부 빈 상태. */
function StarRating({
  value,
  onChange,
}: {
  value: number | "";
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="px-0.5 text-xl leading-none text-border hover:text-foreground"
            aria-label={`${n}점 — ${SATISFACTION_LABELS[n]}`}
          >
            <span className={value !== "" && n <= value ? "text-foreground" : ""}>
              {value !== "" && n <= value ? "★" : "☆"}
            </span>
          </button>
        ))}
      </div>
      <span className="label-caps text-[10px] text-muted-foreground">
        {value !== "" ? `${value} — ${SATISFACTION_LABELS[value]}` : "—"}
      </span>
    </div>
  );
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const order = useQuery(orderQuery(orderId));
  const products = useQuery(productsQuery());
  const pilotSettings = useQuery(pilotSettingsQuery());
  const workSession = useQuery(workSessionByOrderQuery(orderId));
  const formulas = useQuery(formulasQuery());
  const statusColors = (pilotSettings.data?.order_status_colors as Record<string, string> | null) ?? null;

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
  const [status, setStatus] = useState<OrderStatus>("INTAKE");
  const [productId, setProductId] = useState("");
  // 2026-10-06 사용자 요청: Order의 메모는 성격이 다른 세 가지로 분리 관리한다 — 섞어서 쓰지 않음.
  // - Flavoring Note: Sheet/Cream/Filling 등 전체 맛 밸런스(내부용, 새 flavoring_note 컬럼)
  // - Design Note: 디자인/구조/조립(기존에 있었지만 UI에 없던 design_notes 컬럼 재사용)
  // - Order Note: 고객 요청/배송 등 주문 자체에 대한 메모(기존 notes 컬럼, 라벨만 변경)
  const [flavoringNote, setFlavoringNote] = useState("");
  const [designNote, setDesignNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  // 2026-10-06 사용자 재확인: FLAVORING NOTE는 자유 텍스트뿐 아니라 실제 FORMULA까지 링크할 수
  // 있어야 한다(Sheet/Cream/Filling 각각). FORMULA VERSION까지는 아직 정하지 않음 — 실제 버전은
  // WORK SESSION 생성 시 시작값으로 자동 채워지되, 그 뒤엔 언제든 WORK SESSION 쪽에서 바꿀 수 있다.
  const [flavoringSheetFormulaId, setFlavoringSheetFormulaId] = useState("");
  const [flavoringCreamFormulaId, setFlavoringCreamFormulaId] = useState("");
  const [flavoringFillingFormulaId, setFlavoringFillingFormulaId] = useState("");

  // 2026-10-06 사용자 요청: Satisfaction(만족도) — Status(진행 단계)와는 완전히 별개 개념이라
  // 독립된 필드로 관리한다. makerSatisfaction/customerSatisfaction은 1~5 또는 "" (미입력/미수집).
  // customerSatisfaction은 특히 "아직 미수집"과 "1점"을 절대 같은 값으로 저장하면 안 되므로
  // ""(= null, 미수집)과 1~5를 구분되는 상태로 다룬다.
  const [makerSatisfaction, setMakerSatisfaction] = useState<number | "">("");
  const [customerSatisfaction, setCustomerSatisfaction] = useState<number | "">("");
  const [customerFeedback, setCustomerFeedback] = useState("");
  const [makerNotes, setMakerNotes] = useState("");

  // 수정사항 저장 여부를 시각적으로 보여주기 위한 "저장된 상태" 스냅샷(2026-10-06, 사용자
  // 요청 — SAVE 누르면 다시 수정하기 전까지 버튼이 비활성화되고 "✓ SAVED"로 보이게 함.
  // FORMULA 페이지(formulas/$formulaId.tsx)의 isDirty 패턴과 동일한 방식).
  // buildRowSnapshot: order.data(서버에 저장된 행) 기준으로 직렬화 — "마지막으로 저장된 상태".
  const buildRowSnapshot = (o: OrderListRow, extractedJsonForSnapshot: Json | null) =>
    JSON.stringify({
      dmText: o.raw_dm_text ?? "",
      extractedJson: extractedJsonForSnapshot,
      customerId: o.customer_id ?? "",
      recipient: o.recipient ?? "",
      recipientRelationship: o.recipient_relationship ?? "",
      recipientRelationshipOtherNote: o.recipient_relationship_other_note ?? "",
      occasion: o.occasion ?? "",
      occasionOtherNote: o.occasion_other_note ?? "",
      eventDate: o.event_date ?? "",
      pickupAt: isoToDatetimeLocal(o.pickup_at),
      cakeSize: o.cake_size ?? "",
      customSize: o.custom_size ?? "",
      customSizeCm: o.custom_size_cm != null ? String(o.custom_size_cm) : "",
      quantity: o.quantity != null ? String(o.quantity) : "",
      servings: o.servings != null ? String(o.servings) : "",
      price: o.price != null ? String(o.price) : "",
      paymentStatus: o.payment_status ?? "",
      status: (o.status as OrderStatus) ?? "INTAKE",
      productId: o.product_id ?? "",
      flavoringNote: o.flavoring_note ?? "",
      flavoringSheetFormulaId: o.flavoring_sheet_formula_id ?? "",
      flavoringCreamFormulaId: o.flavoring_cream_formula_id ?? "",
      flavoringFillingFormulaId: o.flavoring_filling_formula_id ?? "",
      designNote: o.design_notes ?? "",
      orderNote: o.notes ?? "",
      makerSatisfaction: o.maker_satisfaction ?? "",
      customerSatisfaction: o.customer_satisfaction ?? "",
      customerFeedback: o.customer_feedback ?? "",
      makerNotes: o.maker_notes ?? "",
    });

  const [savedSnapshot, setSavedSnapshot] = useState("");

  const hydrateFromOrder = (o: OrderListRow) => {
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
    setStatus((o.status as OrderStatus) ?? "INTAKE");
    setProductId(o.product_id ?? "");
    setFlavoringNote(o.flavoring_note ?? "");
    setFlavoringSheetFormulaId(o.flavoring_sheet_formula_id ?? "");
    setFlavoringCreamFormulaId(o.flavoring_cream_formula_id ?? "");
    setFlavoringFillingFormulaId(o.flavoring_filling_formula_id ?? "");
    setDesignNote(o.design_notes ?? "");
    setOrderNote(o.notes ?? "");
    setMakerSatisfaction(o.maker_satisfaction ?? "");
    setCustomerSatisfaction(o.customer_satisfaction ?? "");
    setCustomerFeedback(o.customer_feedback ?? "");
    setMakerNotes(o.maker_notes ?? "");
  };

  useEffect(() => {
    if (!order.data) return;
    hydrateFromOrder(order.data);
    setSavedSnapshot(buildRowSnapshot(order.data, order.data.extracted_json ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.data]);

  // currentSnapshot: 지금 화면(로컬 state) 기준 — savedSnapshot과 다르면 "변경사항 있음".
  const currentSnapshot = JSON.stringify({
    dmText,
    extractedJson: extracted ? (extracted as unknown as Json) : (order.data?.extracted_json ?? null),
    customerId,
    recipient,
    recipientRelationship,
    recipientRelationshipOtherNote,
    occasion,
    occasionOtherNote,
    eventDate,
    pickupAt,
    cakeSize,
    customSize,
    customSizeCm,
    quantity,
    servings,
    price,
    paymentStatus,
    status,
    productId,
    flavoringNote,
    flavoringSheetFormulaId,
    flavoringCreamFormulaId,
    flavoringFillingFormulaId,
    designNote,
    orderNote,
    makerSatisfaction,
    customerSatisfaction,
    customerFeedback,
    makerNotes,
  });
  const isDirty = Boolean(order.data) && currentSnapshot !== savedSnapshot;

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
        setOrderNote((prev) => {
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
          flavoring_note: flavoringNote.trim() || null,
          flavoring_sheet_formula_id: flavoringSheetFormulaId || null,
          flavoring_cream_formula_id: flavoringCreamFormulaId || null,
          flavoring_filling_formula_id: flavoringFillingFormulaId || null,
          design_notes: designNote.trim() || null,
          notes: orderNote.trim() || null,
          maker_satisfaction: makerSatisfaction === "" ? null : makerSatisfaction,
          customer_satisfaction: customerSatisfaction === "" ? null : customerSatisfaction,
          customer_feedback: customerFeedback.trim() || null,
          maker_notes: makerNotes.trim() || null,
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
    },
  });

  // SAVE 클릭 시점의 스냅샷을 캡쳐해서, 저장이 끝나면 그 스냅샷을 "저장된 상태"로 기록한다
  // (onSuccess 안에서 다시 계산하면, 저장 중 사용자가 계속 입력한 경우 아직 저장 안 된 값까지
  // "저장됨"으로 잘못 표시될 수 있어 클릭 시점 값을 고정해서 쓴다).
  const handleSave = () => {
    const snapshotAtSave = currentSnapshot;
    save.mutate(undefined, { onSuccess: () => setSavedSnapshot(snapshotAtSave) });
  };

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

  // 2026-10-06 사용자 정정: 별도 PRODUCTION PLAN 테이블이 아니라 기존 PRODUCTION(work_sessions)
  // 시스템을 그대로 재사용한다. CORE ELEMENT(Sheet/Cream/Filling)는 새 테이블 없이
  // work_session_formula_versions 행에 kind='CORE'/slot 태그를 붙여서 만든다. 위에서 사용자가
  // Flavoring Formula를 지정해둔 경우, pickEffectiveFormulaVersion으로 고른 버전을 "시작값"으로
  // 자동 채워 넣는다 — 잠겨있지 않고, Work Session 화면에서 언제든 바꿀 수 있다.
  // 이미 연결된 Work Session이 있으면 중복 생성하지 않고 그 화면으로 이동만 한다(버튼 쪽에서 분기).
  const createWorkSession = useMutation({
    mutationFn: async () => {
      if (!order.data) return;
      const o = order.data;
      const deliveryDate = o.pickup_at ? o.pickup_at.slice(0, 10) : o.event_date;
      const baseName =
        products.data?.find((p) => p.id === o.product_id)?.name || o.recipient || o.order_number;
      const userId = await currentUserId();
      const { data: session, error } = await supabase
        .from("work_sessions")
        .insert({
          user_id: userId,
          order_id: orderId,
          name: generateTitle(baseName, deliveryDate),
          status: "PLANNED",
          product_id: o.product_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const slotFormulaIds: Record<CoreSlot, string> = {
        SHEET: flavoringSheetFormulaId,
        CREAM: flavoringCreamFormulaId,
        FILLING: flavoringFillingFormulaId,
      };
      const coreRows = CORE_SLOTS.flatMap((slot) => {
        const formulaId = slotFormulaIds[slot];
        if (!formulaId) return [];
        const formula = formulas.data?.find((f) => f.id === formulaId);
        const version = formula ? pickEffectiveFormulaVersion(formula.formula_versions) : null;
        if (!version) return [];
        return [
          {
            user_id: userId,
            work_session_id: session.id,
            formula_version_id: version.id,
            kind: "CORE" as const,
            slot,
            multiplier: 1,
            mould_id: null,
            mould_qty: null,
            base_weight_id: null,
            base_weight_qty: null,
            sort_order: CORE_SLOTS.indexOf(slot),
          },
        ];
      });
      if (coreRows.length > 0) {
        const { error: rowsError } = await supabase.from("work_session_formula_versions").insert(coreRows);
        if (rowsError) throw rowsError;
      }
      return session.id;
    },
    onSuccess: async (sessionId) => {
      await queryClient.invalidateQueries({ queryKey: ["work_sessions", "by_order", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["work_sessions"] });
      if (sessionId) void navigate({ to: "/production/$sessionId", params: { sessionId } });
    },
  });

  // 2026-10-06 사용자 요청: ORDER → PRODUCT 승격. Order 텍스트를 그대로 복사하지 않고,
  // 연결된 Work Session이 있으면 그 work_session_formula_versions 행들이 실제로 선택한
  // Formula Version을 모아 Product Component로 옮긴다(component_id는 formula_versions.formulas를
  // 통해 구한다 — component_id가 없는 "기준 배합"에서 고른 행은 제외).
  // Work Session이 없어도 승격은 허용 — 그 경우 Product Component 없이 빈 Product만 생성(사용자 확인).
  const upgradeToProduct = useMutation({
    mutationFn: async () => {
      if (!order.data) return;
      const o = order.data;
      const deliveryDate = o.pickup_at ? o.pickup_at.slice(0, 10) : o.event_date;
      const baseName = o.recipient || o.order_number;
      const userId = await currentUserId();
      const { data: product, error } = await supabase
        .from("products")
        .insert({ user_id: userId, name: generateTitle(baseName, deliveryDate) })
        .select("id")
        .single();
      if (error) throw error;

      if (workSession.data) {
        const { data: rows, error: rowsError } = await supabase
          .from("work_session_formula_versions")
          .select("formula_version_id, formula_versions(formulas(component_id))")
          .eq("work_session_id", workSession.data.id);
        if (rowsError) throw rowsError;
        const elements = (rows ?? [])
          .map((r) => ({
            component_id: r.formula_versions?.formulas?.component_id ?? null,
            formula_version_id: r.formula_version_id,
          }))
          .filter((el): el is { component_id: string; formula_version_id: string } => el.component_id != null);
        if (elements.length > 0) {
          const { error: insertError } = await supabase.from("product_components").insert(
            elements.map((el, i) => ({
              user_id: userId,
              product_id: product.id,
              component_id: el.component_id,
              formula_version_id: el.formula_version_id,
              sort_order: i,
            })),
          );
          if (insertError) throw insertError;
        }
      }

      const { error: linkError } = await supabase.from("orders").update({ product_id: product.id }).eq("id", orderId);
      if (linkError) throw linkError;
      return product.id;
    },
    onSuccess: async (productId) => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      if (productId) void navigate({ to: "/products/$productId", params: { productId } });
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
        <div className="flex items-center gap-2">
          {/* 2026-10-06 사용자 요청: Status 색상은 SETTINGS의 ORDER STATUS COLORS 설정을
              그대로 따라가도록 — 드롭다운 옆에 현재 선택된 단계의 색을 점으로 보여준다. */}
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: orderStatusColor(statusColors, status) }}
            aria-hidden
          />
          <select
            className={selectClass + " w-auto"}
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
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
        {/* 2026-10-06 사용자 요청: 메모를 목적별로 분리 — 섞어 쓰지 않는다. */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="FLAVORING NOTE — Sheet/Cream/Filling 등 맛 밸런스 (내부용)">
            <textarea
              rows={4}
              className={inputClass}
              placeholder="예: 코코아 시트 + 바나나 필링, 전체적으로 덜 달게"
              value={flavoringNote}
              onChange={(e) => setFlavoringNote(e.target.value)}
            />
            {/* 2026-10-06 사용자 재확인: 자유 텍스트만으론 부족 — Sheet/Cream/Filling 각각 실제
                FORMULA까지 링크할 수 있어야 한다. FORMULA VERSION은 아직 안 정함 — WORK SESSION
                생성 시 pickEffectiveFormulaVersion으로 시작값만 자동 채우고, 그 뒤엔 WORK SESSION
                쪽에서 바꾼다. */}
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {(
                [
                  ["SHEET", flavoringSheetFormulaId, setFlavoringSheetFormulaId],
                  ["CREAM", flavoringCreamFormulaId, setFlavoringCreamFormulaId],
                  ["FILLING", flavoringFillingFormulaId, setFlavoringFillingFormulaId],
                ] as const
              ).map(([slot, value, setValue]) => (
                <label key={slot} className="flex items-center gap-2">
                  <span className="label-caps w-14 shrink-0 text-[10px] text-muted-foreground">
                    {CORE_SLOT_LABELS[slot]}
                  </span>
                  <select
                    className={selectClass}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    <option value="">— FORMULA 링크 안 함 —</option>
                    {(formulas.data ?? []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.components?.name ?? f.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Field>
          <Field label="DESIGN NOTE — 디자인/구조/조립">
            <textarea
              rows={4}
              className={inputClass}
              placeholder="예: 2단 구조, 초콜릿 튀일 장식은 배송 직전 부착"
              value={designNote}
              onChange={(e) => setDesignNote(e.target.value)}
            />
          </Field>
          <Field label="ORDER NOTE — 고객 요청/배송 등">
            <textarea
              rows={4}
              className={inputClass}
              placeholder="예: 오후 3시 이후 픽업 희망"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 2026-10-06 사용자 요청: Satisfaction — Status(진행 단계)와는 별개 개념이라 별도 섹션으로
          분리. Maker/Customer Satisfaction을 각각 독립 필드로 관리(향후 둘을 비교 분석하기 위함).
          SAVE/DELETE 버튼은 기존과 동일하게 이 페이지 전체(주문 정보 + Satisfaction)에 공통 적용. */}
      <SectionCard title="SATISFACTION">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="MAKER SATISFACTION — 내가 이 주문에 얼마나 만족했는가">
            <StarRating value={makerSatisfaction} onChange={setMakerSatisfaction} />
          </Field>
          <Field label="CUSTOMER SATISFACTION — 고객이 이 주문에 얼마나 만족했는가">
            <div className="space-y-1">
              <StarRating value={customerSatisfaction} onChange={setCustomerSatisfaction} />
              <button
                type="button"
                className="label-caps text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setCustomerSatisfaction("")}
              >
                {customerSatisfaction === "" ? "— NOT YET COLLECTED" : "✕ 미수집으로 되돌리기 (NOT YET COLLECTED)"}
              </button>
            </div>
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="CUSTOMER FEEDBACK — 고객의 실제 반응 (고객에게 노출되지 않음, 내부 기록용)">
            <textarea
              rows={3}
              className={inputClass}
              placeholder='예: "She absolutely loved the surprise!"'
              value={customerFeedback}
              onChange={(e) => setCustomerFeedback(e.target.value)}
            />
          </Field>
          <Field label="MAKER NOTES — 제작자 내부 평가 (고객에게 노출되지 않음)">
            <textarea
              rows={3}
              className={inputClass}
              placeholder='예: "Result was beautiful but production took too long."'
              value={makerNotes}
              onChange={(e) => setMakerNotes(e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 2026-10-06 사용자 정정: "PRODUCTION PLAN"이라는 별도 개념이 아니라 기존 PRODUCTION
          (work_sessions) 화면으로 바로 연결된다. 이미 연결된 Work Session/Product가 있으면
          "생성"이 아니라 "열기"로 바뀐다(중복 생성 금지). */}
      <SectionCard title="PRODUCTION / PRODUCT">
        <div className="flex flex-wrap items-center gap-2">
          {workSession.data ? (
            <Link
              to="/production/$sessionId"
              params={{ sessionId: workSession.data.id }}
              className={buttonClass}
            >
              OPEN WORK SESSION{workSession.data.name ? ` — ${workSession.data.name}` : ""}
            </Link>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={createWorkSession.isPending}
              onClick={() => createWorkSession.mutate()}
            >
              {createWorkSession.isPending ? "생성 중…" : "+ CREATE WORK SESSION"}
            </button>
          )}
          {order.data.product_id ? (
            <Link
              to="/products/$productId"
              params={{ productId: order.data.product_id }}
              className={buttonClass}
            >
              OPEN PRODUCT
            </Link>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={upgradeToProduct.isPending}
              onClick={() => upgradeToProduct.mutate()}
            >
              {upgradeToProduct.isPending ? "승격 중…" : "↑ UPGRADE TO PRODUCT"}
            </button>
          )}
        </div>
        {(createWorkSession.isError || upgradeToProduct.isError) && (
          <p className="mt-2 font-mono text-xs uppercase text-destructive">
            {((createWorkSession.error ?? upgradeToProduct.error) as Error).message}
          </p>
        )}
      </SectionCard>

      <div className="border border-border bg-card p-4">
        {save.isError && (
          <p className="mb-2 font-mono text-xs uppercase text-destructive">{(save.error as Error).message}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={!isDirty || save.isPending}
            onClick={handleSave}
          >
            {save.isPending ? "SAVING…" : "SAVE"}
          </button>
          {isDirty && (
            <button type="button" className={buttonClass} onClick={() => order.data && hydrateFromOrder(order.data)}>
              되돌리기
            </button>
          )}
          <span className="label-caps text-[10px] text-muted-foreground">
            {save.isPending ? "저장 중…" : isDirty ? "변경 사항이 있습니다 — 저장하려면 SAVE" : "✓ SAVED"}
          </span>
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
      </div>
    </div>
  );
}
