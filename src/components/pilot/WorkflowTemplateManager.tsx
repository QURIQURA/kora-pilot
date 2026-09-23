import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  techniqueCategoriesQuery,
  workflowTemplatesQuery,
  workflowTemplateTasksQuery,
  workflowTemplateTaskPredecessorsQuery,
  type WorkflowTemplate,
  type WorkflowTemplateTask,
} from "@/lib/queries";
import { leafTechniques, techniquePathLabel } from "@/lib/technique";
import { hasTimerField, parseChecklistLines, TASK_TYPE_SUGGESTIONS } from "@/lib/workflow";
import { SectionCard, buttonClass, inputClass } from "./ui";

/**
 * SETTINGS — WORKFLOW TEMPLATES 관리(2026-09-23).
 * "제작방법(TECHNIQUE CATEGORY)이 같으면 보통 공정도 같다"는 사용자 아이디어를 반영 — 제작방법별로
 * 표준 TASK 순서(이름/TYPE/선행관계, 시간은 당연히 없음)를 미리 등록해두고, PRODUCTION 세션에서
 * "템플릿 불러오기"로 그대로 깔아 쓸 수 있다. PRODUCT의 technique_category_id로 어떤 템플릿을 쓸지
 * 연결한다(PRODUCT 상세의 "제작방법" 필드).
 */
export function WorkflowTemplateManager() {
  const queryClient = useQueryClient();
  const techniques = useQuery(techniqueCategoriesQuery());
  const templates = useQuery(workflowTemplatesQuery());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: ["workflow_templates"] });

  const createTemplate = useMutation({
    mutationFn: async ({ techniqueCategoryId, name }: { techniqueCategoryId: string; name: string }) => {
      const user_id = await currentUserId();
      const { error } = await supabase
        .from("workflow_templates")
        .insert({ user_id, technique_category_id: techniqueCategoryId, name });
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateTemplates();
      await queryClient.invalidateQueries({ queryKey: ["workflow_templates_by_technique"] });
    },
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflow_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateTemplates();
      await queryClient.invalidateQueries({ queryKey: ["workflow_templates_by_technique"] });
    },
  });

  const techniqueList = techniques.data ?? [];
  const leaves = leafTechniques(techniqueList);
  const rows = templates.data ?? [];
  const grouped = new Map<string, WorkflowTemplate[]>();
  for (const t of rows) grouped.set(t.technique_category_id, [...(grouped.get(t.technique_category_id) ?? []), t]);

  return (
    <SectionCard title="WORKFLOW TEMPLATES (제작방법별 표준 TASK 순서)">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        제작방법(TECHNIQUE CATEGORY)마다 표준 TASK 순서를 등록해두면, PRODUCTION 세션의 WORKFLOW
        탭에서 "템플릿 불러오기"로 한 번에 깔아 쓸 수 있습니다. PRODUCT 상세의 "제작방법"을 지정해야
        연결됩니다.
      </p>
      <div className="space-y-3">
        {leaves.map(({ category }) => (
            <div key={category.id} className="border border-border">
              <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
                <span className="label-caps text-xs text-muted-foreground">
                  {techniquePathLabel(techniqueList, category.id)}
                </span>
                <button
                  type="button"
                  className="label-caps px-2 py-1 text-xs hover:bg-secondary"
                  onClick={() => {
                    setAddingFor((v) => (v === category.id ? null : category.id));
                    setNewTemplateName("");
                  }}
                >
                  {addingFor === category.id ? "CLOSE" : "+ ADD TEMPLATE"}
                </button>
              </div>
              {addingFor === category.id && (
                <form
                  className="flex gap-2 border-b border-dashed border-border p-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = newTemplateName.trim();
                    if (!name) return;
                    createTemplate.mutate({ techniqueCategoryId: category.id, name });
                    setNewTemplateName("");
                    setAddingFor(null);
                  }}
                >
                  <input
                    className={`${inputClass} flex-1`}
                    autoFocus
                    placeholder="템플릿 이름 (예: 시폰법 기본)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                  <button type="submit" className={`${buttonClass} text-xs`}>
                    추가
                  </button>
                </form>
              )}
              <ul className="divide-y divide-border">
                {(grouped.get(category.id) ?? []).map((template) => (
                  <li key={template.id}>
                    <div className="flex items-center justify-between px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-sm hover:underline"
                        onClick={() => setExpanded((v) => (v === template.id ? null : template.id))}
                      >
                        {expanded === template.id ? "▾" : "▸"} {template.name}
                      </button>
                      <button
                        type="button"
                        className={`${buttonClass} px-3 text-xs`}
                        onClick={() => {
                          if (confirm(`"${template.name}" 템플릿을 삭제할까요? (TASK도 함께 삭제됩니다)`))
                            removeTemplate.mutate(template.id);
                        }}
                      >
                        DELETE
                      </button>
                    </div>
                    {expanded === template.id && (
                      <div className="border-t border-dashed border-border p-3">
                        <TemplateTaskEditor templateId={template.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {leaves.length === 0 && (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            등록된 TECHNIQUE CATEGORY(제작방법) 없음 — 위의 TECHNIQUE CATEGORIES에서 먼저 등록하세요.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function TemplateTaskEditor({ templateId }: { templateId: string }) {
  const queryClient = useQueryClient();
  const tasks = useQuery(workflowTemplateTasksQuery(templateId));
  const predecessors = useQuery(workflowTemplateTaskPredecessorsQuery(templateId));
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState("");
  const [predecessorTaskIds, setPredecessorTaskIds] = useState<string[]>([]);
  const [isOptional, setIsOptional] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState("");
  const [checklistText, setChecklistText] = useState("");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workflow_template_tasks", templateId] });
    await queryClient.invalidateQueries({
      queryKey: ["workflow_template_task_predecessors", templateId],
    });
  };

  const addTask = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const user_id = await currentUserId();
      const maxSort = (tasks.data ?? []).reduce((acc, t) => Math.max(acc, t.sort_order), 0);
      const checklistItems = parseChecklistLines(checklistText);
      const { data: inserted, error } = await supabase
        .from("workflow_template_tasks")
        .insert({
          user_id,
          template_id: templateId,
          task_name: trimmed,
          task_type: taskType.trim() || null,
          sort_order: maxSort + 1,
          is_optional: isOptional,
          timer_minutes: timerMinutes.trim() ? Number(timerMinutes) : null,
          checklist_items: checklistItems.length > 0 ? checklistItems : null,
        })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("insert failed");
      if (predecessorTaskIds.length > 0) {
        const { error: predErr } = await supabase.from("workflow_template_task_predecessors").insert(
          predecessorTaskIds.map((predecessor_task_id) => ({
            user_id,
            template_id: templateId,
            task_id: inserted.id,
            predecessor_task_id,
          })),
        );
        if (predErr) throw predErr;
      }
    },
    onSuccess: async () => {
      setName("");
      setTaskType("");
      setPredecessorTaskIds([]);
      setIsOptional(false);
      setTimerMinutes("");
      setChecklistText("");
      await invalidate();
    },
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflow_template_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const rows = tasks.data ?? [];
  const predMap = predecessors.data ?? {};

  const moveTask = useMutation({
    mutationFn: async ({ task, direction }: { task: WorkflowTemplateTask; direction: -1 | 1 }) => {
      const idx = rows.findIndex((t) => t.id === task.id);
      const neighbor = rows[idx + direction];
      if (idx < 0 || !neighbor) return;
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase
          .from("workflow_template_tasks")
          .update({ sort_order: neighbor.sort_order })
          .eq("id", task.id),
        supabase
          .from("workflow_template_tasks")
          .update({ sort_order: task.sort_order })
          .eq("id", neighbor.id),
      ]);
      if (e1 || e2) throw e1 ?? e2;
    },
    onSuccess: invalidate,
  });

  const showTimer = hasTimerField(taskType);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <input
          className={`${inputClass} md:w-48`}
          placeholder="TASK NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${inputClass} md:w-36`}
          placeholder="TYPE"
          list="workflow-template-task-types"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
        />
        <datalist id="workflow-template-task-types">
          {TASK_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {showTimer && (
          <input
            type="number"
            min="1"
            className={`${inputClass} md:w-28`}
            placeholder="타이머(분)"
            value={timerMinutes}
            onChange={(e) => setTimerMinutes(e.target.value)}
          />
        )}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={isOptional} onChange={(e) => setIsOptional(e.target.checked)} />
          선택(생략 가능)
        </label>
        <button
          type="button"
          className={`${buttonClass} text-xs`}
          disabled={addTask.isPending}
          onClick={() => addTask.mutate()}
        >
          + TASK 추가
        </button>
      </div>
      <textarea
        className={`${inputClass} min-h-[52px] text-xs`}
        placeholder="체크리스트(선택, 한 줄에 하나) — 예: 재료 계량&#10;섞기&#10;질감 확인"
        value={checklistText}
        onChange={(e) => setChecklistText(e.target.value)}
      />
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-border pt-2">
          <span className="text-[10px] tracking-wider text-muted-foreground">
            선행 TASK(선택, 새로 추가할 TASK 기준)
          </span>
          {rows.map((t) => {
            const checked = predecessorTaskIds.includes(t.id);
            return (
              <label key={t.id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setPredecessorTaskIds((prev) =>
                      e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                    );
                  }}
                />
                {t.task_name}
              </label>
            );
          })}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">TASK 없음</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((task, idx) => (
            <li key={task.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex flex-none flex-col">
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-xs disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={() => moveTask.mutate({ task, direction: -1 })}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-xs disabled:opacity-30"
                  disabled={idx === rows.length - 1}
                  onClick={() => moveTask.mutate({ task, direction: 1 })}
                >
                  ▼
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {task.task_name}
                  {task.task_type ? (
                    <span className="ml-2 rounded-sm border px-1 text-[9px] tracking-wider text-muted-foreground">
                      {task.task_type.toUpperCase()}
                    </span>
                  ) : null}
                  {task.is_optional && (
                    <span className="ml-1 rounded-sm border px-1 text-[9px] tracking-wider text-muted-foreground">
                      선택
                    </span>
                  )}
                  {task.timer_minutes != null && (
                    <span className="ml-1 rounded-sm border px-1 text-[9px] tracking-wider text-muted-foreground">
                      {task.timer_minutes}분
                    </span>
                  )}
                </div>
                {(predMap[task.id]?.length ?? 0) > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    이전 단계:{" "}
                    {predMap[task.id]!.map((pid) => rows.find((r) => r.id === pid)?.task_name ?? "?").join(
                      " + ",
                    )}
                  </div>
                )}
                {task.checklist_items && task.checklist_items.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    체크리스트: {task.checklist_items.join(" · ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`${buttonClass} px-2 text-xs`}
                onClick={() => removeTask.mutate(task.id)}
              >
                DELETE
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
