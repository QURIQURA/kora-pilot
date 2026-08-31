import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { currentUserId, processEventsQuery, type ProcessEventRow } from "@/lib/queries";
import {
  eventDurationSeconds,
  isRunningSpan,
  VOICE_ACTION_VOCABULARY,
  VOICE_LOW_CONFIDENCE_THRESHOLD,
  type ProcessEventType,
} from "@/lib/process";
import {
  formatDuration,
  formatTimeWithSeconds,
  localDateTimeToISO,
  nowLocalTimestamp,
  toLocalDateString,
} from "@/lib/datetime";
import { ProcessCategorySelect } from "./ProcessCategorySelect";
import { ProcessEventParametersEditor } from "./ProcessEventParametersEditor";
import { Field, SectionCard, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

/**
 * EXPERIMENT DETAIL — PROCESS TIMELINE 섹션.
 * QUICK LOG(START/STOP/LOG) + 시간순 타임라인 + 수동 편집/과거 이벤트 추가.
 * 모든 시각 저장은 timestamptz(초 단위), 표시는 datetime.ts 유틸만 사용.
 */
export function ProcessTimelineSection({
  experimentId,
  experimentDate,
  status,
}: {
  experimentId: string;
  experimentDate: string;
  status: string;
}) {
  const queryClient = useQueryClient();
  const events = useQuery(processEventsQuery(experimentId));
  const rows = useMemo(() => events.data ?? [], [events.data]);
  const anyRunning = rows.some(isRunningSpan);

  // 진행 중 span의 경과 시간 표시용 1초 tick (DB 폴링 아님)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [anyRunning]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["process_events", experimentId],
    });
    await queryClient.invalidateQueries({ queryKey: ["recent_process_events"] });
    await queryClient.invalidateQueries({
      queryKey: ["process_category_usage"],
    });
  };

  const insertEvent = useMutation({
    mutationFn: async (row: {
      action: string;
      category_id: string | null;
      event_type: ProcessEventType;
      started_at: string;
      ended_at?: string | null;
      note?: string | null;
      source?: "manual" | "voice";
      transcript?: string | null;
      confidence?: number | null;
    }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("process_events")
        .insert({ user_id, experiment_id: experimentId, ...row });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"process_events"> }) => {
      const { error } = await supabase.from("process_events").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("process_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const [addingPast, setAddingPast] = useState(false);
  const isExperimentRunning = status === "RUNNING";
  const runningRows = rows.filter(isRunningSpan);

  return (
    <SectionCard
      title="PROCESS TIMELINE"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setAddingPast((v) => !v)}
        >
          {addingPast ? "CLOSE" : "+ ADD PAST EVENT"}
        </button>
      }
    >
      <div className="space-y-4">
        {addingPast && (
          <AddPastEventForm
            defaultDate={experimentDate}
            pending={insertEvent.isPending}
            onAdd={(row) => {
              insertEvent.mutate(row);
              setAddingPast(false);
            }}
            onCancel={() => setAddingPast(false)}
          />
        )}

        {isExperimentRunning && (
          <VoiceLogBar
            experimentId={experimentId}
            runningRows={rows.filter(isRunningSpan)}
            onConfirmNew={(row) =>
              insertEvent.mutate({
                action: row.action,
                category_id: row.category_id,
                event_type: "point",
                started_at: row.startedAt,
                note: row.note,
                source: "voice",
                transcript: row.transcript,
                confidence: row.confidence,
              })
            }
            onConfirmSpanStart={(row) =>
              insertEvent.mutate({
                action: row.action,
                category_id: row.category_id,
                event_type: "span",
                started_at: row.startedAt,
                note: row.note,
                source: "voice",
                transcript: row.transcript,
                confidence: row.confidence,
              })
            }
            onConfirmSpanStop={(row) =>
              updateEvent.mutate({
                id: row.closeEventId,
                patch: { ended_at: row.startedAt },
              })
            }
          />
        )}

        {isExperimentRunning && (
          <QuickLogBar
            pending={insertEvent.isPending}
            onStart={(action, categoryId) =>
              insertEvent.mutate({
                action,
                category_id: categoryId || null,
                event_type: "span",
                started_at: nowLocalTimestamp(),
              })
            }
            onLog={(action, categoryId) =>
              insertEvent.mutate({
                action,
                category_id: categoryId || null,
                event_type: "point",
                started_at: nowLocalTimestamp(),
              })
            }
          />
        )}

        {runningRows.length > 0 && (
          <ul className="divide-y divide-border border border-dashed border-foreground">
            {runningRows.map((event) => (
              <RunningRow
                key={event.id}
                event={event}
                now={now}
                pending={updateEvent.isPending}
                onStop={() =>
                  updateEvent.mutate({
                    id: event.id,
                    patch: { ended_at: nowLocalTimestamp() },
                  })
                }
              />
            ))}
          </ul>
        )}

        {rows.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NO PROCESS EVENTS YET
            {!isExperimentRunning && " — 실험을 RUNNING으로 바꾸면 QUICK LOG를 사용할 수 있습니다"}
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {rows.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                now={now}
                onUpdate={(patch) => updateEvent.mutate({ id: event.id, patch })}
                onRemove={() => {
                  if (confirm(`DELETE "${event.action}"?`)) removeEvent.mutate(event.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 모바일 하단 고정 QUICK LOG 바에 가려지는 영역 확보 */}
      {isExperimentRunning && <div className="h-32 sm:hidden" />}
    </SectionCard>
  );
}

/** RUNNING 실험용 빠른 기록 바 — 모바일에서는 화면 하단 고정 + 2줄 배치 */
function QuickLogBar({
  pending,
  onStart,
  onLog,
}: {
  pending: boolean;
  onStart: (action: string, categoryId: string) => void;
  onLog: (action: string, categoryId: string) => void;
}) {
  const [action, setAction] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showEmptyHint, setShowEmptyHint] = useState(false);
  const actionRef = useRef<HTMLInputElement>(null);

  const submit = (kind: ProcessEventType) => {
    const value = action.trim();
    if (!value) {
      // 침묵하지 않고 이유를 알린다
      setShowEmptyHint(true);
      actionRef.current?.focus();
      return;
    }
    if (kind === "span") onStart(value, categoryId);
    else onLog(value, categoryId);
    setAction("");
    setShowEmptyHint(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:p-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          ref={actionRef}
          className={`${inputClass} min-h-[48px] w-full min-w-0 text-base sm:flex-1`}
          placeholder="ACTION (MERINGUE…)"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            if (e.target.value.trim()) setShowEmptyHint(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit("point");
            }
          }}
        />
        <div className="flex items-stretch gap-2">
          <ProcessCategorySelect
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel="—"
            className={`${selectClass} min-h-[48px] min-w-0 flex-1 sm:w-36 sm:flex-none`}
          />
          <button
            type="button"
            className={`${primaryButtonClass} min-h-[48px] shrink-0 px-3 sm:px-4`}
            disabled={pending}
            onClick={() => submit("span")}
          >
            START
          </button>
          <button
            type="button"
            className={`${buttonClass} min-h-[48px] shrink-0 px-3 sm:px-4`}
            disabled={pending}
            onClick={() => submit("point")}
          >
            LOG
          </button>
        </div>
      </div>
      {showEmptyHint && (
        <p className="label-caps mt-1 text-[11px] text-foreground">ACTION을 입력하세요</p>
      )}
    </div>
  );
}

interface VoiceParsedEvent {
  event_type: "point" | "span_start" | "span_stop";
  action: string;
  category_id: string | null;
  note: string | null;
  confidence: number;
  close_event_id: string | null;
}

interface VoiceLogResponse {
  transcript: string;
  received_at: string;
  parsed: VoiceParsedEvent;
  error?: string;
}

/**
 * STEP10 — 음성 작업 로그. 녹음 → voice-log-event Edge Function(STT + AI 분류)
 * → 파싱 결과 미리보기(수정 가능) → 확인 시에만 저장.
 * timestamp는 Edge Function이 오디오 수신 즉시 캡처한 received_at을 그대로 쓴다
 * (AI 처리 지연이 실제 작업 시각을 왜곡하지 않도록 — SPEC 5번 원칙).
 */
function VoiceLogBar({
  experimentId,
  runningRows,
  onConfirmNew,
  onConfirmSpanStart,
  onConfirmSpanStop,
}: {
  experimentId: string;
  runningRows: ProcessEventRow[];
  onConfirmNew: (row: {
    action: string;
    category_id: string | null;
    note: string | null;
    startedAt: string;
    transcript: string;
    confidence: number;
  }) => void;
  onConfirmSpanStart: (row: {
    action: string;
    category_id: string | null;
    note: string | null;
    startedAt: string;
    transcript: string;
    confidence: number;
  }) => void;
  onConfirmSpanStop: (row: { closeEventId: string; startedAt: string }) => void;
}) {
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "preview" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<VoiceLogResponse | null>(null);
  const [draft, setDraft] = useState<VoiceParsedEvent | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setErrorMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void submitRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      setErrorMessage("마이크 권한이 필요합니다");
      setStatus("error");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const submitRecording = async () => {
    setStatus("processing");
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      form.append("experiment_id", experimentId);
      const { data, error } = await supabase.functions.invoke<VoiceLogResponse>("voice-log-event", {
        body: form,
      });
      if (error || !data || data.error) {
        throw new Error(data?.error ?? error?.message ?? "UNKNOWN");
      }
      setResult(data);
      setDraft(data.parsed);
      setStatus("preview");
    } catch {
      setErrorMessage("음성 처리에 실패했습니다. 다시 시도해주세요.");
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setDraft(null);
    setErrorMessage("");
  };

  const confirm = () => {
    if (!result || !draft) return;
    if (draft.event_type === "span_stop") {
      if (!draft.close_event_id) return;
      onConfirmSpanStop({
        closeEventId: draft.close_event_id,
        startedAt: result.received_at,
      });
    } else {
      const row = {
        action: draft.action,
        category_id: draft.category_id,
        note: draft.note,
        startedAt: result.received_at,
        transcript: result.transcript,
        confidence: draft.confidence,
      };
      if (draft.event_type === "span_start") onConfirmSpanStart(row);
      else onConfirmNew(row);
    }
    reset();
  };

  const lowConfidence = draft != null && draft.confidence < VOICE_LOW_CONFIDENCE_THRESHOLD;

  return (
    <div className="border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps text-xs text-muted-foreground">VOICE LOG</span>
        {status === "idle" && (
          <button type="button" className={`${primaryButtonClass} px-4`} onClick={startRecording}>
            ● REC
          </button>
        )}
        {status === "recording" && (
          <button
            type="button"
            className={`${primaryButtonClass} animate-pulse px-4`}
            onClick={stopRecording}
          >
            ■ STOP
          </button>
        )}
        {status === "processing" && (
          <span className="label-caps text-xs text-muted-foreground">듣는 중…</span>
        )}
      </div>

      {status === "error" && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
          <button type="button" className={`${buttonClass} px-3 py-1 text-xs`} onClick={reset}>
            닫기
          </button>
        </div>
      )}

      {status === "preview" && result && draft && (
        <div className="mt-3 space-y-3 border-t border-dashed border-border pt-3">
          <p className="text-xs italic text-muted-foreground">“{result.transcript}”</p>
          {lowConfidence && (
            <p className="label-caps text-[11px] text-foreground">
              확신도 낮음 — 아래 내용을 확인하고 저장하세요
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="TYPE">
              <select
                className={selectClass}
                value={draft.event_type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    event_type: e.target.value as VoiceParsedEvent["event_type"],
                  })
                }
              >
                <option value="point">POINT (순간)</option>
                <option value="span_start">SPAN START (시작)</option>
                <option value="span_stop">SPAN STOP (종료)</option>
              </select>
            </Field>
            {draft.event_type === "span_stop" ? (
              <Field label="CLOSE EVENT">
                <select
                  className={selectClass}
                  value={draft.close_event_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, close_event_id: e.target.value || null })}
                >
                  <option value="">— 선택 —</option>
                  {runningRows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.action}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="ACTION">
                <input
                  className={inputClass}
                  list="voice-action-vocab"
                  value={draft.action}
                  onChange={(e) => setDraft({ ...draft, action: e.target.value.toUpperCase() })}
                />
                <datalist id="voice-action-vocab">
                  {VOICE_ACTION_VOCABULARY.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </Field>
            )}
          </div>
          {draft.event_type !== "span_stop" && (
            <Field label="NOTE">
              <input
                className={inputClass}
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value || null })}
              />
            </Field>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={`${primaryButtonClass} px-4`}
              disabled={draft.event_type === "span_stop" && !draft.close_event_id}
              onClick={confirm}
            >
              CONFIRM & SAVE
            </button>
            <button type="button" className={buttonClass} onClick={reset}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 진행 중 span — 경과 시간 실시간 표시 + STOP */
function RunningRow({
  event,
  now,
  pending,
  onStop,
}: {
  event: ProcessEventRow;
  now: Date;
  pending: boolean;
  onStop: () => void;
}) {
  const elapsed = eventDurationSeconds(event, now) ?? 0;
  return (
    <li
      className="flex flex-wrap items-center gap-2 border-l-2 border-dashed border-foreground px-3 py-2"
      style={
        event.process_categories?.color
          ? { backgroundColor: `${event.process_categories.color}80` }
          : undefined
      }
    >
      <span className="font-mono text-xs text-muted-foreground">
        {formatTimeWithSeconds(event.started_at)}
      </span>
      <span className="label-caps bg-foreground px-2 py-0.5 text-[11px] text-background">
        RUNNING
      </span>
      <span className="min-w-[8rem] flex-1 text-sm uppercase">{event.action}</span>
      <span className="font-mono text-sm tabular-nums">{formatDuration(elapsed)}</span>
      <button
        type="button"
        className={`${primaryButtonClass} min-h-[48px] px-4`}
        disabled={pending}
        onClick={onStop}
      >
        STOP
      </button>
    </li>
  );
}

/** 타임라인 행 — TIME / ACTION / DURATION / CATEGORY + 인라인 편집 */
function EventRow({
  event,
  now,
  onUpdate,
  onRemove,
}: {
  event: ProcessEventRow;
  now: Date;
  onUpdate: (patch: TablesUpdate<"process_events">) => void;
  onRemove: () => void;
}) {
  const running = isRunningSpan(event);
  const duration = eventDurationSeconds(event, now);
  // 시각 편집 시 이벤트 자체의 로컬 날짜를 유지한다 (실험 날짜와 다를 수 있음)
  const eventDate = toLocalDateString(new Date(event.started_at));
  const endDate = event.ended_at ? toLocalDateString(new Date(event.ended_at)) : eventDate;
  const [showParams, setShowParams] = useState(false);

  return (
    <li
      className={`flex flex-col gap-2 px-3 py-2 ${
        running ? "border-l-2 border-dashed border-foreground" : ""
      }`}
      style={
        event.process_categories?.color
          ? { backgroundColor: `${event.process_categories.color}80` }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          step={1}
          aria-label="START TIME"
          className="min-h-[44px] w-[7.5rem] border border-transparent bg-transparent px-1 font-mono text-xs outline-none hover:border-border focus:border-foreground"
          defaultValue={formatTimeWithSeconds(event.started_at)}
          key={`start-${event.id}-${event.started_at}`}
          onBlur={(e) => {
            const value = e.target.value;
            if (!value) return;
            const iso = localDateTimeToISO(eventDate, value);
            if (iso !== event.started_at) onUpdate({ started_at: iso });
          }}
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          {event.event_type === "span" ? "SPAN" : "LOG"}
        </span>
        <input
          className="min-h-[44px] min-w-[8rem] flex-1 border border-transparent bg-transparent px-2 text-sm uppercase outline-none hover:border-border focus:border-foreground"
          defaultValue={event.action}
          key={`action-${event.id}-${event.action}`}
          onBlur={(e) => {
            const action = e.target.value.trim();
            if (action && action !== event.action) onUpdate({ action });
          }}
        />
        <span className="w-24 font-mono text-xs tabular-nums text-muted-foreground">
          {duration === null
            ? "—"
            : running
              ? `${formatDuration(duration)}…`
              : formatDuration(duration)}
        </span>
        {event.event_type === "span" &&
          (running ? (
            <span className="label-caps px-1 text-[11px] text-muted-foreground">IN PROGRESS</span>
          ) : (
            <input
              type="time"
              step={1}
              aria-label="END TIME"
              className="min-h-[44px] w-[7.5rem] border border-transparent bg-transparent px-1 font-mono text-xs outline-none hover:border-border focus:border-foreground"
              defaultValue={event.ended_at ? formatTimeWithSeconds(event.ended_at) : ""}
              key={`end-${event.id}-${event.ended_at}`}
              onBlur={(e) => {
                const value = e.target.value;
                if (!value) return;
                const iso = localDateTimeToISO(endDate, value);
                if (iso !== event.ended_at) onUpdate({ ended_at: iso });
              }}
            />
          ))}
        <ProcessCategorySelect
          value={event.category_id ?? ""}
          onChange={(id) => onUpdate({ category_id: id || null })}
          emptyLabel="—"
          className="min-h-[44px] w-28 border border-transparent bg-transparent px-1 font-mono text-xs uppercase outline-none hover:border-border focus:border-foreground"
        />
        <input
          className="min-h-[44px] w-36 border border-transparent bg-transparent px-2 text-xs text-muted-foreground outline-none hover:border-border focus:border-foreground"
          defaultValue={event.note ?? ""}
          placeholder="NOTE…"
          key={`note-${event.id}-${event.note}`}
          onBlur={(e) => {
            const note = e.target.value.trim() || null;
            if (note !== (event.note ?? null)) onUpdate({ note });
          }}
        />
        <button
          type="button"
          className="label-caps min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowParams((v) => !v)}
        >
          {showParams ? "PARAMS ▲" : "PARAMS ▼"}
        </button>
        <button
          type="button"
          className="label-caps min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onRemove}
        >
          REMOVE
        </button>
      </div>
      {showParams && (
        <div className="border-t border-dashed border-border pt-2">
          <ProcessEventParametersEditor processEventId={event.id} categoryId={event.category_id} />
        </div>
      )}
    </li>
  );
}

/** 과거 이벤트 수동 추가 — 기록 못한 작업 보완용 */
function AddPastEventForm({
  defaultDate,
  pending,
  onAdd,
  onCancel,
}: {
  defaultDate: string;
  pending: boolean;
  onAdd: (row: {
    action: string;
    category_id: string | null;
    event_type: ProcessEventType;
    started_at: string;
    ended_at: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [eventType, setEventType] = useState<ProcessEventType>("point");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const submit = () => {
    const value = action.trim();
    if (!value || !date || !start) return;
    onAdd({
      action: value,
      category_id: categoryId || null,
      event_type: eventType,
      started_at: localDateTimeToISO(date, start),
      ended_at: eventType === "span" && end ? localDateTimeToISO(date, end) : null,
    });
  };

  return (
    <form
      className="space-y-3 border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="ACTION">
          <input
            className={inputClass}
            autoFocus
            required
            placeholder="BAKE"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </Field>
        <Field label="CATEGORY">
          <ProcessCategorySelect
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel="NO CATEGORY"
          />
        </Field>
        <Field label="TYPE">
          <select
            className={selectClass}
            value={eventType}
            onChange={(e) => setEventType(e.target.value as ProcessEventType)}
          >
            <option value="point">POINT (순간 기록)</option>
            <option value="span">SPAN (시작–종료)</option>
          </select>
        </Field>
        <Field label="DATE">
          <input
            type="date"
            className={inputClass}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="START (HH:MM:SS)">
          <input
            type="time"
            step={1}
            className={inputClass}
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        {eventType === "span" && (
          <Field label="END (OPTIONAL)">
            <input
              type="time"
              step={1}
              className={inputClass}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          ADD EVENT
        </button>
        <button type="button" className={buttonClass} onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
