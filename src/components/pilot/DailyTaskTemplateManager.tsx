import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  dailyTaskTemplatesQuery,
  taskTypeDefinitionsQuery,
  type DailyTaskTemplate,
} from "@/lib/queries";
import { parseChecklistLines, TASK_TYPE_SUGGESTIONS } from "@/lib/workflow";
import { SectionCard, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * SETTINGS — DAILY TASKS 라이브러리(2026-10-22).
 * 케이크 제품/컴포넌트와 무관하게 매일 반복되는 작업(청소, 재료 정리, 발주 …)을 미리 등록해두는 곳.
 * 대시보드에서 여기 등록된 항목을 골라 타임라인에 올리면 그 날짜의 "Daily Project" 하위 WANN 플래너
 * TASK로 연결된다. (등록 없이 대시보드에서 즉석으로 만들 수도 있다.)
 */
export function DailyTaskTemplateManager() {
  const queryClient = useQueryClient();
  const templates = useQuery(dailyTaskTemplatesQuery());
  const taskTypeDefinitions = useQuery(taskTypeDefinitionsQuery());
  const typeOptions =
    taskTypeDefinitions.data && taskTypeDefinitions.data.length > 0
      ? taskTypeDefinitions.data.map((d) => d.name)
      : TASK_TYPE_SUGGESTIONS;

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [note, setNote] = useState("");
  const [checklist, setChecklist] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["daily_task_templates"] });

  function startNew() {
    setEditingId("new");
    setName("");
    setTaskType("");
    setMinutes("60");
    setNote("");
    setChecklist("");
  }

  function startEdit(t: DailyTaskTemplate) {
    setEditingId(t.id);
    setName(t.name);
    setTaskType(t.task_type ?? "");
    setMinutes(String(t.default_minutes));
    setNote(t.note ?? "");
    setChecklist((t.checklist_items ?? []).join("\n"));
  }

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const mins = Math.max(5, Math.round(Number(minutes) || 60));
      const payload = {
        name: trimmed,
        task_type: taskType.trim() || null,
        default_minutes: mins,
        note: note.trim() || null,
        checklist_items: parseChecklistLines(checklist),
        updated_at: new Date().toISOString(),
      };
      if (editingId === "new") {
        const user_id = await currentUserId();
        const maxSort = (templates.data ?? []).reduce((acc, t) => Math.max(acc, t.sort_order), 0);
        const { error } = await supabase
          .from("daily_task_templates")
          .insert({ ...payload, user_id, sort_order: maxSort + 1 });
        if (error) throw error;
      } else if (editingId) {
        const { error } = await supabase
          .from("daily_task_templates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      setEditingId(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = templates.data ?? [];

  const form = (
    <form
      className="space-y-2 border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_100px]">
        <input
          className={inputClass}
          autoFocus
          placeholder="작업 이름 (예: 주방 청소)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputClass}
          list="daily-task-type-options"
          placeholder="TYPE (선택)"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
        />
        <input
          className={inputClass}
          type="number"
          min={5}
          step={5}
          placeholder="기본 분"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <datalist id="daily-task-type-options">
        {typeOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <textarea
        className={`${inputClass} min-h-[52px] w-full`}
        placeholder="메모 (플래너 TASK 노트로 들어갑니다)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <textarea
        className={`${inputClass} min-h-[52px] w-full`}
        placeholder="체크리스트 — 한 줄에 하나 (나중에 TASK DETAILS에서 쓸 예정)"
        value={checklist}
        onChange={(e) => setChecklist(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="submit" className={`${primaryButtonClass} text-xs`} disabled={save.isPending}>
          {editingId === "new" ? "추가" : "저장"}
        </button>
        <button
          type="button"
          className={`${buttonClass} text-xs`}
          onClick={() => setEditingId(null)}
        >
          취소
        </button>
      </div>
    </form>
  );

  return (
    <SectionCard title="DAILY TASKS (제품과 무관한 반복 작업)">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        케이크 제품/컴포넌트와 연결되지 않는 작업을 등록해두면, PRODUCTION 대시보드에서 골라
        타임라인에 올릴 수 있습니다. 올린 작업은 WANN 플래너의 그날 "Daily Project" 하위 TASK로
        연결됩니다.
      </p>
      <div className="space-y-2">
        <ul className="divide-y divide-border border border-border">
          {rows.map((t) => (
            <li key={t.id} className="px-3 py-2">
              {editingId === t.id ? (
                form
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{t.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {t.default_minutes}분{t.task_type ? ` · ${t.task_type}` : ""}
                      {t.checklist_items?.length ? ` · 체크리스트 ${t.checklist_items.length}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={`${buttonClass} px-3 text-xs`}
                      onClick={() => startEdit(t)}
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      className={`${buttonClass} px-3 text-xs`}
                      onClick={() => {
                        if (
                          confirm(
                            `"${t.name}" 을(를) 라이브러리에서 삭제할까요? (이미 타임라인에 올린 작업은 유지됩니다)`,
                          )
                        )
                          remove.mutate(t.id);
                      }}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {rows.length === 0 && editingId !== "new" && (
            <li className="px-3 py-3 font-mono text-xs uppercase text-muted-foreground">
              등록된 DAILY TASK 없음
            </li>
          )}
        </ul>
        {editingId === "new" ? (
          form
        ) : (
          <button type="button" className={`${buttonClass} text-xs`} onClick={startNew}>
            + ADD DAILY TASK
          </button>
        )}
      </div>
    </SectionCard>
  );
}
