// ORDERS — Instagram DM 텍스트에서 주문 정보 추출
//
// 사용자가 Instagram DM 전체를 복붙하면, 이 함수가 Claude(tool_use로 JSON 강제)를 써서
// 구조화된 필드를 뽑아 돌려준다. DB에는 아무것도 쓰지 않는다 — 추출 결과는 프론트에서
// 폼에 프리필만 하고, 사용자가 확인/수정 후 SAVE를 눌러야 orders 테이블에 저장된다.
//
// 규칙(사용자 명시 요구사항, 2026-10-05): 텍스트에 없는 정보는 절대 추측하지 않는다 —
// 확실하지 않으면 null. 이 함수는 추출만 하고 저장/확정은 하지 않는다.
//
// 필요한 Supabase Edge Function secret: ANTHROPIC_API_KEY (voice-log-event와 동일한 키 재사용)

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedOrderInfo {
  customer_name: string | null;
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  requester: string | null;
  recipient: string | null;
  occasion: string | null;
  event_date: string | null;
  pickup_time: string | null;
  cake_size: string | null;
  quantity: number | null;
  preferences: string | null;
  special_requests: string | null;
}

function emptyResult(): ExtractedOrderInfo {
  return {
    customer_name: null,
    instagram_handle: null,
    phone: null,
    email: null,
    requester: null,
    recipient: null,
    occasion: null,
    event_date: null,
    pickup_time: null,
    cake_size: null,
    quantity: null,
    preferences: null,
    special_requests: null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ error: "MISSING_API_KEY" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return jsonResponse({ extracted: emptyResult() });
    }

    const extracted = await extractOrderInfo(text, anthropicKey);
    return jsonResponse({ extracted });
  } catch (err) {
    console.error("extract-order-info error:", err);
    return jsonResponse({ error: "INTERNAL_ERROR" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function extractOrderInfo(text: string, anthropicKey: string): Promise<ExtractedOrderInfo> {
  const tool = {
    name: "extract_order_info",
    description: "Instagram DM 대화 텍스트에서 케익 주문 관련 정보를 구조화해서 뽑아낸다.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: ["string", "null"], description: "문의한 사람(고객)의 이름. 텍스트에 없으면 null." },
        instagram_handle: { type: ["string", "null"], description: "인스타그램 아이디/핸들. 없으면 null." },
        phone: { type: ["string", "null"], description: "전화번호. 없으면 null." },
        email: { type: ["string", "null"], description: "이메일. 없으면 null." },
        requester: { type: ["string", "null"], description: "주문을 요청하는 사람(고객 본인과 다를 수 있음, 예: 대리 주문). 명확하지 않으면 null." },
        recipient: { type: ["string", "null"], description: "케익을 받을 대상(예: 남편, 딸, 친구). 없으면 null." },
        occasion: { type: ["string", "null"], description: "기념일/행사 종류(예: 생일, 기념일). 없으면 null." },
        event_date: { type: ["string", "null"], description: "행사 날짜, ISO 형식 YYYY-MM-DD로. 연도가 안 나와 있으면 null(추측하지 말 것)." },
        pickup_time: { type: ["string", "null"], description: "픽업/배달 시각, 텍스트에 쓰인 그대로(예: '오후 4시', '4pm'). 없으면 null." },
        cake_size: { type: ["string", "null"], description: "케익 사이즈(예: '8인치'). 없으면 null." },
        quantity: { type: ["number", "null"], description: "수량. 명시 안 되면 null(1로 추측하지 말 것)." },
        preferences: { type: ["string", "null"], description: "좋아하는 것/취향(예: 가드닝, 초콜릿). 없으면 null." },
        special_requests: { type: ["string", "null"], description: "그 외 특별 요청사항. 없으면 null." },
      },
      required: [
        "customer_name",
        "instagram_handle",
        "phone",
        "email",
        "requester",
        "recipient",
        "occasion",
        "event_date",
        "pickup_time",
        "cake_size",
        "quantity",
        "preferences",
        "special_requests",
      ],
    },
  };

  const systemPrompt = `너는 케익 주문 제작 비즈니스 KORA Pilot의 Instagram DM 분석기다.
사용자가 고객과 나눈 DM 대화 전체를 붙여넣는다. 거기서 주문에 필요한 정보만 뽑아라.

가장 중요한 규칙: 텍스트에 명확하게 나와 있지 않은 정보는 절대 추측하거나 채워 넣지 마라.
확신이 없으면 반드시 null을 써라. 예를 들어 "케익 하나 주문할게요"처럼 수량이 명시 안 되면
quantity는 1이 아니라 null이다. 날짜에 연도가 없으면 임의로 올해/내년으로 추측하지 말고
event_date를 null로 둬라(단, 연월일이 모두 명확하면 그대로 ISO로 변환).

extract_order_info 도구를 반드시 호출해서 응답하라. 다른 텍스트는 출력하지 마라.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
      tools: [tool],
      tool_choice: { type: "tool", name: "extract_order_info" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude 추출 실패: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse) {
    return emptyResult();
  }

  const input = toolUse.input as Partial<ExtractedOrderInfo>;
  return { ...emptyResult(), ...input };
}
