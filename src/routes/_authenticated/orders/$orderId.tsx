import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  orderQuery,
  productComponentsQuery,
  dietaryTagsQuery,
  dietaryBuildsQuery,
  formulaVersionDietaryTagLinksQuery,
  orderDietaryTagLinksQuery,
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
import { DIETARY_ASSEMBLY_ENABLED } from "@/lib/feature-flags";
import { resolveSlotGroup } from "@/lib/technique";
import { ensureWorkSessionForOrder } from "@/lib/work-session";
import { mouldOptionLabel } from "@/components/pilot/MouldSelect";
import { ProductSizeSelect } from "@/components/pilot/ProductSizeSelect";
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

/** Textarea that grows with its content (no clipped customer memos). */
function AutoGrowTextarea({
  value,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={(className ?? "") + " resize-none overflow-hidden whitespace-pre-wrap break-words"}
      {...props}
    />
  );
}


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
  const pilotSettings = useQuery(pilotSettingsQuery());
  const workSession = useQuery(workSessionByOrderQuery(orderId));
  // 2026-10-22: 모든 오더는 WORK SESSION을 기본으로 가진다 — 아직 없으면(예전 오더) 여기서 자동으로 만든다.
  useEffect(() => {
    if (!order.data || workSession.isLoading || workSession.data) return;
    void ensureWorkSessionForOrder(orderId).then(() =>
      queryClient.invalidateQueries({ queryKey: ["work_sessions"] }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.data?.id, workSession.isLoading, workSession.data]);
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
  // 2026-10-22: 웹 주문서 "제일 안 좋아하는 플레이버"(중복 선택) 답. "Fruit" = 과일 없는 백업 케익.
  const [leastLikedFlavours, setLeastLikedFlavours] = useState("");
  // 2026-10-21: DIETARY REQUIREMENTS 태그(복수 선택, SETTINGS > DIETARY TAGS). null = 아직 손대지 않음(서버 값 사용).
  const dietaryTags = useQuery(dietaryTagsQuery());
  const dietaryLinks = useQuery(orderDietaryTagLinksQuery());
  const [dietaryTagIds, setDietaryTagIds] = useState<string[] | null>(null);
  // 2026-10-21 DIETARY BUILD(3b): 저장된 식이 레시피 조합을 주문에 연결. APPLY는 FORMULA 칸에 채우기만 하고 저장은 SAVE로.
  const [dietaryBuildId, setDietaryBuildId] = useState("");
  const dietaryBuilds = useQuery(dietaryBuildsQuery());
  const fvTagLinks = useQuery(formulaVersionDietaryTagLinksQuery());
  const serverDietaryTagIds = (dietaryLinks.data ?? [])
    .filter((l) => l.order_id === orderId)
    .map((l) => l.dietary_tag_id);
  const selectedDietaryTagIds = dietaryTagIds ?? serverDietaryTagIds;
  const dietaryTagsDirty =
    dietaryTagIds !== null &&
    [...dietaryTagIds].sort().join(",") !== [...serverDietaryTagIds].sort().join(",");
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
      leastLikedFlavours: o.least_liked_flavours ?? "",
      dietaryBuildId: o.dietary_build_id ?? "",
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
    setLeastLikedFlavours(o.least_liked_flavours ?? "");
    setDietaryBuildId(o.dietary_build_id ?? "");
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
    leastLikedFlavours,
    dietaryBuildId,
    audience,
    deliveryAddress,
    makerSatisfaction,
    customerSatisfaction,
    customerFeedback,
    makerNotes,
  });
  const isDirty = Boolean(order.data) && (currentSnapshot !== savedSnapshot || dietaryTagsDirty);

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
          // 2026-10-21: 메모는 드롭다운 값과 무관하게 항상 보존
          recipient_relationship_other_note: recipientRelationshipOtherNote.trim() || null,
          occasion: occasion || null,
          // 2026-10-21: 메모는 드롭다운 값과 무관하게 항상 보존 (Other 아니어도 지우지 않음)
          occasion_other_note: occasionOtherNote.trim() || null,
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
          least_liked_flavours: leastLikedFlavours.trim() || null,
          dietary_build_id: dietaryBuildId || null,
          audience: audience || null,
          delivery_address: deliveryAddress.trim() || null,
          maker_satisfaction: makerSatisfaction === "" ? null : makerSatisfaction,
          customer_satisfaction: customerSatisfaction === "" ? null : customerSatisfaction,
          customer_feedback: customerFeedback.trim() || null,
          maker_notes: makerNotes.trim() || null,
        })
        .eq("id", orderId);
      if (error) throw error;

      // DIETARY 태그 연결: 서버 값과 비교해 빠진 것만 지우고 새로 고른 것만 추가한다.
      if (dietaryTagIds !== null) {
        const toRemove = serverDietaryTagIds.filter((id) => !dietaryTagIds.includes(id));
        const toAdd = dietaryTagIds.filter((id) => !serverDietaryTagIds.includes(id));
        if (toRemove.length > 0) {
          const { error: delError } = await supabase
            .from("order_dietary_tags")
            .delete()
            .eq("order_id", orderId)
            .in("dietary_tag_id", toRemove);
          if (delError) throw delError;
        }
        if (toAdd.length > 0) {
          const { error: addError } = await supabase
            .from("order_dietary_tags")
            .insert(toAdd.map((dietary_tag_id) => ({ order_id: orderId, dietary_tag_id })));
          if (addError) throw addError;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["order_dietary_tags"] });
      setDietaryTagIds(null);
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
              <AutoGrowTextarea
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
                {(recipientRelationship === "Other" ||
                  recipientRelationshipOtherNote.trim() !== "") && (
                  <AutoGrowTextarea
                    className={inputClass + " mt-1"}
                    placeholder={
                      recipientRelationship === "Other" ? "Enter manually" : "Customer memo"
                    }
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
                    {(occasion === "Other" || occasionOtherNote.trim() !== "") && (
                      <AutoGrowTextarea
                        className={inputClass + " mt-1"}
                        placeholder={occasion === "Other" ? "Enter manually" : "Customer memo"}
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
                <AutoGrowTextarea
                  className={inputClass}
                  placeholder="Leave empty for pickup"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="DIETARY REQUIREMENTS">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(dietaryTags.data ?? []).map((t) => {
                      const on = selectedDietaryTagIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-pressed={on}
                          className={
                            "label-caps border px-2 py-1 text-[11px] " +
                            (on
                              ? "border-foreground bg-foreground text-background"
                              : "border-input bg-background text-foreground hover:border-foreground")
                          }
                          onClick={() =>
                            setDietaryTagIds(
                              on
                                ? selectedDietaryTagIds.filter((id) => id !== t.id)
                                : [...selectedDietaryTagIds, t.id],
                            )
                          }
                        >
                          {t.name}
                        </button>
                      );
                    })}
                    {(dietaryTags.data ?? []).length === 0 && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Add tags in SETTINGS &gt; DIETARY TAGS
                      </span>
                    )}
                  </div>
                  {/* 2026-10-21 사용자 요청: "Other" 토글 버튼 삭제 — 고객 메모 입력칸은 토글 없이
                      항상 노출(토글이 없으면 내용을 다 지운 순간 입력칸이 사라지는 문제가 생김). */}
                  <AutoGrowTextarea
                    rows={2}
                    className={inputClass + " mt-1.5"}
                    placeholder="Customer memo"
                    value={dietaryRequirements}
                    onChange={(e) => setDietaryRequirements(e.target.value)}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="LEAST LIKED FLAVOURS">
                  <input
                    className={inputClass}
                    placeholder="From the web order form"
                    value={leastLikedFlavours}
                    onChange={(e) => setLeastLikedFlavours(e.target.value)}
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
                  <AutoGrowTextarea
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
                  On CONFIRMED, a project is created/synced to this product line in the WANN Weekly
                  OS calendar.
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
              {productId && (
                <Field label="PRODUCT SIZE (legacy)">
                  <ProductSizeSelect
                    productId={productId}
                    value={productSizeId}
                    onChange={setProductSizeId}
                  />
                </Field>
              )}
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
                        {picked.servings != null
                          ? `${picked.servings} servings`
                          : "servings not set"}{" "}
                        · {mould ? `sheet: ${mouldOptionLabel(mould)}` : "no sheet mould set"} ·{" "}
                        {picked.cream_g != null ? `cream ${picked.cream_g}g` : "cream not set"} (edit
                        in SETTINGS → CAKE SIZES)
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
                {(() => {
                  const productBuilds = (dietaryBuilds.data ?? []).filter(
                    (b) => !productId || b.product_id === productId,
                  );
                  const selectedBuild = (dietaryBuilds.data ?? []).find(
                    (b) => b.id === dietaryBuildId,
                  );
                  if (!DIETARY_ASSEMBLY_ENABLED) return null;
                  if (productBuilds.length === 0 && !selectedBuild) return null;
                  const buildTagIds = selectedBuild
                    ? selectedBuild.dietary_build_tags.map((t) => t.dietary_tag_id)
                    : [];
                  const uncovered = selectedDietaryTagIds.filter((id) => !buildTagIds.includes(id));
                  const stale = selectedBuild
                    ? selectedBuild.dietary_build_items.filter((it) => {
                        const have = new Set(
                          (fvTagLinks.data ?? [])
                            .filter((l) => l.formula_version_id === it.formula_version_id)
                            .map((l) => l.dietary_tag_id),
                        );
                        return !buildTagIds.every((id) => have.has(id));
                      })
                    : [];
                  const tagNameOf = (id: string) =>
                    (dietaryTags.data ?? []).find((t) => t.id === id)?.name ?? "—";
                  const applyBuild = () => {
                    if (!selectedBuild) return;
                    const unmapped: string[] = [];
                    for (const it of selectedBuild.dietary_build_items) {
                      const formula = (formulas.data ?? []).find((f) =>
                        f.formula_versions.some((v) => v.id === it.formula_version_id),
                      );
                      if (!formula) continue;
                      const slot = resolveSlotGroup(
                        techniqueCategories.data ?? [],
                        formula.components?.technique_category_id ?? null,
                      );
                      if (slot === "SHEET") setFlavoringSheetFormulaId(formula.id);
                      else if (slot === "CREAM") setFlavoringCreamFormulaId(formula.id);
                      else if (slot === "FILLING") setFlavoringFillingFormulaId(formula.id);
                      else unmapped.push(formula.components?.name ?? formula.name);
                    }
                    if (unmapped.length > 0)
                      window.alert(
                        `Not applied (no SHEET/CREAM/FILLING slot): ${unmapped.join(", ")}`,
                      );
                  };
                  return (
                    <div className="mt-3 border border-dashed border-border p-2">
                      <p className="label-caps mb-1.5 text-[10px] text-muted-foreground">
                        Dietary build — fixes the formula versions used for this order
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className={selectClass + " !w-72"}
                          value={dietaryBuildId}
                          onChange={(e) => setDietaryBuildId(e.target.value)}
                        >
                          <option value="">— NO BUILD —</option>
                          {productBuilds.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                          {selectedBuild && !productBuilds.some((b) => b.id === selectedBuild.id) && (
                            <option value={selectedBuild.id}>{selectedBuild.name}</option>
                          )}
                        </select>
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={!selectedBuild}
                          onClick={applyBuild}
                        >
                          APPLY TO FORMULAS
                        </button>
                      </div>
                      {selectedBuild && (
                        <ul className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                          {selectedBuild.dietary_build_items.map((it) => {
                            const f = (formulas.data ?? []).find((x) =>
                              x.formula_versions.some((v) => v.id === it.formula_version_id),
                            );
                            const v = f?.formula_versions.find((x) => x.id === it.formula_version_id);
                            return (
                              <li key={it.id}>
                                {f?.components?.name ?? "—"} → {f?.name ?? "—"} v{v?.version_number ?? "?"}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {uncovered.length > 0 && selectedBuild && (
                        <p className="mt-1 font-mono text-[11px] text-destructive">
                          This build does not cover: {uncovered.map(tagNameOf).join(", ")}
                        </p>
                      )}
                      {stale.length > 0 && (
                        <p className="mt-1 font-mono text-[11px] text-destructive">
                          STALE: a formula version in this build no longer carries the build&apos;s
                          tags — re-check on the DIETARY tab.
                        </p>
                      )}
                    </div>
                  );
                })()}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Each dropdown lists FORMULAs of COMPONENTs classified into that slot under
                  SETTINGS → TECHNIQUE CATEGORIES.
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
                <AutoGrowTextarea
                  rows={3}
                  className={inputClass}
                  placeholder='e.g. "She absolutely loved the surprise!"'
                  value={customerFeedback}
                  onChange={(e) => setCustomerFeedback(e.target.value)}
                />
              </Field>
              <Field label="MAKER NOTES">
                <AutoGrowTextarea
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
              {/* 2026-10-22: WORK SESSION은 오더마다 기본으로 있다(만들기 버튼 없음). 컴포넌트 지정/시간 배정은
                  PRODUCTION > ORDERS 탭·DASHBOARD에서 하고, 세션 페이지는 그 내용을 보여준다. */}
              <Link to="/production" className={buttonClass}>
                OPEN IN PRODUCTION
              </Link>
              {workSession.data ? (
                <Link
                  to="/production/$sessionId"
                  params={{ sessionId: workSession.data.id }}
                  className={buttonClass}
                >
                  WORK SESSION 보기{workSession.data.name ? ` — ${workSession.data.name}` : ""}
                </Link>
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">
                  WORK SESSION 준비 중…
                </span>
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
            {upgradeToProduct.isError && (
              <p className="mt-2 font-mono text-xs uppercase text-destructive">
                {(upgradeToProduct.error as Error).message}
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
            {save.isPending ? "SAVING…" : isDirty ? "UNSAVED CHANGES — press SAVE" : "✓ SAVED"}
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
