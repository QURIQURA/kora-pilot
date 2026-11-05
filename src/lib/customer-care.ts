// 2026-11-06 사용자 요청: "보내야하는 텍스트 고객에 맞게 커스텀된 내용으로 자동생성 되게 해줘. 그리고 custom care
// 카테고리와 내용 통일해서 관리하는 설정도 만들어주고" — CUSTOMER CARE 단계(카테고리)와 문자/이메일 문구를
// pilot_settings.customer_care_steps(jsonb)에 저장한다. 비어 있으면 아래 DEFAULT_CARE_STEPS를 쓴다.
// 주문 화면은 {first_name} 같은 자리표시자를 그 주문 정보로 채워 보여준다.
import type { Json } from "@/integrations/supabase/types";

export type CareAutoEmail = "" | "customer_submitted" | "customer_accepted";

export interface CareStep {
  key: string;
  label: string;
  hint: string;
  /** Web orders: this step's email is already sent automatically (shco_email_log kind). */
  auto_email: CareAutoEmail;
  text: string;
  email_subject: string;
  email_body: string;
}

export const CARE_AUTO_EMAIL_OPTIONS: { value: CareAutoEmail; label: string }[] = [
  { value: "", label: "None (send by hand)" },
  { value: "customer_submitted", label: "Web order: request received email" },
  { value: "customer_accepted", label: "Web order: accepted email" },
];

export const CARE_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "first_name", label: "Customer first name" },
  { key: "customer_name", label: "Customer full name" },
  { key: "recipient", label: "Recipient" },
  { key: "delivery_day", label: "Delivery day, e.g. Tue 24 Nov" },
  { key: "delivery_time", label: "Delivery time, e.g. 6:00 pm" },
  { key: "address", label: "Delivery address" },
  { key: "price", label: "Price, e.g. $160" },
  { key: "order_number", label: "Order number, e.g. SH-014.1" },
  { key: "request_number", label: "Web request number, e.g. REQ-0002" },
  { key: "shop", label: "Secret Husband Cake Shop" },
];

export const DEFAULT_CARE_STEPS: CareStep[] = [
  {
    key: "received",
    label: "Request received",
    hint: "Thanks for the request",
    auto_email: "customer_submitted",
    text: "Hi {first_name}, it's {shop}. We've received your request {request_number} and will be in touch shortly.",
    email_subject: "We've received your request {request_number}",
    email_body:
      "Hi {first_name},\n\nThank you for your request {request_number}. We'll review it and get back to you shortly.\n\n{shop}",
  },
  {
    key: "confirmed",
    label: "Order confirmed",
    hint: "Accepted, delivery time + address",
    auto_email: "customer_accepted",
    text: "Hi {first_name}, it's {shop}. Your cake for {recipient} is confirmed for {delivery_day}, around {delivery_time}. Any questions, just reply here.",
    email_subject: "Your order {order_number} is confirmed",
    email_body:
      "Hi {first_name},\n\nYour mission is accepted.\n\nFor: {recipient}\nDelivery: {delivery_day}, around {delivery_time}\nAddress: {address}\n\nPayment will be arranged before the day.\n\n{shop}",
  },
  {
    key: "invoice",
    label: "Payment & invoice",
    hint: "After payment, send the invoice",
    auto_email: "",
    text: "Hi {first_name}, thank you for your payment of {price}. Your invoice for {order_number} is on its way by email.",
    email_subject: "Invoice {order_number}",
    email_body:
      "Hi {first_name},\n\nThank you for your payment.\n\nInvoice {order_number}\nCake for {recipient}, {delivery_day}\nTotal paid: {price} AUD\n\n{shop}",
  },
  {
    key: "day_before",
    label: "Day-before check",
    hint: "Confirm time, address, someone home",
    auto_email: "",
    text: "Hi {first_name}, a quick check before tomorrow. We'll deliver to {address} around {delivery_time}. Will someone be home to receive it? Reply YES or let us know any change.",
    email_subject: "Delivery tomorrow, {delivery_day}",
    email_body:
      "Hi {first_name},\n\nA quick check before tomorrow. We'll deliver to {address} around {delivery_time}.\n\nWill someone be home to receive it? Just reply to let us know, or tell us about any change.\n\n{shop}",
  },
  {
    key: "thank_you",
    label: "Thank you & feedback",
    hint: "After delivery, ask for a photo or a few words",
    auto_email: "",
    text: "Hi {first_name}, we hope {recipient} loved it. If you'd like to share a photo or a few words, we'd love to hear. {shop}",
    email_subject: "Thank you from {shop}",
    email_body:
      "Hi {first_name},\n\nWe hope {recipient}'s cake made the day special.\n\nIf you'd like to share a photo or a few words, simply reply to this email. We'd love to hear.\n\n{shop}",
  },
];

/** Settings value → steps. Falls back to the defaults when unset or empty. */
export function careStepsFromSettings(value: Json | null | undefined): CareStep[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_CARE_STEPS;
  const str = (o: { [k: string]: Json | undefined }, k: string) => {
    const v = o[k];
    return typeof v === "string" ? v : "";
  };
  return value
    .filter(
      (v): v is { [k: string]: Json | undefined } =>
        !!v && typeof v === "object" && !Array.isArray(v),
    )
    .map((v, i) => {
      const auto = str(v, "auto_email");
      return {
        key: str(v, "key") || `step_${i + 1}`,
        label: str(v, "label"),
        hint: str(v, "hint"),
        auto_email: (auto === "customer_submitted" || auto === "customer_accepted"
          ? auto
          : "") as CareAutoEmail,
        text: str(v, "text"),
        email_subject: str(v, "email_subject"),
        email_body: str(v, "email_body"),
      };
    });
}

export interface CareOrderInfo {
  customerName?: string | null | undefined;
  recipient?: string | null | undefined;
  /** ISO timestamp */
  pickupAt?: string | null | undefined;
  address?: string | null | undefined;
  price?: string | number | null | undefined;
  orderNumber?: string | null | undefined;
  requestNumber?: string | null | undefined;
}

const TZ = "Australia/Sydney";

export function careValues(info: CareOrderInfo): Record<string, string> {
  const name = (info.customerName ?? "").trim();
  const d = info.pickupAt ? new Date(info.pickupAt) : null;
  const valid = d && !Number.isNaN(d.getTime());
  const priceNum = info.price === "" || info.price == null ? NaN : Number(info.price);
  return {
    first_name: name.split(/\s+/)[0] ?? "",
    customer_name: name,
    recipient: (info.recipient ?? "").trim(),
    delivery_day: valid
      ? d.toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: TZ,
        })
      : "",
    delivery_time: valid
      ? d
          .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ })
          .toLowerCase()
      : "",
    address: (info.address ?? "").trim().replace(/\s*\n\s*/g, ", "),
    price: Number.isFinite(priceNum)
      ? "$" + (priceNum % 1 === 0 ? priceNum.toFixed(0) : priceNum.toFixed(2))
      : "",
    order_number: (info.orderNumber ?? "").trim(),
    request_number: (info.requestNumber ?? "").trim(),
    shop: "Secret Husband Cake Shop",
  };
}

/** Replace {placeholders}. Unknown or empty values stay visible as [name] so they get noticed. */
export function fillCareTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = values[k];
    return v ? v : `[${k}]`;
  });
}

export function newCareStepKey(existing: CareStep[]): string {
  let n = existing.length + 1;
  while (existing.some((s) => s.key === `step_${n}`)) n++;
  return `step_${n}`;
}
