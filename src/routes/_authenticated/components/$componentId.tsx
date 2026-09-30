import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TechniqueSelect } from "@/components/pilot/TechniqueSelect";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  componentQuery,
  componentUsageQuery,
  currentUserId,
  experimentsByComponentQuery,
  taskTypeColorsQuery,
  techniqueCategoriesQuery,
  workflowTemplatesByTechniqueQuery,
} from "@/lib/queries";
import { techniquePath } from "@/lib/technique";
import { formatDateTime } from "@/lib/datetime";
import {
  taskTypeColorClass,
  taskTypeColorKey,
  TASK_TYPE_COLOR_CLASSES,
  TASK_TYPE_SUGGESTIONS,
} from "@/lib/workflow";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { CurrentFormulaPanel } from "@/components/pilot/CurrentFormulaPanel";
import { DuplicateComponentModal } from "@/components/pilot/DuplicateComponentModal";
import { ComponentTagsSection } from "@/components/pilot/ComponentTagsSection";
import { ExperimentListItems } from "@/components/pilot/ExperimentList";
import { TemplateTaskEditor } from "@/components/pilot/WorkflowTemplateManager";
import {
  SectionCard,
  buttonClass,
  inputClass,
  selectClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/components/$componentId")({
  head: () => ({
    meta: [
      { title: "PILOT — Component Detail" },
      { name: "description", content: "Reusable component and where it is used" },
      { property: "og:title", content: "PILOT — Component Detail" },
      {
        property: "og:description",
        content: "Reusable component and where it is used",
      },
    ],
  }),
  component: ComponentDetailPage,
});

function ComponentDetailPage() {
  const { componentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const component = useQuery(componentQuery(componentId));
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const usage = useQuery(componentUsageQuery(componentId));
  const experiments = useQuery(experimentsByComponentQuery(componentId));
  const [duplicating, setDuplicating] = useState(false);

  const techniqueCategoryList = techniqueCategories.data ?? [];
  const path = techniquePath(techniqueCategoryList, component.data?.technique_category_id ?? null);
  const templatesForTechnique = useQuery(
    workflowTemplatesByTechniqueQuery(component.data?.technique_category_id ?? null),
  );

  useSetBreadcrumb([
    { label: "PILOT", path: "/" },
    { label: "COMPONENTS", path: "/components" },
    ...path.map((c) => ({ label: c.name })),
    { label: (component.data?.name ?? "…").toUpperCase() },
  ]);

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"components">) => {
      const { error } = await supabase.from("components").update(patch).eq("id", componentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      await queryClient.invalidateQueries({
        queryKey: ["components", componentId],
      });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("components").delete().eq("id", componentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      void navigate({ to: "/components" });
    },
  });

  if (!component.data) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {component.isLoading ? "LOADING…" : "COMPONENT NOT FOUND"}
      </p>
    );
  }

  const data = component.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <InlineText
            value={data.name}
            className="text-lg"
            onSave={(name) => update.mutate({ name })}
          />
          <p className="font-mono text-xs uppercase text-muted-foreground">
            UPDATED {formatDateTime(data.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TechniqueSelect
            className={selectClass + " w-auto"}
            value={data.technique_category_id ?? ""}
            onChange={(id) => update.mutate({ technique_category_id: id || null })}
            emptyLabel="NO TECHNIQUE CATEGORY"
          />
          <label className="flex items-center gap-1.5">
            <span className="label-caps text-[10px] text-muted-foreground">계량 기준</span>
            <select
              className={selectClass + " w-auto"}
              value={data.scaling_mode}
              onChange={(e) => update.mutate({ scaling_mode: e.target.value })}
            >
              <option value="MOULD">MOULD (몰드 기준 — 케익 반죽류)</option>
              <option value="BASE_WEIGHT">BASE WEIGHT (기본중량 기준 — 가나슈/필링/크림 등)</option>
            </select>
          </label>
          <button type="button" className={buttonClass} onClick={() => setDuplicating(true)}>
            DUPLICATE COMPONENT
          </button>
        </div>
      </div>

      <CurrentFormulaPanel componentId={componentId} componentName={data.name} />

      <SectionCard title="DEFAULT WORKFLOW">
        <p className="mb-2 font-mono text-[11px] text-muted-foreground">
          이 Component를 PRODUCTION 세션에 추가할 때 자동으로 깔아줄 기본 WORKFLOW TEMPLATE입니다.
          제작방법(위 TECHNIQUE)에 등록된 템플릿 중에서 고르세요. 기본 템플릿을 지정하면 세션에
          추가하는 즉시 TASK가 무조건 자동 생성됩니다(2026-09-30부터 끄는 옵션 없음).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={selectClass + " w-auto"}
            value={data.default_workflow_template_id ?? ""}
            disabled={!data.technique_category_id}
            onChange={(e) => {
              const id = e.target.value || null;
              update.mutate({
                default_workflow_template_id: id,
                auto_apply_default_workflow: id !== null,
              });
            }}
          >
            <option value="">
              {data.technique_category_id ? "기본 템플릿 없음" : "먼저 TECHNIQUE를 지정하세요"}
            </option>
            {(templatesForTechnique.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {data.default_workflow_template_id && (
            <span className="label-caps text-[11px] text-muted-foreground">✓ 세션에 추가 시 자동 적용됨</span>
          )}
        </div>
        {data.default_workflow_template_id && (
          <div className="mt-3 border-t border-dashed border-border pt-3">
            <p className="mb-2 font-mono text-[11px] text-muted-foreground">
              이 템플릿의 TASK 구성 — 여기서 수정하면 PRODUCTION에서 이 Component를 쓰는 모든 세션에
              공통으로 반영됩니다(제작방법이 같은 다른 Component와도 공유됨).
            </p>
            <TemplateTaskEditor templateId={data.default_workflow_template_id} />
          </div>
        )}
      </SectionCard>

      <TaskTypeColorSection />

      <SectionCard title="DESCRIPTION">
        <TextArea
          value={data.description ?? ""}
          onSave={(description) => update.mutate({ description })}
        />
      </SectionCard>

      <SectionCard title="USED IN">
        {(usage.data ?? []).length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">
            NOT LINKED TO ANY PRODUCT
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {(usage.data ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  to="/products/$productId"
                  params={{ productId: row.products.id }}
                  className="flex items-center justify-between gap-2 px-3 py-3 hover:bg-secondary"
                >
                  <span className="text-sm">{row.products.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="NOTES">
        <TextArea value={data.notes ?? ""} onSave={(notes) => update.mutate({ notes })} />
      </SectionCard>

      <SectionCard title="DEVELOPMENT HISTORY">
        <ExperimentListItems items={experiments.data ?? []} />
      </SectionCard>

      <ComponentTagsSection componentId={componentId} />

      <button
        type="button"
        className={buttonClass}
        onClick={() => {
          if (confirm("DELETE THIS COMPONENT?")) remove.mutate();
        }}
      >
        DELETE COMPONENT
      </button>

      {duplicating && (
        <DuplicateComponentModal
          sourceComponentId={componentId}
          sourceComponentName={data.name}
          onCancel={() => setDuplicating(false)}
          onCreated={() => setDuplicating(false)}
        />
      )}
    </div>
  );
}

function InlineText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={`w-full max-w-lg border border-transparent bg-transparent px-0 py-1 text-foreground outline-none hover:border-border focus:border-foreground ${className ?? ""}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== value) onSave(next);
        else setDraft(value);
      }}
    />
  );
}

/** TASK TYPE 색상 설정 — Production의 WORKFLOW 탭에 있던 편집 UI를 이쪽으로 옮겨옴(2026-09-30).
 * 데이터(task_type_colors)는 그대로 사용자 전역 — 어느 Component 페이지에서 바꿔도 모든 PRODUCTION
 * 세션의 타임라인 색상에 똑같이 반영된다. */
function TaskTypeColorSection() {
  const queryClient = useQueryClient();
  const taskTypeColors = useQuery(taskTypeColorsQuery());

  const colorOverrides = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of taskTypeColors.data ?? []) map[taskTypeColorKey(row.task_type)] = row.color_class;
    return map;
  }, [taskTypeColors.data]);

  const setTaskTypeColor = useMutation({
    mutationFn: async ({ taskType, colorClass }: { taskType: string; colorClass: string }) => {
      const userId = await currentUserId();
      const { error } = await supabase
        .from("task_type_colors")
        .upsert(
          { user_id: userId, task_type: taskTypeColorKey(taskType), color_class: colorClass },
          { onConflict: "user_id,task_type" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task_type_colors"] }),
  });

  const knownTaskTypes = useMemo(() => {
    const set = new Set<string>(TASK_TYPE_SUGGESTIONS);
    for (const row of taskTypeColors.data ?? []) set.add(row.task_type);
    return Array.from(set);
  }, [taskTypeColors.data]);

  return (
    <SectionCard title="TASK TYPE 색상">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        PRODUCTION 타임라인에서 각 TASK TYPE을 표시할 색상입니다 — 전역 설정이라 모든
        Component/세션에서 동일하게 보입니다.
      </p>
      <div className="space-y-2">
        {knownTaskTypes.map((type) => {
          const current = colorOverrides[taskTypeColorKey(type)] ?? taskTypeColorClass(type);
          return (
            <div key={type} className="flex flex-wrap items-center gap-2">
              <span
                className={`w-28 flex-none truncate rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider ${taskTypeColorClass(type, colorOverrides)}`}
              >
                {type.toUpperCase()}
              </span>
              <div className="flex flex-wrap gap-1">
                {TASK_TYPE_COLOR_CLASSES.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    title={cls}
                    className={`h-5 w-5 rounded-sm border ${cls} ${
                      current === cls ? "ring-2 ring-foreground ring-offset-1" : ""
                    }`}
                    onClick={() => setTaskTypeColor.mutate({ taskType: type, colorClass: cls })}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function TextArea({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      rows={4}
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}
