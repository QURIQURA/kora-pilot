/**
 * 대시보드에서 선택한 작업 블록(= TASK)의 상세 — 예전 WORKFLOW 화면의 TASK 한 줄이 하던 일
 * (실제 시작/종료 시간, 타이머, 작업시간·생산량·단위(효율), 관찰값, 체크리스트)을 블록에 붙였다.
 *
 * 값은 work_session_tasks 행에 그대로 저장한다 — EFFICIENCY 화면이 이 테이블을 읽기 때문. 블록이
 * 처음 선택될 때 행이 없으면 만들어 work_blocks.work_session_task_id로 잇고, 컴포넌트에 SETTINGS의
 * COMPONENT WORKFLOW TEMPLATE(기본 템플릿 + 자동 적용)가 있으면 그 내용으로 채운다. 드롭다운으로
 * 다른 템플릿을 다시 적용할 수도 있다.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  taskTypeDefinitionsQuery,
  workflowTemplatesQuery,
  workSessionTasksQuery,
  type DashboardComponentRow,
  type WorkBlock,
} from "@/lib/queries";
import { formatDuration, formatTime, localDateTimeToISO } from "@/lib/datetime";
import {
  hasObservationFields,
  minutesBetween,
  TASK_TYPE_SUGGESTIONS,
  type ChecklistItem,
  type WorkSessionTask,
} from "@/lib/workflow";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
import { loadStepTaskDefaults, loadTemplateTaskDefaults } from "@/lib/workflow-template";
import { buttonClass, primaryButtonClass } from "@/components/pilot/ui";

const smallInput = "h-7 border border-border bg-background px-1.5 text-xs tabular-nums";

function timeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const numOrNull = (v: string) => (v.trim() ? Number(v) : null);

export function BlockTaskDetails({
  block,
  row,
  title,
  onStarted,
}: {
  block: WorkBlock;
  row: DashboardComponentRow;
  title: string;
  /** TASK 시작시각이 기록되면 세션이 PLANNED일 때 IN_PROGRESS로 올리도록 알린다 */
  onStarted?: (sessionId: string, iso: string) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const sessionId = row.work_session_id;
  const tasks = useQuery(workSessionTasksQuery(sessionId));
  const templates = useQuery(workflowTemplatesQuery());
  const typeDefs = useQuery(taskTypeDefinitionsQuery());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const creating = useRef<string | null>(null);

  const task: WorkSessionTask | undefined = (tasks.data ?? []).find(
    (t) => t.id === block.work_session_task_id,
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["work_session_tasks", sessionId] });
    await queryClient.invalidateQueries({ queryKey: ["work_blocks"] });
  };

  // 블록에 TASK 행이 없으면(처음 선택) 만들어 연결한다 — 컴포넌트의 기본 템플릿이 있으면 그 값으로.
  useEffect(() => {
    if (block.work_session_task_id || tasks.isLoading || creating.current === block.id) return;
    creating.current = block.id;
    void (async () => {
      try {
        const user_id = await currentUserId();
        const { data: sel, error: selError } = await supabase
          .from("work_session_formula_versions")
          .select(
            "formula_version_id, formula_versions(formulas(components(default_workflow_template_id, auto_apply_default_workflow)))",
          )
          .eq("id", block.work_session_formula_version_id)
          .single();
        if (selError) throw selError;
        const comp = (
          sel as unknown as {
            formula_versions: {
              formulas: {
                components: {
                  default_workflow_template_id: string | null;
                  auto_apply_default_workflow: boolean;
                } | null;
              } | null;
            } | null;
          }
        ).formula_versions?.formulas?.components;
        let defaults: Awaited<ReturnType<typeof loadTemplateTaskDefaults>> | null = null;
        if (block.step_template_task_id) {
          // 템플릿 단계에서 만든 블록 — 그 단계의 값만 쓴다.
          defaults = await loadStepTaskDefaults(block.step_template_task_id);
        } else if (comp?.auto_apply_default_workflow && comp.default_workflow_template_id) {
          defaults = await loadTemplateTaskDefaults(comp.default_workflow_template_id);
        }
        const maxSort = (tasks.data ?? []).reduce((m, t) => Math.max(m, t.sort_order), -1);
        const { data: created, error: insError } = await supabase
          .from("work_session_tasks")
          .insert({
            user_id,
            work_session_id: sessionId,
            formula_version_id: sel.formula_version_id,
            task_name: title,
            task_type: defaults?.task_type ?? null,
            timer_minutes: defaults?.timer_minutes ?? null,
            checklist_items: (defaults?.checklist_items as never) ?? null,
            sort_order: maxSort + 1,
          })
          .select("id")
          .single();
        if (insError) throw insError;
        const { error: linkError } = await supabase
          .from("work_blocks")
          .update({ work_session_task_id: created.id })
          .eq("id", block.id);
        if (linkError) throw linkError;
        await refresh();
      } catch (e) {
        setError((e as Error).message);
        creating.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, block.work_session_task_id, tasks.isLoading]);

  const running = task?.status === "IN_PROGRESS";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!task) {
    return (
      <p className="border border-border p-3 font-mono text-xs text-muted-foreground">
        {error ? `TASK 준비 실패 — ${error}` : "TASK 준비 중…"}
      </p>
    );
  }

  const update = async (patch: Record<string, unknown>, label: string) => {
    const { error: e } = await supabase
      .from("work_session_tasks")
      .update(patch as never)
      .eq("id", task.id);
    if (e) setError(`${label} 저장 실패 — ${e.message}`);
    else setError(null);
    await refresh();
    // 관찰값은 플래너 TASK의 상세항목("관찰 — …")에도 반영한다.
    if (!e && Object.keys(patch).some((k) => k.startsWith("observation_"))) {
      const syncError = await syncWorkSessionToPlanner(sessionId);
      if (syncError) setError(`플래너 반영 실패 — ${syncError}`);
    }
  };

  const observationOverrides: Record<string, boolean> = {};
  for (const d of typeDefs.data ?? []) observationOverrides[d.key] = d.has_observation_fields;

  const start = async () => {
    const iso = new Date().toISOString();
    await update({ status: "IN_PROGRESS", actual_started_at: iso, completed_at: null }, "START");
    await onStarted?.(sessionId, iso);
  };
  const complete = () =>
    update({ status: "DONE", completed_at: new Date().toISOString() }, "COMPLETE");
  const reset = () =>
    update({ status: "NOT_STARTED", actual_started_at: null, completed_at: null }, "UNDO");

  const setTime = async (field: "actual_started_at" | "completed_at", value: string) => {
    const iso = value ? localDateTimeToISO(block.block_date, value) : null;
    await update({ [field]: iso }, "시간");
    if (field === "actual_started_at" && iso) await onStarted?.(sessionId, iso);
  };

  const applyTemplate = async (templateId: string) => {
    if (!templateId) return;
    const d = await loadTemplateTaskDefaults(templateId);
    if (d.error) {
      setError(`템플릿 조회 실패 — ${d.error}`);
      return;
    }
    if (!d.checklist_items && d.task_type == null && d.timer_minutes == null) {
      setError("이 템플릿에 TASK가 없어요 — SETTINGS에서 먼저 등록하세요.");
      return;
    }
    await update(
      {
        task_type: d.task_type,
        timer_minutes: d.timer_minutes,
        checklist_items: d.checklist_items,
      },
      "템플릿",
    );
  };

  const elapsedSec = task.actual_started_at
    ? (now.getTime() - new Date(task.actual_started_at).getTime()) / 1000
    : 0;
  const remainSec = task.timer_minutes != null ? task.timer_minutes * 60 - elapsedSec : null;
  const doneMinutes =
    task.actual_started_at && task.completed_at
      ? minutesBetween(task.actual_started_at, task.completed_at)
      : null;
  const checklist = (task.checklist_items as unknown as ChecklistItem[] | null) ?? [];
  const k = task.updated_at; // 저장 뒤 입력칸 defaultValue를 새로 반영

  return (
    <div className="space-y-3 border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-caps text-xs">TASK DETAILS · {title}</p>
        <div className="flex items-center gap-2">
          <span className="label-caps text-[11px] text-muted-foreground">TEMPLATE</span>
          <select
            className={`${smallInput} max-w-48`}
            value=""
            onChange={(e) => void applyTemplate(e.target.value)}
          >
            <option value="">불러오기…</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="border border-destructive px-2 py-1 text-xs text-destructive">{error}</p>
      )}

      {/* 진행 — START(타이머) / COMPLETE */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps border border-border px-2 py-1 text-[11px]">
          {task.status === "IN_PROGRESS" ? "ACTIVE" : task.status === "DONE" ? "DONE" : "READY"}
        </span>
        {task.status === "NOT_STARTED" && (
          <button type="button" className={primaryButtonClass} onClick={() => void start()}>
            {task.timer_minutes != null ? "▶ START TIMER" : "▶ START"}
          </button>
        )}
        {running && (
          <>
            <span className="font-mono text-sm tabular-nums">
              {task.timer_minutes != null
                ? remainSec !== null && remainSec > 0
                  ? `남은 ${formatDuration(remainSec)}`
                  : `+${formatDuration(Math.abs(remainSec ?? 0))}`
                : formatDuration(elapsedSec)}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              시작 {formatTime(task.actual_started_at!)}
            </span>
            <button type="button" className={primaryButtonClass} onClick={() => void complete()}>
              ■ COMPLETE
            </button>
          </>
        )}
        {task.status === "DONE" && (
          <button type="button" className={buttonClass} onClick={() => void reset()}>
            되돌리기
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 시간 */}
        <label className="space-y-1">
          <span className="label-caps block text-[11px] text-muted-foreground">
            실제 시작 → 종료
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <input
              key={`s-${k}`}
              type="time"
              className={`${smallInput} w-24`}
              defaultValue={timeValue(task.actual_started_at)}
              onBlur={(e) => {
                if (e.target.value !== timeValue(task.actual_started_at))
                  void setTime("actual_started_at", e.target.value);
              }}
            />
            <span className="text-muted-foreground">→</span>
            <input
              key={`e-${k}`}
              type="time"
              className={`${smallInput} w-24`}
              defaultValue={timeValue(task.completed_at)}
              onBlur={(e) => {
                if (e.target.value !== timeValue(task.completed_at))
                  void setTime("completed_at", e.target.value);
              }}
            />
            {doneMinutes !== null && (
              <span className="text-xs text-muted-foreground">· {Math.round(doneMinutes)} MIN</span>
            )}
          </span>
        </label>

        {/* 타입 / 타이머 */}
        <div className="space-y-1">
          <span className="label-caps block text-[11px] text-muted-foreground">
            TASK TYPE · TIMER
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <input
              key={`t-${k}`}
              className={`${smallInput} w-28`}
              list="block-task-type-suggestions"
              placeholder="TYPE"
              defaultValue={task.task_type ?? ""}
              onBlur={(e) => {
                if ((e.target.value.trim() || null) !== task.task_type)
                  void update({ task_type: e.target.value.trim() || null }, "TYPE");
              }}
            />
            <datalist id="block-task-type-suggestions">
              {TASK_TYPE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input
              key={`tm-${k}`}
              type="number"
              className={`${smallInput} w-20`}
              placeholder="타이머"
              defaultValue={task.timer_minutes ?? ""}
              onBlur={(e) => {
                const v = numOrNull(e.target.value);
                if (v !== task.timer_minutes) void update({ timer_minutes: v }, "타이머");
              }}
            />
            <span className="text-xs text-muted-foreground">분</span>
          </span>
        </div>

        {/* 효율 */}
        <div className="space-y-1 md:col-span-2">
          <span className="label-caps block text-[11px] text-muted-foreground">
            효율 — 작업시간 · 생산량 · 단위
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <input
              key={`l-${k}`}
              type="number"
              className={`${smallInput} w-20`}
              placeholder="작업시간"
              defaultValue={task.active_labour_minutes ?? ""}
              onBlur={(e) => {
                const v = numOrNull(e.target.value);
                if (v !== task.active_labour_minutes)
                  void update({ active_labour_minutes: v }, "작업시간");
              }}
            />
            <span className="text-xs text-muted-foreground">분 ·</span>
            <input
              key={`q-${k}`}
              type="number"
              className={`${smallInput} w-20`}
              placeholder="수량"
              defaultValue={task.output_quantity ?? ""}
              onBlur={(e) => {
                const v = numOrNull(e.target.value);
                if (v !== task.output_quantity) void update({ output_quantity: v }, "생산량");
              }}
            />
            <input
              key={`u-${k}`}
              className={`${smallInput} w-24`}
              placeholder="단위(g/개/장)"
              defaultValue={task.output_unit ?? ""}
              onBlur={(e) => {
                if ((e.target.value.trim() || null) !== task.output_unit)
                  void update({ output_unit: e.target.value.trim() || null }, "단위");
              }}
            />
          </span>
        </div>

        {/* 관찰값 */}
        {hasObservationFields(task.task_type, observationOverrides) && (
          <div className="space-y-1 md:col-span-2">
            <span className="label-caps block text-[11px] text-muted-foreground">관찰</span>
            <span className="flex flex-wrap items-center gap-1">
              <input
                key={`os-${k}`}
                className={`${smallInput} w-20`}
                placeholder="상태"
                defaultValue={task.observation_status ?? ""}
                onBlur={(e) =>
                  void update({ observation_status: e.target.value.trim() || null }, "관찰")
                }
              />
              {(
                [
                  ["observation_height_start_mm", "시작mm"],
                  ["observation_height_mid_mm", "중간mm"],
                  ["observation_height_end_mm", "끝mm"],
                  ["observation_temperature_c", "°C"],
                ] as const
              ).map(([field, ph]) => (
                <input
                  key={`${field}-${k}`}
                  type="number"
                  className={`${smallInput} w-16`}
                  placeholder={ph}
                  defaultValue={task[field] ?? ""}
                  onBlur={(e) => {
                    const v = numOrNull(e.target.value);
                    if (v !== task[field]) void update({ [field]: v }, "관찰");
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* 체크리스트 */}
      {checklist.length > 0 && (
        <div className="flex flex-col gap-1">
          {checklist.map((item, idx) => (
            <label key={idx} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={item.done}
                onChange={() =>
                  void update(
                    {
                      checklist_items: checklist.map((c, i) =>
                        i === idx ? { ...c, done: !c.done } : c,
                      ),
                    },
                    "체크리스트",
                  )
                }
              />
              <span className={item.done ? "line-through" : ""}>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
