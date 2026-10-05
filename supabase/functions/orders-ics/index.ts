// ORDERS — 구글 캘린더 "다른 캘린더 구독"용 읽기전용 .ics 피드.
//
// 구독 URL은 구글 캘린더가 주기적으로 그냥 GET만 하기 때문에 Authorization 헤더를 보낼 수
// 없다 — 그래서 JWT 대신 pilot_settings.ics_feed_token을 쿼리 파라미터로 받아 사용자를
// 특정한다(그래서 verify_jwt=false). 읽기 전용 — 구글 캘린더 쪽에서는 절대 수정 안 됨,
// 수정은 항상 Pilot에서.

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("missing token", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // RLS를 우회해야 토큰만으로(로그인 세션 없이) 그 유저의 주문을 읽을 수 있다 — service role 필요.
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from("pilot_settings")
      .select("user_id")
      .eq("ics_feed_token", token)
      .maybeSingle();

    if (!settings) {
      return new Response("invalid token", { status: 404 });
    }

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, recipient, occasion, cake_size, quantity, status, event_date, pickup_at, notes")
      .eq("user_id", settings.user_id)
      .or("pickup_at.not.is.null,event_date.not.is.null");

    const ics = buildIcs(orders ?? []);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=900",
      },
    });
  } catch (err) {
    console.error("orders-ics error:", err);
    return new Response("internal error", { status: 500 });
  }
});

interface OrderRow {
  id: string;
  order_number: string;
  recipient: string | null;
  occasion: string | null;
  cake_size: string | null;
  quantity: number | null;
  status: string;
  event_date: string | null;
  pickup_at: string | null;
  notes: string | null;
}

function buildIcs(orders: OrderRow[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KORA Pilot//Orders//KO",
    "X-WR-CALNAME:SHCS Orders",
    "CALSCALE:GREGORIAN",
  ];

  for (const o of orders) {
    const summaryParts = [o.order_number, o.recipient, o.occasion].filter(Boolean);
    const summary = summaryParts.length > 0 ? summaryParts.join(" — ") : o.order_number;
    const descParts = [
      o.cake_size ? `사이즈: ${o.cake_size}` : null,
      o.quantity != null ? `수량: ${o.quantity}` : null,
      `상태: ${o.status}`,
      o.notes ? `메모: ${o.notes}` : null,
    ].filter(Boolean);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:order-${o.id}@kora-pilot`);
    if (o.pickup_at) {
      lines.push(`DTSTART:${toIcsDateTime(o.pickup_at)}`);
      lines.push(`DTEND:${toIcsDateTime(o.pickup_at, 60)}`);
    } else if (o.event_date) {
      lines.push(`DTSTART;VALUE=DATE:${o.event_date.replaceAll("-", "")}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (descParts.length > 0) lines.push(`DESCRIPTION:${escapeIcsText(descParts.join("\\n"))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function toIcsDateTime(iso: string, addMinutes = 0): string {
  const d = new Date(new Date(iso).getTime() + addMinutes * 60000);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
