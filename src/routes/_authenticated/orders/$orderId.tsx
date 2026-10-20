import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  orderQuery,
  productsQuery,
  productSizesQuery,
  productComponentsQuery,
  pilotSettingsQuery,
  workSessionByOrderQuery,
  formulasQuery,
  mouldsQuery,
  cakeSizesQuery,
  techniqueCategoriesQuery,
  currentUserId,
  ORDER_STATUSES,
  ORDER_OCCASIONS,
  ORDER_OCCASION_CATEGORIES,
  ORDER_OCCASION_CATEGORY_MAP,
  ORDER_RECIPIENT_RELATIONSHIP_OPTIONS,
  ORDER_PAYMENT_STATUSES,
  ORDER_PRODUCT_LINES,
  CORE_SLOTS,
  CORE_SLOT_LABELS,
  type CoreSlot,
  orderStatusLabel,
  orderStatusColor,
  type OrderListRow,
  type OrderStatus,
  type OrderOccasion,
  type OrderOccasionCategory,
  type OrderRecipientRelationship,
  type OrderCakeSize,
  type OrderPaymentStatus,
  type OrderProductLineKey,
} from "@/lib/queries";
import { pickEffectiveFormulaVersion } from "@/lib/formula";
import { resolveSlotGroup } from "@/lib/technique";
import { applyDefaultWorkflowForFormulaVersion } from "@/lib/workflow-template";
import { suggestedMultiplierFromTarget } from "@/lib/work-session";
import { mouldBatchMultiplier } from "@/lib/formula-calc";
import { mouldOptionLabel } from "@/components/pilot/MouldSelect";
import { formatDateTime, generateTitle } from "@/lib/datetime";
import { CustomerSelect } from "@/components/pilot/CustomerSelect";
import { ProductSelect } from "@/components/pilot/ProductSelect";
import { OrderMoodboardSection } from "@/components/pilot/OrderMoodboardSection";
import { OrderResultPhotosSection } from "@/components/pilot/OrderResultPhotosSection";
import {
  Field,
  SectionCard,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "@/components/pilot/ui";

// orders.audience check constraint values (2026-10-20).
const ORDER_AUDIENCES = ["Adults", "Adults + children", "Children"] as const;

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  head: () => ({
    meta: [{ title: "PILOT — Order" }, { name: "description", content: "Order detail" }],
  }),
  component: OrderDetailPage,
});

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

// 2026-10-06 사용자 요청: Satisfaction(만족도) — Status와는 별개의 5단계 평가.
const SATISFACTION_LABELS: Record<number, string> = {
  1: "Very Dissatisfied",
  2: "Dissatisfied",
  3: "Neutral",
  4: "Satisfied",
  5: "Very Satisfied",
};

/** Maker/Customer Satisfaction 공용 별점 입력 — value가 ""(미입력/미수집)이면 별이 전부 빈 상태. */
function StarRating({ value, onChange }: { value: number | ""; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="px-0.5 text-xl leading-none text-border hover:text-foreground"
            aria-label={`${n} — ${SATISFACTION_LABELS[n]}`}
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
  // 2026-10-20: REQ-xxxx 번호는 고객 요청(shco_order_requests)에서 생성되며 order_id로 이 주문에 연결된다(읽기전용 표시).
  const linkedRequest = useQuery({
    queryKey: ["order-linked-request", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shco_order_requests")
        .select("request_number")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const formulas = useQuery(formulasQuery());
  const statusColors =
    (pilotSettings.data?.order_status_colors as Record<string, string> | null) ?? null;
  // 2026-10-12 사용자 요청: SHEET/CREAM/FILLING 각 칸에는 TECHNIQUE CATEGORIES에서 그 슬롯으로
  // 분류된(또는 상속된) COMPONENT의 FORMULA만 뜨도록 — 이름으로 추측하지 않고 명시적 분류 기준으로.
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const formulasForSlot = (slot: CoreSlot, currentValue: string) =>
    (formulas.data ?? []).filter((f) => {
      // 기존에 이미 선택돼 있던 FORMULA는 분류가 바뀌거나 없어도 계속 보여준다(과거 데이터 유실 방지).
      if (f.id === currentValue) return true;
      const catId = f.components?.technique_category_id ?? null;
      return resolveSlotGroup(techniqueCategories.data ?? [], catId) === slot;
    });

  // 2026-10-15 사용자 요청: "무드보드 아래에 결과물사진 업로드할수있게... 근데 복잡해지니까
  // 탭으로 이미지용 공간 구분하자" — 무드보드 + 결과물 사진(VISUALS)과 기존 입력 폼들
  // (ORDER DETAIL)을 탭으로 분리. SAVE/DELETE 바는 둘 다에 적용되므로 탭 밖(페이지 하단)에 둔다.
  // 2026-10-15 사용자 재요청: "visuals가 먼저 뜨게해줘" — 탭 순서도 VISUALS를 앞으로, 페이지
  // 진입 시 기본 선택 탭도 VISUALS로.
  const [activeTab, setActiveTab] = useState<"ORDER DETAIL" | "VISUALS">("VISUALS");

  const [orderNumber, setOrderNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientRelationship, setRecipientRelationship] = useState<
    OrderRecipientRelationship | ""
  >("");
  const [recipientRelationshipOtherNote, setRecipientRelationshipOtherNote] = useState("");
  const [occasion, setOccasion] = useState<OrderOccasion | "">("");
  const [occasionOtherNote, setOccasionOtherNote] = useState("");
  // 2026-10-20 사용자 요청: OCCASION을 formality 기준 2단계(그룹→세부항목) 드롭다운으로 —
  // 이 카테고리는 DB에 저장하지 않는 UI 전용 상태(두번째 select의 옵션을 필터링하는 용도)이며,
  // hydrateFromOrder에서 저장된 occasion 값으로부터 역추적해 초기값을 맞춘다.
  const [occasionCategory, setOccasionCategory] = useState<OrderOccasionCategory>(
    ORDER_OCCASION_CATEGORIES[0],
  );
  // 2026-10-12 사용자 요청: WANN Weekly OS 제품 라인과 연결 — CONFIRMED 전환 시
  // sync_confirmed_order_to_planner() 트리거가 이 값을 그대로 WANN 프로젝트에 실어보낸다.
  const [productLine, setProductLine] = useState<OrderProductLineKey | "">("");
  const [eventDate, setEventDate] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [cakeSize, setCakeSize] = useState<OrderCakeSize | "">("");
  // 2026-10-20: 주문의 CAKE SIZE = SETTINGS > CAKE SIZES 목록에서 고른 값(기존 enum cakeSize는 legacy로 보존만).
  const [cakeSizeId, setCakeSizeId] = useState("");
  const cakeSizes = useQuery(cakeSizesQuery());
  const [customSize, setCustomSize] = useState("");
  const [customSizeCm, setCustomSizeCm] = useState("");
  const [servings, setServings] = useState("");
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus | "">("");
  const [status, setStatus] = useState<OrderStatus>("INTAKE");
  const [productId, setProductId] = useState("");
  // 2026-10-12 사용자 요청: orders.cake_size(독립 enum)와 별개로, PRODUCT를 연결한 경우
  // 그 PRODUCT에 등록된 product_sizes 중 "최종 사이즈"를 FK로 골라둘 수 있게 한다 — Work
  // Session을 이 ORDER에서 만들 때 그대로 넘겨서 PRODUCT SIZE 기준 자동 배수 계산에 쓰인다.
  const [productSizeId, setProductSizeId] = useState("");
  const productSizes = useQuery({
    ...productSizesQuery(productId),
    enabled: Boolean(productId),
  });
  // 2026-10-20 사용자 요청: "최종 케익 사이즈"(위 product_size_id — PRODUCT에 연결, 단가계산용)와는
  // 별개로 "시트 사이즈"를 따로 관리한다 — PRODUCT SIZE 데이터가 없는 제품/커스텀 사이즈 주문이라도
  // 이 몰드만 골라두면 WORK SESSION 생성 시 그 몰드 기준으로 자동 배수 계산이 가능해진다.
  const [sheetMouldId, setSheetMouldId] = useState("");
  const moulds = useQuery(mouldsQuery());
  // 2026-10-06 사용자 요청: Order의 메모는 성격이 다른 세 가지로 분리 관리한다 — 섞어서 쓰지 않음.
  // - Flavoring Note: Sheet/Cream/Filling 등 전체 맛 밸런스(내부용, 새 flavoring_note 컬럼)
  // - Design Note: 디자인/구조/조립(기존에 있었지만 UI에 없던 design_notes 컬럼 재사용)
  // - Order Note: 고객 요청/배송 등 주문 자체에 대한 메모(기존 notes 컬럼, 라벨만 변경)
  const [designNote, setDesignNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  // 2026-10-06 사용자 재확인: FLAVORING NOTE는 자유 텍스트뿐 아니라 실제 FORMULA까지 링크할 수
  // 있어야 한다(Sheet/Cream/Filling 각각). FORMULA VERSION까지는 아직 정하지 않음 — 실제 버전은
  // WORK SESSION 생성 시 시작값으로 자동 채워지되, 그 뒤엔 언제든 WORK SESSION 쪽에서 바꿀 수 있다.
  const [flavoringSheetFormulaId, setFlavoringSheetFormulaId] = useState("");
  const [flavoringCreamFormulaId, setFlavoringCreamFormulaId] = useState("");
  const [flavoringFillingFormulaId, setFlavoringFillingFormulaId] = useState("");

  // 2026-10-12 사용자 요청: "오더 넣고 기존 상품을 링크하는 경우"에만 그 PRODUCT의 현재 레시피
  // (컴포넌트별 FORMULA)를 보여줘서 SHEET/CREAM/FILLING에 바로 적용할 수 있게 한다 — "기획해서
  // 상품으로 업그레이드"하는 경우(FLAVORING NOTE를 먼저 채우고 나중에 UPGRADE TO PRODUCT)는
  // 이 시점엔 PRODUCT가 아직 없으므로(비어있으므로) 자동으로 영향받지 않는다.
  const productLinks = useQuery({
    ...productComponentsQuery(productId),
    enabled: Boolean(productId),
  });
  const productRecipeFormulas = (() => {
    const seen = new Map<
      string,
      { formulaId: string; formulaName: string; versionNumber: number; componentName: string }
    >();
    for (const l of productLinks.data ?? []) {
      const f = l.formula_versions?.formulas;
      if (l.formula_version_id && f) {
        seen.set(f.id, {
          formulaId: f.id,
          formulaName: f.name,
          versionNumber: l.formula_versions?.version_number ?? 0,
          componentName: l.components?.name ?? l.ingredients?.name ?? "—",
        });
      }
    }
    return [...seen.values()];
  })();

  // 2026-10-06 사용자 요청: Satisfaction(만족도) — Status(진행 단계)와는 완전히 별개 개념이라
  // 독립된 필드로 관리한다. makerSatisfaction/customerSatisfaction은 1~5 또는 "" (미입력/미수집).
  // customerSatisfaction은 특히 "아직 미수집"과 "1점"을 절대 같은 값으로 저장하면 안 되므로
  // ""(= null, 미수집)과 1~5를 구분되는 상태로 다룬다.
  const [makerSatisfaction, setMakerSatisfaction] = useState<number | "">("");
  const [customerSatisfaction, setCustomerSatisfaction] = useState<number | "">("");
  const [customerFeedback, setCustomerFeedback] = useState("");
  const [makerNotes, setMakerNotes] = useState("");
  // 2026-10-20 사용자 요청: 웹 주문서의 알레르기/식이 요구사항을 PILOT 주문에서도 보이게.
  const [dietaryRequirements, setDietaryRequirements] = useState("");
  // 2026-10-20 사용자 요청: 웹 주문서 "Who will be enjoying the cake?" 답을 PILOT에서도 보이게.
  const [audience, setAudience] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // 수정사항 저장 여부를 시각적으로 보여주기 위한 "저장된 상태" 스냅샷(2026-10-06, 사용자
  // 요청 — SAVE 누르면 다시 수정하기 전까지 버튼이 비활성화되고 "✓ SAVED"로 보이게 함.
  // FORMULA 페이지(formulas/$formulaId.tsx)의 isDirty 패턴과 동일한 방식).
  // buildRowSnapshot: order.data(서버에 저장된 행) 기준으로 직렬화 — "마지막으로 저장된 상태".
  const buildRowSnapshot = (o: OrderListRow) =>
    JSON.stringify({
      orderNumber: o.order_number ?? "",
      customerId: o.customer_id ?? "",
      recipient: o.recipient ?? "",
      recipientRelationship: o.recipient_relationship ?? "",
      recipientRelationshipOtherNote: o.recipient_relationship_other_note ?? "",
      occasion: o.occasion ?? "",
      occasionOtherNote: o.occasion_other_note ?? "",
      productLine: o.product_line ?? "",
      eventDate: o.event_date ?? "",
      pickupAt: isoToDatetimeLocal(o.pickup_at),
      cakeSize: o.cake_size ?? "",
      cakeSizeId: o.cake_size_id ?? "",
      customSize: o.custom_size ?? "",
      customSizeCm: o.custom_size_cm != null ? String(o.custom_size_cm) : "",
      servings: o.servings != null ? String(o.servings) : "",
      price: o.price != null ? String(o.price) : "",
      paymentStatus: o.payment_status ?? "",
      status: (o.status as OrderStatus) ?? "INTAKE",
      productId: o.product_id ?? "",
      productSizeId: o.product_size_id ?? "",
      sheetMouldId: o.sheet_mould_id ?? "",
      flavoringSheetFormulaId: o.flavoring_sheet_formula_id ?? "",
      flavoringCreamFormulaId: o.flavoring_cream_formula_id ?? "",
      flavoringFillingFormulaId: o.flavoring_filling_formula_id ?? "",
      designNote: o.design_notes ?? "",
      orderNote: o.notes ?? "",
      dietaryRequirements: o.dietary_requirements ?? "",
      audience: o.audience ?? "",
      deliveryAddress: o.delivery_address ?? "",
      makerSatisfaction: o.maker_satisfaction ?? "",
      customerSatisfaction: o.customer_satisfaction ?? "",
      customerFeedback: o.customer_feedback ?? "",
      makerNotes: o.maker_notes ?? "",
    });

  const [savedSnapshot, setSavedSnapshot] = useState("");

  const hydrateFromOrder = (o: OrderListRow) => {
    setOrderNumber(o.order_number ?? "");
    setCustomerId(o.customer_id ?? "");
    setRecipient(o.recipient ?? "");
    setRecipientRelationship(o.recipient_relationship ?? "");
    setRecipientRelationshipOtherNote(o.recipient_relationship_other_note ?? "");
    setOccasion(o.occasion ?? "");
    setOccasionOtherNote(o.occasion_other_note ?? "");
    setOccasionCategory(
      o.occasion ? ORDER_OCCASION_CATEGORY_MAP[o.occasion] : ORDER_OCCASION_CATEGORIES[0],
    );
    setProductLine((o.product_line as OrderProductLineKey | null) ?? "");
    setEventDate(o.event_date ?? "");
    setPickupAt(isoToDatetimeLocal(o.pickup_at));
    setCakeSize(o.cake_size ?? "");
    setCustomSize(o.custom_size ?? "");
    setCustomSizeCm(o.custom_size_cm != null ? String(o.custom_size_cm) : "");
    setServings(o.servings != null ? String(o.servings) : "");
    setPrice(o.price != null ? String(o.price) : "");
    setPaymentStatus(o.payment_status ?? "");
    setStatus((o.status as OrderStatus) ?? "INTAKE");
    setProductId(o.product_id ?? "");
    setCakeSizeId(o.cake_size_id ?? "");
    setProductSizeId(o.product_size_id ?? "");
    setSheetMouldId(o.sheet_mould_id ?? "");
    setFlavoringSheetFormulaId(o.flavoring_sheet_formula_id ?? "");
    setFlavoringCreamFormulaId(o.flavoring_cream_formula_id ?? "");
    setFlavoringFillingFormulaId(o.flavoring_filling_formula_id ?? "");
    setDesignNote(o.design_notes ?? "");
    setOrderNote(o.notes ?? "");
    setDietaryRequirements(o.dietary_requirements ?? "");
    setAudience(o.audience ?? "");
    setDeliveryAddress(o.delivery_address ?? "");
    setMakerSatisfaction(o.maker_satisfaction ?? "");
    setCustomerSatisfaction(o.customer_satisfaction ?? "");
    setCustomerFeedback(o.customer_feedback ?? "");
    setMakerNotes(o.maker_notes ?? "");
  };

  useEffect(() => {
    if (!order.data) return;
    hydrateFromOrder(order.data);
    setSavedSnapshot(buildRowSnapshot(order.data));
  }, [order.data]);

  // currentSnapshot: 지금 화면(로컬 state) 기준 — savedSnapshot과 다르면 "변경사항 있음".
  const currentSnapshot = JSON.stringify({
    orderNumber,
    customerId,
    recipient,
    recipientRelationship,
    recipientRelationshipOtherNote,
    occasion,
    occasionOtherNote,
    productLine,
    eventDate,
    pickupAt,
    cakeSize,
    cakeSizeId,
    customSize,
    customSizeCm,
    servings,
    price,
    paymentStatus,
    status,
    productId,
    // 2026-10-20: productSizeId/sheetMouldId가 그동안 여기 빠져있어서 그 값만 바꾸고 저장해도
    // "저장되지 않은 변경사항" 표시가 안 뜨던 기존 버그를 같이 고쳤다.
    productSizeId,
    sheetMouldId,
    flavoringSheetFormulaId,
    flavoringCreamFormulaId,
    flavoringFillingFormulaId,
    designNote,
    orderNote,
    dietaryRequirements,
    audience,
    deliveryAddress,
    makerSatisfaction,
    customerSatisfaction,
    customerFeedback,
    makerNotes,
  });
  const isDirty = Boolean(order.data) && currentSnapshot !== savedSnapshot;

  const save = useMutation({
    mutationFn: async () => {
      const trimmedOrderNumber = orderNumber.trim();
      if (!trimmedOrderNumber) {
        throw new Error("ORDER NUMBER IS REQUIRED");
      }
      const { error } = await supabase
        .from("orders")
        .update({
          order_number: trimmedOrderNumber,
          customer_id: customerId || null,
          recipient: recipient.trim() || null,
          recipient_relationship: recipientRelationship || null,
          recipient_relationship_other_note:
            recipientRelationship === "Other"
              ? recipientRelationshipOtherNote.trim() || null
              : null,
          occasion: occasion || null,
          occasion_other_note: occasion === "Other" ? occasionOtherNote.trim() || null : null,
          product_line: productLine || null,
          event_date: eventDate || null,
          pickup_at: datetimeLocalToIso(pickupAt),
          cake_size: cakeSize || null,
          cake_size_id: cakeSizeId || null,
          custom_size: cakeSize === "Custom" ? customSize.trim() || null : null,
          custom_size_cm:
            cakeSize === "Custom" && customSizeCm.trim() ? Number(customSizeCm) : null,
          servings: servings.trim() ? Number(servings) : null,
          price: price.trim() ? Number(price) : null,
          payment_status: paymentStatus || null,
          status,
          product_id: productId || null,
          product_size_id: productSizeId || null,
          sheet_mould_id: sheetMouldId || null,
          flavoring_sheet_formula_id: flavoringSheetFormulaId || null,
          flavoring_cream_formula_id: flavoringCreamFormulaId || null,
          flavoring_filling_formula_id: flavoringFillingFormulaId || null,
          design_notes: designNote.trim() || null,
          notes: orderNote.trim() || null,
          dietary_requirements: dietaryRequirements.trim() || null,
          audience: audience || null,
          delivery_address: deliveryAddress.trim() || null,
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
      // 2026-10-06 사용자 요청: 이름을 RECIPIENT가 아니라 PRODUCT명으로 — PRODUCT 칸에서 아직
      // SAVE를 안 누른 상태로 바로 WORK SESSION을 만들어도 반영되게, 화면에 선택된(아직 저장 전일
      // 수 있는) productId를 저장된 o.product_id보다 우선한다.
      const effectiveProductId = productId || o.product_id || null;
      // 2026-10-12 사용자 요청: ORDER에 PRODUCT SIZE가 골라져 있으면 WORK SESSION 생성 시 그대로
      // 넘겨서(work_sessions.product_size_id) PRODUCT SIZE 기준 자동 배수 계산에 바로 쓰일 수 있게.
      const effectiveProductSizeId = productSizeId || o.product_size_id || null;
      // 2026-10-20 사용자 요청: PRODUCT SIZE 기준 계산(product_components.quantity_g)이 가능한
      // 경우(위) 그게 우선이지만, PRODUCT SIZE 데이터가 아예 없는 제품/커스텀 사이즈 주문도
      // "시트 사이즈"(몰드)만 골라져 있으면 그 몰드 기준으로 자동 배수 계산이 가능해야 한다.
      const selectedCakeSize = (cakeSizes.data ?? []).find((c) => c.id === cakeSizeId);
      const effectiveSheetMouldId =
        selectedCakeSize?.sheet_mould_id || sheetMouldId || o.sheet_mould_id || null;
      const mouldsById = new Map((moulds.data ?? []).map((m) => [m.id, m]));
      const baseName =
        products.data?.find((p) => p.id === effectiveProductId)?.name ||
        o.recipient ||
        o.order_number;
      const userId = await currentUserId();
      const { data: session, error } = await supabase
        .from("work_sessions")
        .insert({
          user_id: userId,
          order_id: orderId,
          name: generateTitle(baseName, deliveryDate),
          status: "PLANNED",
          product_id: effectiveProductId,
          product_size_id: effectiveProductSizeId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const slotFormulaIds: Record<CoreSlot, string> = {
        SHEET: flavoringSheetFormulaId,
        CREAM: flavoringCreamFormulaId,
        FILLING: flavoringFillingFormulaId,
      };
      // 2026-10-21 사용자 요청("시폰 레시피 task 기본꺼 왜 안떠?") — 여기서 CORE 재료 행을
      // Supabase에 직접 insert하고 끝나서, $sessionId.tsx의 "+ ADD SHEET/CREAM/FILLING"에서만
      // 돌던 기본 WORKFLOW 적용 로직을 한 번도 안 거치는 게 원인이었다. coreRows를 만들 때
      // 그 Formula도 같이 들고 있다가, insert 성공 뒤 각 행마다 applyDefaultWorkflowForFormulaVersion을
      // 호출해서 $sessionId.tsx와 똑같이 템플릿(또는 기본 TASK 1개)이 깔리도록 한다.
      //
      // 2026-10-27 사용자 요청("몰드·용량 시스템 통합 개선안" 3단계를 전체 통합 전에 먼저 적용):
      // 이전에는 여기서 CORE 행을 만들 때 multiplier=1, mould_id/mould_qty=null로 고정해버려서,
      // ORDER에 PRODUCT SIZE가 이미 연결돼 있어도 생성 직후 WORK SESSION에서 매번 손으로 몰드·배수를
      // 다시 맞춰야 했다(문제 7). $sessionId.tsx의 "+ ADD" 폼과 같은 로직으로 PRODUCT SIZE의
      // product_components.quantity_g를 읽어 배수를 역산하고, scaling_mode가 MOULD인 Component는
      // 사이즈 기준으로 만들어도 몰드 정체성(mould_id)을 항상 같이 채워 넣는다(문제 6과 같은 원인).
      let productComponentRows: {
        component_id: string | null;
        quantity_g: number | null;
        product_size_id: string | null;
      }[] = [];
      if (effectiveProductId) {
        const { data: pcData, error: pcError } = await supabase
          .from("product_components")
          .select("component_id, quantity_g, product_size_id")
          .eq("product_id", effectiveProductId);
        if (pcError) throw pcError;
        productComponentRows = pcData ?? [];
      }

      const coreVersionIds = CORE_SLOTS.flatMap((slot) => {
        const formula = formulas.data?.find((f) => f.id === slotFormulaIds[slot]);
        const version = formula ? pickEffectiveFormulaVersion(formula.formula_versions) : null;
        return version ? [version.id] : [];
      });
      const baseGramsByVersion: Record<string, number> = {};
      if (coreVersionIds.length > 0) {
        const { data: ingredientRows, error: ingError } = await supabase
          .from("formula_version_ingredients")
          .select("formula_version_id, amount")
          .in("formula_version_id", coreVersionIds);
        if (ingError) throw ingError;
        for (const row of ingredientRows ?? []) {
          baseGramsByVersion[row.formula_version_id] =
            (baseGramsByVersion[row.formula_version_id] ?? 0) + Number(row.amount);
        }
      }

      const coreRows = CORE_SLOTS.flatMap((slot) => {
        const formulaId = slotFormulaIds[slot];
        if (!formulaId) return [];
        const formula = formulas.data?.find((f) => f.id === formulaId);
        const version = formula ? pickEffectiveFormulaVersion(formula.formula_versions) : null;
        if (!version || !formula) return [];

        const isMould = (formula.components?.scaling_mode ?? null) === "MOULD";
        const sizeMatch = formula.components?.id
          ? productComponentRows.find(
              (pc) =>
                pc.component_id === formula.components!.id &&
                pc.product_size_id === effectiveProductSizeId,
            )
          : undefined;
        const sizeTargetGrams = sizeMatch?.quantity_g != null ? Number(sizeMatch.quantity_g) : null;
        const baseTotalGrams = baseGramsByVersion[version.id] ?? 0;
        const suggestedFromSize = suggestedMultiplierFromTarget(sizeTargetGrams, 1, baseTotalGrams);

        // PRODUCT SIZE 기준 타깃이 없고(이 제품에 사이즈 데이터가 없거나, 주문이 커스텀 사이즈라
        // 어차피 매칭이 안 됨) MOULD 기준 Component라면, "시트 사이즈"로 골라둔 몰드를 기준으로
        // 배수를 역산한다 — version의 기본 몰드(1배 기준) 대비 목표 몰드의 기준중량 비율.
        let suggested = suggestedFromSize;
        let resolvedMouldId = isMould ? (version.default_mould_id ?? null) : null;
        if (suggestedFromSize == null && isMould && effectiveSheetMouldId) {
          const targetMould = mouldsById.get(effectiveSheetMouldId) ?? null;
          const baseMould = version.default_mould_id
            ? (mouldsById.get(version.default_mould_id) ?? null)
            : null;
          const { multiplier, mismatch } = mouldBatchMultiplier(1, targetMould, baseMould);
          if (!mismatch) {
            suggested = multiplier;
            resolvedMouldId = effectiveSheetMouldId;
          }
        }

        return [
          {
            formula,
            row: {
              user_id: userId,
              work_session_id: session.id,
              formula_version_id: version.id,
              kind: "CORE" as const,
              slot,
              multiplier: suggested ?? 1,
              mould_id: resolvedMouldId,
              mould_qty: isMould ? 1 : null,
              base_weight_id: null,
              base_weight_qty: null,
              // 2026-10-19 "테이블 통합" 1단계: 통합 capacity_id/capacity_qty도 함께 채운다(dual-write).
              capacity_id: resolvedMouldId,
              capacity_qty: isMould ? 1 : null,
              sort_order: CORE_SLOTS.indexOf(slot),
            },
          },
        ];
      });
      if (coreRows.length > 0) {
        const { error: rowsError } = await supabase
          .from("work_session_formula_versions")
          .insert(coreRows.map((r) => r.row));
        if (rowsError) throw rowsError;

        for (const { formula, row } of coreRows) {
          const { error: workflowError } = await applyDefaultWorkflowForFormulaVersion({
            sessionId: session.id,
            userId,
            formulaVersionId: row.formula_version_id,
            component: formula.components ?? null,
            formulaTechniqueCategoryId: formula.technique_category_id ?? null,
            techniqueCategories: techniqueCategories.data ?? [],
          });
          if (workflowError) {
            // 세션/재료 연결 자체는 이미 성공했으니, 기본 워크플로 적용 실패는 콘솔에만 남기고
            // 세션 생성 흐름은 막지 않는다 ($sessionId.tsx의 add mutation과 동일한 방침).
            console.error("Default workflow auto-apply failed:", workflowError);
          }
        }
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
          .filter(
            (el): el is { component_id: string; formula_version_id: string } =>
              el.component_id != null,
          );
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

      const { error: linkError } = await supabase
        .from("orders")
        .update({ product_id: product.id })
        .eq("id", orderId);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link
            to="/orders"
            className="label-caps text-xs text-muted-foreground hover:text-foreground"
          >
            ← ORDERS
          </Link>
          <input
            className="label-caps w-full max-w-[16rem] border-0 bg-transparent p-0 text-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            aria-label="ORDER NUMBER"
          />
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

      <div className="flex items-center gap-2 border-b border-border">
        {(["VISUALS", "ORDER DETAIL"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`label-caps -mb-px border-b-2 px-3 py-2 text-xs transition-colors ${
              activeTab === tab
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "VISUALS" ? (
        <div className="space-y-4">
          {/* 2026-10-13 사용자 요청: "오더마다 무드보드를 만들고싶은데, 디자인 아이디어 구상용으로.
              피그마 ppt 처럼 이미지를 스크랩해서 바로 붙여넣기할수 있는 보드" */}
          <OrderMoodboardSection orderId={order.data.id} />
          {/* 2026-10-15 사용자 요청: "무드보드 아래에 결과물사진 업로드할수있게 이미지 박스만들어줘" */}
          <OrderResultPhotosSection orderId={order.data.id} />
          {/* 2026-10-20 사용자 요청: DESIGN NOTE를 ORDER DETAIL에서 VISUALS(사진들 아래)로 이동.
              SAVE 바는 탭 밖이라 여기서 수정해도 그대로 저장된다. */}
          <SectionCard title="DESIGN NOTE">
            <Field label="DESIGN / STRUCTURE / ASSEMBLY">
              <textarea
                rows={4}
                className={inputClass}
                placeholder="e.g. 2 tiers, chocolate tuile decoration attached just before delivery"
                value={designNote}
                onChange={(e) => setDesignNote(e.target.value)}
              />
            </Field>
          </SectionCard>
        </div>
      ) : (
        <>
          <SectionCard title="CUSTOMER DETAILS">
            {/* 2026-10-20 사용자 요청: 2열 기준 필드 순서 재배치 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="CUSTOMER">
                <CustomerSelect value={customerId} onChange={setCustomerId} />
              </Field>
              <Field label="REQUEST NUMBER">
                <input
                  className={inputClass}
                  readOnly
                  value={linkedRequest.data?.request_number ?? ""}
                  placeholder="—"
                />
              </Field>
              <Field label="RECIPIENT">
                <input
                  className={inputClass}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </Field>
              <Field label="RECIPIENT RELATIONSHIP">
                <select
                  className={selectClass}
                  value={recipientRelationship}
                  onChange={(e) =>
                    setRecipientRelationship(e.target.value as OrderRecipientRelationship | "")
                  }
                >
                  <option value="">— SELECT —</option>
                  {ORDER_RECIPIENT_RELATIONSHIP_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                  {recipientRelationship &&
                    !ORDER_RECIPIENT_RELATIONSHIP_OPTIONS.some(
                      (r) => r.value === recipientRelationship,
                    ) && (
                      <option value={recipientRelationship}>
                        {recipientRelationship} (previous value)
                      </option>
                    )}
                </select>
                {recipientRelationship === "Other" && (
                  <input
                    className={inputClass + " mt-1"}
                    placeholder="Enter manually"
                    value={recipientRelationshipOtherNote}
                    onChange={(e) => setRecipientRelationshipOtherNote(e.target.value)}
                  />
                )}
              </Field>
              <Field label="OCCASION">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
                  <select
                    className={selectClass + " sm:w-[9.5rem] sm:shrink-0"}
                    value={occasionCategory}
                    onChange={(e) => {
                      const nextCategory = e.target.value as OrderOccasionCategory;
                      setOccasionCategory(nextCategory);
                      // 선택된 occasion이 새 카테고리에 안 속하면(Other는 항상 양쪽에 있으므로 예외)
                      // 비워서 사용자가 새 그룹 안에서 다시 고르게 한다.
                      if (
                        occasion &&
                        occasion !== "Other" &&
                        ORDER_OCCASION_CATEGORY_MAP[occasion] !== nextCategory
                      ) {
                        setOccasion("");
                      }
                    }}
                  >
                    {ORDER_OCCASION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1">
                    <select
                      className={selectClass}
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value as OrderOccasion | "")}
                    >
                      <option value="">— SELECT —</option>
                      {ORDER_OCCASIONS.filter(
                        (o) => o === "Other" || ORDER_OCCASION_CATEGORY_MAP[o] === occasionCategory,
                      ).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    {occasion === "Other" && (
                      <input
                        className={inputClass + " mt-1"}
                        placeholder="Enter manually"
                        value={occasionOtherNote}
                        onChange={(e) => setOccasionOtherNote(e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </Field>
              <Field label="ENJOYED BY">
                <select
                  className={selectClass}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  <option value="">— SELECT —</option>
                  {ORDER_AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="EVENT DATE">
                <input
                  type="date"
                  className={inputClass}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </Field>
              <Field label="PICKUP / DELIVERY AT">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={pickupAt}
                  onChange={(e) => setPickupAt(e.target.value)}
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
              <Field label="DELIVERY ADDRESS">
                <input
                  className={inputClass}
                  placeholder="Leave empty for pickup"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="DIETARY REQUIREMENTS">
                  <textarea
                    rows={2}
                    className={inputClass}
                    placeholder="e.g. Nut free, Halal friendly"
                    value={dietaryRequirements}
                    onChange={(e) => setDietaryRequirements(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="PAYMENT STATUS">
                <select
                  className={selectClass}
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as OrderPaymentStatus | "")}
                >
                  <option value="">— SELECT —</option>
                  {ORDER_PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="ORDER NOTE">
                  <textarea
                    rows={3}
                    className={inputClass}
                    placeholder="e.g. Prefer pickup after 3pm"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* 2026-10-20 사용자 요청: "손님디테일은 디테일대로, 생산관련 디테일은... 분류해줘 박스자체를
          분류해서 보기쉽게" — 기존 단일 "주문 정보" 박스를 CUSTOMER DETAILS / PRODUCTION DETAILS
          두 박스로 분리. */}
          <SectionCard title="PRODUCTION DETAILS">
            {/* 2026-10-20 사용자 요청: 2열 기준 필드 순서 재배치, FORMULA 드롭다운 3개는 아래 행에 3열 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="PRODUCT LINE">
                <select
                  className={selectClass}
                  value={productLine}
                  onChange={(e) => setProductLine(e.target.value as OrderProductLineKey | "")}
                >
                  <option value="">— SELECT —</option>
                  {ORDER_PRODUCT_LINES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  On CONFIRMED, a project is created/synced to this product line in the WANN Weekly OS calendar.
                </p>
              </Field>
              <div className="hidden md:block" aria-hidden />
              <Field label="PRODUCT">
                <ProductSelect
                  value={productId}
                  onChange={(next) => {
                    setProductId(next);
                    setProductSizeId("");
                  }}
                  emptyLabel="TBD"
                />
              </Field>
              <Field label="CAKE SIZE">
                <select
                  className={selectClass}
                  value={cakeSizeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCakeSizeId(id);
                    const picked = (cakeSizes.data ?? []).find((c) => c.id === id);
                    if (picked?.servings != null) setServings(String(picked.servings));
                  }}
                >
                  <option value="">— SELECT —</option>
                  {(cakeSizes.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {(() => {
                  const picked = (cakeSizes.data ?? []).find((c) => c.id === cakeSizeId);
                  const mould = picked?.sheet_mould_id
                    ? (moulds.data ?? []).find((m) => m.id === picked.sheet_mould_id)
                    : undefined;
                  if (picked) {
                    return (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {picked.servings != null ? `${picked.servings} servings` : "servings not set"} ·{" "}
                        {mould ? `sheet: ${mouldOptionLabel(mould)}` : "no sheet mould set"} (edit in
                        SETTINGS → CAKE SIZES)
                      </p>
                    );
                  }
                  if (cakeSize) {
                    return (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Previously entered: {cakeSize}
                        {cakeSize === "Custom" && customSize ? ` — ${customSize}` : ""}
                      </p>
                    );
                  }
                  return null;
                })()}
              </Field>
              <Field label="SERVINGS">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={inputClass}
                  placeholder="e.g. 10"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="FLAVORING FORMULAS">
                {/* 2026-10-06 사용자 재확인: 자유 텍스트만으론 부족 — Sheet/Cream/Filling 각각 실제
                FORMULA까지 링크할 수 있어야 한다. FORMULA VERSION은 아직 안 정함 — WORK SESSION
                생성 시 pickEffectiveFormulaVersion으로 시작값만 자동 채우고, 그 뒤엔 WORK SESSION
                쪽에서 바꾼다. */}
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      ["SHEET", flavoringSheetFormulaId, setFlavoringSheetFormulaId],
                      ["CREAM", flavoringCreamFormulaId, setFlavoringCreamFormulaId],
                      ["FILLING", flavoringFillingFormulaId, setFlavoringFillingFormulaId],
                    ] as const
                  ).map(([slot, value, setValue]) => (
                    <label key={slot} className="flex flex-col gap-1">
                      <span className="label-caps text-[10px] text-muted-foreground">
                        {CORE_SLOT_LABELS[slot]}
                      </span>
                      <select
                        className={selectClass}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      >
                        <option value="">— NO FORMULA LINKED —</option>
                        {formulasForSlot(slot, value).map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.components?.name ?? f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Each dropdown lists FORMULAs of COMPONENTs classified into that slot under SETTINGS → TECHNIQUE CATEGORIES.
                </p>
                {/* 2026-10-12 사용자 요청: 기존 PRODUCT를 링크한 경우에만 그 PRODUCT의 현재 레시피를
                보여주고, 버튼 한 번으로 SHEET/CREAM/FILLING에 적용할 수 있게 한다 — FLAVORING NOTE를
                먼저 채워서 나중에 UPGRADE TO PRODUCT 하는 기획 단계 주문에는 이 시점에 PRODUCT가
                없으므로 영향 없다. */}
                {productId && productRecipeFormulas.length > 0 && (
                  <div className="mt-3 border border-dashed border-border p-2">
                    <p className="label-caps mb-1.5 text-[10px] text-muted-foreground">
                      Linked PRODUCT current recipe — apply with one click
                    </p>
                    <ul className="space-y-1">
                      {productRecipeFormulas.map((r) => (
                        <li
                          key={r.formulaId}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span>
                            {r.componentName}{" "}
                            <span className="text-muted-foreground">
                              — {r.formulaName} v{r.versionNumber}
                            </span>
                          </span>
                          <span className="flex gap-1">
                            <button
                              type="button"
                              className="label-caps border border-border px-1.5 py-0.5 text-[10px] hover:bg-secondary"
                              onClick={() => setFlavoringSheetFormulaId(r.formulaId)}
                            >
                              TO SHEET
                            </button>
                            <button
                              type="button"
                              className="label-caps border border-border px-1.5 py-0.5 text-[10px] hover:bg-secondary"
                              onClick={() => setFlavoringCreamFormulaId(r.formulaId)}
                            >
                              TO CREAM
                            </button>
                            <button
                              type="button"
                              className="label-caps border border-border px-1.5 py-0.5 text-[10px] hover:bg-secondary"
                              onClick={() => setFlavoringFillingFormulaId(r.formulaId)}
                            >
                              TO FILLING
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Field>
            </div>
          </SectionCard>

          {/* 2026-10-06 사용자 요청: Satisfaction — Status(진행 단계)와는 별개 개념이라 별도 섹션으로
          분리. Maker/Customer Satisfaction을 각각 독립 필드로 관리(향후 둘을 비교 분석하기 위함).
          SAVE/DELETE 버튼은 기존과 동일하게 이 페이지 전체(주문 정보 + Satisfaction)에 공통 적용. */}
          <SectionCard title="SATISFACTION">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="MAKER SATISFACTION">
                <StarRating value={makerSatisfaction} onChange={setMakerSatisfaction} />
              </Field>
              <Field label="CUSTOMER SATISFACTION">
                <div className="space-y-1">
                  <StarRating value={customerSatisfaction} onChange={setCustomerSatisfaction} />
                  <button
                    type="button"
                    className="label-caps text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setCustomerSatisfaction("")}
                  >
                    {customerSatisfaction === ""
                      ? "— NOT YET COLLECTED"
                      : "✕ RESET TO NOT YET COLLECTED"}
                  </button>
                </div>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="CUSTOMER FEEDBACK">
                <textarea
                  rows={3}
                  className={inputClass}
                  placeholder='e.g. "She absolutely loved the surprise!"'
                  value={customerFeedback}
                  onChange={(e) => setCustomerFeedback(e.target.value)}
                />
              </Field>
              <Field label="MAKER NOTES">
                <textarea
                  rows={3}
                  className={inputClass}
                  placeholder='e.g. "Result was beautiful but production took too long."'
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
                  {createWorkSession.isPending ? "CREATING…" : "+ CREATE WORK SESSION"}
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
                  {upgradeToProduct.isPending ? "UPGRADING…" : "↑ UPGRADE TO PRODUCT"}
                </button>
              )}
            </div>
            {(createWorkSession.isError || upgradeToProduct.isError) && (
              <p className="mt-2 font-mono text-xs uppercase text-destructive">
                {((createWorkSession.error ?? upgradeToProduct.error) as Error).message}
              </p>
            )}
          </SectionCard>
        </>
      )}

      <div className="border border-border bg-card p-4">
        {save.isError && (
          <p className="mb-2 font-mono text-xs uppercase text-destructive">
            {(save.error as Error).message}
          </p>
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
            <button
              type="button"
              className={buttonClass}
              onClick={() => order.data && hydrateFromOrder(order.data)}
            >
              REVERT
            </button>
          )}
          <span className="label-caps text-[10px] text-muted-foreground">
            {save.isPending
              ? "SAVING…"
              : isDirty
                ? "UNSAVED CHANGES — press SAVE"
                : "✓ SAVED"}
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
