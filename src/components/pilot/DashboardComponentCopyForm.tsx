import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CORE_SLOT_LABELS,
  currentUserId,
  formulasQuery,
  techniqueCategoriesQuery,
  type CoreSlot,
} from "@/lib/queries";
import { applyDefaultWorkflowForFormulaVersion } from "@/lib/workflow-template";
import { syncWorkSessionToPlanner } from "@/lib/work-session";
import { inputClass, primaryButtonClass } from "./ui";

/**
 * 새 COMPONENT를 만든 뒤 FORMULA/VERSION/세션 연결 중 하나라도 실패하면, 포뮬라 없는 빈 COMPONENT가
 * 남지 않도록(COMPONENT 페이지에 "배합이 없습니다"로 뜨는 문제) 만들어진 COMPONENT와 FORMULA를 지운다.
 */
async function withCleanup<T>(
  run: (track: (componentId: string) => void) => Promise<T>,
): Promise<T> {
  let created: string | null = null;
  try {
    return await run((id) => {
      created = id;
    });
  } catch (e) {
    if (created) {
      await supabase.from("formulas").delete().eq("component_id", created);
      await supabase.from("components").delete().eq("id", created);
    }
    throw e;
  }
}

/**
 * 대시보드에서 "기존 COMPONENT를 복사해 새 COMPONENT를 만들고 이 오더의 WORK SESSION에 바로 넣기".
 * 2026-10-22 요청: 원본의 **최신 FORMULA VERSION 하나만** 복사한다(모든 버전을 복사하지 않음) —
 * 새 COMPONENT + FORMULA + V1(CURRENT)과 그 재료(보조 계량 포함)가 만들어진다.
 * (DuplicateComponentModal은 CURRENT 버전을 복사하는 별도 화면 — 이쪽은 가장 높은 version_number 기준.)
 */
export function DashboardComponentCopyForm({
  sessionId,
  slot,
  nextSort,
  onDone,
}: {
  sessionId: string;
  slot: CoreSlot;
  nextSort: number;
  onDone: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const formulas = useQuery(formulasQuery());
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const [formulaId, setFormulaId] = useState("");
  const [name, setName] = useState("");

  const list = [...(formulas.data ?? [])]
    .filter((f) => f.formula_versions.length > 0)
    .sort((a, b) => (a.components?.name ?? a.name).localeCompare(b.components?.name ?? b.name));
  const source = list.find((f) => f.id === formulaId) ?? null;
  const latest = source
    ? [...source.formula_versions].sort((a, b) => b.version_number - a.version_number)[0]
    : null;

  const copy = useMutation({
    mutationFn: () =>
      withCleanup(async (track) => {
        if (!source || !latest) throw new Error("복사할 컴포넌트를 고르세요");
        const trimmed = name.trim();
        if (!trimmed) throw new Error("새 이름을 입력하세요");
        const user_id = await currentUserId();

        // 1) 새 COMPONENT (원본이 COMPONENT에 연결돼 있을 때만)
        let newComponentId: string | null = null;
        let newComponentForWorkflow: typeof source.components = null;
        if (source.component_id) {
          const { data: srcComp, error: srcCompErr } = await supabase
            .from("components")
            .select(
              "technique_category_id, description, notes, scaling_mode, default_workflow_template_id, auto_apply_default_workflow",
            )
            .eq("id", source.component_id)
            .single();
          if (srcCompErr) throw srcCompErr;
          const { data: newComp, error: compErr } = await supabase
            .from("components")
            .insert({
              user_id,
              name: trimmed,
              technique_category_id: srcComp.technique_category_id,
              description: srcComp.description,
              notes: srcComp.notes,
              scaling_mode: srcComp.scaling_mode ?? "",
              default_workflow_template_id: srcComp.default_workflow_template_id,
              auto_apply_default_workflow: srcComp.auto_apply_default_workflow,
            })
            .select(
              "id, name, scaling_mode, default_workflow_template_id, auto_apply_default_workflow, technique_category_id",
            )
            .single();
          if (compErr) throw compErr;
          newComponentId = newComp.id;
          track(newComp.id);
          newComponentForWorkflow = newComp as typeof source.components;
        }

        // 2) 새 FORMULA + 최신 버전 하나만 V1(CURRENT)으로
        const { data: srcVersion, error: svErr } = await supabase
          .from("formula_versions")
          .select("default_mould_id, yield_quantity, bath_water_g, basis_overrides, notes")
          .eq("id", latest.id)
          .single();
        if (svErr) throw svErr;
        const { data: srcIngredients, error: siErr } = await supabase
          .from("formula_version_ingredients")
          .select("ingredient_id, amount, unit, note, sort_order, secondary_amount, secondary_unit")
          .eq("formula_version_id", latest.id);
        if (siErr) throw siErr;

        const { data: newFormula, error: fErr } = await supabase
          .from("formulas")
          .insert({
            user_id,
            name: trimmed,
            component_id: newComponentId,
            method_id: source.method_id,
            technique_category_id: source.technique_category_id,
            derived_from_formula_id: source.id,
          })
          .select("id")
          .single();
        if (fErr) throw fErr;

        const { data: newVersion, error: vErr } = await supabase
          .from("formula_versions")
          .insert({
            user_id,
            formula_id: newFormula.id,
            version_number: 1,
            status: "CURRENT",
            default_mould_id: srcVersion.default_mould_id,
            yield_quantity: srcVersion.yield_quantity,
            bath_water_g: srcVersion.bath_water_g,
            basis_overrides: srcVersion.basis_overrides,
            notes: srcVersion.notes,
          })
          .select("id")
          .single();
        if (vErr) throw vErr;

        if ((srcIngredients ?? []).length > 0) {
          const { error: ingErr } = await supabase.from("formula_version_ingredients").insert(
            (srcIngredients ?? []).map((row) => ({
              user_id,
              formula_version_id: newVersion.id,
              ingredient_id: row.ingredient_id,
              amount: row.amount,
              unit: row.unit,
              note: row.note,
              sort_order: row.sort_order,
              secondary_amount: row.secondary_amount,
              secondary_unit: row.secondary_unit,
              amount_source: "copied",
            })),
          );
          if (ingErr) throw ingErr;
        }

        // 3) 이 오더의 WORK SESSION에 CORE 행으로 추가(배수 ×1 — 필요하면 ADJUST QUANTITY에서 조절)
        const isMould = (source.components?.scaling_mode ?? null) === "MOULD";
        const { error: rowErr } = await supabase.from("work_session_formula_versions").insert({
          user_id,
          work_session_id: sessionId,
          formula_version_id: newVersion.id,
          kind: "CORE",
          slot,
          multiplier: 1,
          mould_id: isMould ? srcVersion.default_mould_id : null,
          mould_qty: isMould ? 1 : null,
          base_weight_id: null,
          base_weight_qty: null,
          capacity_id: isMould ? srcVersion.default_mould_id : null,
          capacity_qty: isMould ? 1 : null,
          sort_order: nextSort,
        });
        if (rowErr) throw rowErr;

        const { error: wfErr } = await applyDefaultWorkflowForFormulaVersion({
          sessionId,
          userId: user_id,
          formulaVersionId: newVersion.id,
          component: newComponentForWorkflow,
          formulaTechniqueCategoryId: source.technique_category_id ?? null,
          techniqueCategories: techniqueCategories.data ?? [],
        });
        if (wfErr) console.error("기본 워크플로 자동 적용 실패:", wfErr);
        await syncWorkSessionToPlanner(sessionId);
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      await onDone();
    },
  });

  return (
    <form
      className="space-y-2 border border-dashed border-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        copy.mutate();
      }}
    >
      <p className="font-mono text-[11px] text-muted-foreground">
        {CORE_SLOT_LABELS[slot]} · 기존 컴포넌트의 <b>최신 버전 하나만</b> 복사해 새 컴포넌트를
        만들어요.
      </p>
      <select
        className={inputClass}
        value={formulaId}
        onChange={(e) => {
          const id = e.target.value;
          setFormulaId(id);
          const f = list.find((x) => x.id === id);
          setName(f ? `${f.components?.name ?? f.name} Copy` : "");
        }}
        required
      >
        <option value="">복사할 컴포넌트…</option>
        {list.map((f) => (
          <option key={f.id} value={f.id}>
            {f.components?.name ?? f.name}
          </option>
        ))}
      </select>
      {latest && (
        <p className="font-mono text-[10px] text-muted-foreground">
          복사할 버전: V{latest.version_number} ({latest.status})
        </p>
      )}
      <input
        className={inputClass}
        placeholder="새 컴포넌트 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      {copy.isError && (
        <p className="font-mono text-[11px] text-destructive">{(copy.error as Error).message}</p>
      )}
      <button
        type="submit"
        className={`${primaryButtonClass} !min-h-[28px] text-[11px]`}
        disabled={copy.isPending || !source}
      >
        {copy.isPending ? "복사 중…" : "COPY & ADD"}
      </button>
    </form>
  );
}

/**
 * 대시보드에서 "빈 새 COMPONENT"를 만들어 이 오더의 WORK SESSION에 바로 넣는다(2026-10-22).
 * 이름만 정하면 COMPONENT + FORMULA + 빈 V1(CURRENT)이 생기고, 재료/제작방법은 COMPONENT 페이지에서 채우면 된다.
 */
export function DashboardComponentNewForm({
  sessionId,
  slot,
  nextSort,
  onDone,
}: {
  sessionId: string;
  slot: CoreSlot;
  nextSort: number;
  onDone: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const techniqueCategories = useQuery(techniqueCategoriesQuery());
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () =>
      withCleanup(async (track) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error("이름을 입력하세요");
        const user_id = await currentUserId();
        const { data: comp, error: compErr } = await supabase
          .from("components")
          .insert({ user_id, name: trimmed, scaling_mode: "" })
          .select("id")
          .single();
        if (compErr) throw compErr;
        track(comp.id);
        const { data: formula, error: fErr } = await supabase
          .from("formulas")
          .insert({ user_id, name: trimmed, component_id: comp.id })
          .select("id")
          .single();
        if (fErr) throw fErr;
        const { data: version, error: vErr } = await supabase
          .from("formula_versions")
          .insert({ user_id, formula_id: formula.id, version_number: 1, status: "CURRENT" })
          .select("id")
          .single();
        if (vErr) throw vErr;
        const { error: rowErr } = await supabase.from("work_session_formula_versions").insert({
          user_id,
          work_session_id: sessionId,
          formula_version_id: version.id,
          kind: "CORE",
          slot,
          multiplier: 1,
          sort_order: nextSort,
        });
        if (rowErr) throw rowErr;
        const { error: wfErr } = await applyDefaultWorkflowForFormulaVersion({
          sessionId,
          userId: user_id,
          formulaVersionId: version.id,
          component: null,
          formulaTechniqueCategoryId: null,
          techniqueCategories: techniqueCategories.data ?? [],
        });
        if (wfErr) console.error("기본 워크플로 자동 적용 실패:", wfErr);
        await syncWorkSessionToPlanner(sessionId);
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      await onDone();
    },
  });

  return (
    <form
      className="space-y-2 border border-dashed border-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <p className="font-mono text-[11px] text-muted-foreground">
        {CORE_SLOT_LABELS[slot]} · 이름만 정해 빈 컴포넌트를 만들어요. 재료·제작방법은 COMPONENT
        페이지에서 채우세요.
      </p>
      <input
        className={inputClass}
        placeholder="새 컴포넌트 이름"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        required
      />
      {create.isError && (
        <p className="font-mono text-[11px] text-destructive">{(create.error as Error).message}</p>
      )}
      <button
        type="submit"
        className={`${primaryButtonClass} !min-h-[28px] text-[11px]`}
        disabled={create.isPending}
      >
        {create.isPending ? "만드는 중…" : "CREATE & ADD"}
      </button>
    </form>
  );
}
