// STEP10 — 실시간 음성 작업 로그
//
// 이 함수는 DB에 아무것도 쓰지 않는다 (MVP 결정: 파싱 결과를 미리 보여주고
// 사용자가 확인해야 저장됨 — 저장은 클라이언트가 기존 process_events
// insert/update mutation으로 직접 수행한다. 이 함수는 "음성 → 구조화된
// 이벤트 후보"만 반환한다).
//
// 타임스탬프 원칙(SPEC 5번): timestamp는 AI가 만들지 않는다. 이 함수가
// 요청 바디를 읽기 시작하는 시점 = 음성 입력이 앱에 수신된 시점을
// receivedAt으로 즉시 캡처하고, STT/AI 호출이 아무리 오래 걸려도 이
// receivedAt만 실제 이벤트 시각으로 쓴다.
//
// 필요한 Supabase Edge Function secrets:
//   OPENAI_API_KEY   — Whisper STT (whisper-1)
//   ANTHROPIC_API_KEY — 이벤트 분류 (claude-sonnet-5, tool_use로 JSON 강제)

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VOICE_ACTION_VOCABULARY = [
  "MIX_START",
  "MIX_COMPLETE",
  "REST_START",
  "REST_END",
  "OVEN_IN",
  "OVEN_CHECK",
  "OVEN_OUT",
  "COOLING_START",
  "COOLING_COMPLETE",
  "ASSEMBLY_START",
  "ASSEMBLY_COMPLETE",
  "OBSERVATION",
  "NOTE",
  "ADJUSTMENT",
  "DECISION",
];

interface RunningEvent {
  id: string;
  action: string;
  started_at: string;
  category_id: string | null;
}

interface ParsedEvent {
  event_type: "point" | "span_start" | "span_stop";
  action: string;
  category_id: string | null;
  note: string | null;
  confidence: number;
  close_event_id: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // 원칙(SPEC 5): 실제 작업 시각의 기준점. 요청을 받은 즉시 캡처한다 —
  // 이후 STT/AI 호출 지연은 이 값에 영향을 주지 않는다.
  const receivedAt = new Date().toISOString();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!openaiKey || !anthropicKey) {
      return jsonResponse({ error: "MISSING_API_KEYS" }, 500);
    }

    // 사용자의 JWT를 그대로 넘겨서 RLS("own process_events" 등)가
    // 그대로 적용되게 한다 — service role을 쓰지 않는다.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const experimentId = form.get("experiment_id");
    if (!(audio instanceof File) || typeof experimentId !== "string") {
      return jsonResponse({ error: "BAD_REQUEST" }, 400);
    }

    const [{ data: categories }, { data: running }] = await Promise.all([
      supabase
        .from("process_categories")
        .select("id, name")
        .order("sort_order", { ascending: true }),
      supabase
        .from("process_events")
        .select("id, action, started_at, category_id")
        .eq("experiment_id", experimentId)
        .eq("event_type", "span")
        .is("ended_at", null),
    ]);

    // 1) STT — Whisper
    const transcript = await transcribe(audio, openaiKey);
    if (!transcript.trim()) {
      return jsonResponse({
        transcript: "",
        received_at: receivedAt,
        parsed: lowConfidenceFallback(""),
      });
    }

    // 2) AI 이벤트 분류 — Claude, tool_use로 JSON 강제
    const parsed = await classifyEvent({
      transcript,
      categories: categories ?? [],
      running: (running ?? []) as RunningEvent[],
      anthropicKey,
    });

    return jsonResponse({
      transcript,
      received_at: receivedAt,
      parsed,
    });
  } catch (err) {
    console.error("voice-log-event error:", err);
    return jsonResponse({ error: "INTERNAL_ERROR" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function lowConfidenceFallback(note: string): ParsedEvent {
  return {
    event_type: "point",
    action: "NOTE",
    category_id: null,
    note: note || null,
    confidence: 0,
    close_event_id: null,
  };
}

async function transcribe(audio: File, openaiKey: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, audio.name || "voice.webm");
  form.append("model", "whisper-1");
  // 한국어/영어 혼용 발화가 흔하므로 language 힌트는 주지 않고 자동 감지에 맡긴다
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Whisper STT failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return (data.text ?? "").trim();
}

async function classifyEvent(args: {
  transcript: string;
  categories: { id: string; name: string }[];
  running: RunningEvent[];
  anthropicKey: string;
}): Promise<ParsedEvent> {
  const { transcript, categories, running, anthropicKey } = args;

  const tool = {
    name: "log_process_event",
    description: "베이킹/제과 작업 중 발화 한 마디를 구조화된 공정 이벤트로 분류한다.",
    input_schema: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          enum: ["point", "span_start", "span_stop"],
          description:
            "point: 순간 이벤트(관찰/메모/1회성 동작). span_start: 지속되는 작업(믹싱/오븐/휴지/냉각/조립)의 시작. span_stop: 진행 중인 작업 중 하나를 종료 — 반드시 close_event_id로 어떤 진행 중 이벤트를 종료하는지 지정.",
        },
        action: {
          type: "string",
          description: `가능하면 다음 어휘 중 하나를 사용: ${VOICE_ACTION_VOCABULARY.join(", ")}. 확신이 없으면 NOTE 또는 OBSERVATION을 사용.`,
        },
        category_id: {
          type: ["string", "null"],
          description: "제공된 카테고리 목록 중 하나의 id, 명확히 해당하지 않으면 null",
        },
        note: {
          type: ["string", "null"],
          description: "발화에서 이벤트 분류에 안 담긴 부가 정보(온도, 색상 등)",
        },
        confidence: {
          type: "number",
          description: "0~1 사이. 이 분류가 맞다고 확신하는 정도.",
        },
        close_event_id: {
          type: ["string", "null"],
          description:
            "event_type이 span_stop일 때만: 진행 중 이벤트 목록 중 종료 대상 id. 그 외에는 null.",
        },
      },
      required: ["event_type", "action", "category_id", "note", "confidence", "close_event_id"],
    },
  };

  const systemPrompt = `너는 제과/베이킹 R&D 앱 KORA Pilot의 음성 작업 로그 파서다.
사용자는 실제 작업을 하면서 짧게 한 마디씩 말한다. 시간은 절대 언급하지 않으니
timestamp는 신경 쓰지 말고, 오직 "무슨 일이 일어났는지"만 분류하라.

현재 진행 중(span, 아직 종료 안 됨)인 이벤트 목록:
${running.length === 0 ? "(없음)" : running.map((r) => `- id=${r.id} action=${r.action} started_at=${r.started_at}`).join("\n")}

사용 가능한 카테고리:
${categories.length === 0 ? "(없음)" : categories.map((c) => `- id=${c.id} name=${c.name}`).join("\n")}

규칙:
- "오븐에 넣었어", "믹싱 시작" 같은 시작 발화 → event_type=span_start
- "꺼냈어", "다 됐어" 같은 종료 발화가 진행 중 이벤트와 명확히 대응되면
  → event_type=span_stop, close_event_id에 해당 id 지정
- 종료 발화인데 어떤 진행 중 이벤트를 가리키는지 애매하면 confidence를 낮게 주고
  가장 그럴듯한 것을 close_event_id로 제시
- "다음엔 160도로 해볼까" 같은 미래 제안/가설은 실제 파라미터 변경이 아니라
  action=NOTE 또는 DECISION으로, 실행이 아닌 아이디어임을 note에 남긴다
- 확신이 없는 모든 발화는 안전하게 action=NOTE 또는 OBSERVATION, event_type=point로 분류
- log_process_event 도구를 반드시 호출해서 응답한다. 다른 텍스트는 출력하지 않는다.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: transcript }],
      tools: [tool],
      tool_choice: { type: "tool", name: "log_process_event" },
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude 분류 실패: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((block: { type: string }) => block.type === "tool_use");
  if (!toolUse) {
    return lowConfidenceFallback(transcript);
  }

  const input = toolUse.input as Partial<ParsedEvent>;
  return {
    event_type: input.event_type ?? "point",
    action: (input.action ?? "NOTE").toUpperCase(),
    category_id: input.category_id ?? null,
    note: input.note ?? null,
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    close_event_id: input.close_event_id ?? null,
  };
}
