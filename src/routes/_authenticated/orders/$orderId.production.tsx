import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  orderQuery,
  productionPlanByOrderQuery,
  productionPlanElementsQuery,
  componentsQuery,
  formulasByComponentQuery,
  CORE_ELEMENT_SLOTS,
  CORE_ELEMENT_LABELS,
  type ProductionPlanElement,
  type ProductionPlanElementRow,
} from "@/lib/queries";
import { formatDateLabel } from "@/lib/datetime";
import { SectionCard, buttonClass, primaryButtonClass, inputClass, selectClass } from "@/components/pilot/ui";

// 2026-10-06 사용자 요청: ORDER → PRODUCTION PLAN → ELEMENT → FORMULA VERSION → PRODUCT 흐름 중
// PRODUCTION PLAN 상세 화면. ELEMENT는 CORE(Sheet/Cream/Filling, 항상 존재하는 고정 슬롯)와
// DECORATIVE(자유 추가/삭제)로 나뉘고, 각 Element가 고른 FORMULA VERSION을 모아
// SELECTED FORMULA VERSIONS에 자동으로(중복 제거해서) 보여준다 — 별도로 다시 선택하지 않음.
// 사용자가 원하면 DECORATIVE ELEMENT를 자유롭게 더 추가할 수 있어 Selected Formula Versions도
// 그만큼 늘어난다(= "추가하고 싶은 Formula가 있으면 추가 가능"이라는 요청 반영).
export const Route = createFileRoute("/_authenticated/orders/$orderId/production")({
  head: () => ({
    meta: [{ title: "PILOT — Production Plan" }, { name: "description", content: "Production plan" }],
  }),
  component: ProductionPlanPage,
});

const PLAN_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED"] as const;

function ProductionPlanPage() {
  const { orderId } = Route.useParams();
  const order = useQuery(orderQuery(orderId));
  const plan = useQuery(productionPlanByOrderQuery(orderId));
  const elements = useQuery(productionPlanElementsQuery(plan.data?.id ?? null));
  const components = useQuery(componentsQuery());
  const queryClient = useQueryClient();

  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["production_plans", "by_order", orderId] });
    await queryClient.invalidateQueries({ queryKey: ["production_plan_elements", plan.data?.id] });
  };

  const updatePlan = useMutation({
    mutationFn: async (patch: { title?: string; status?: string }) => {
      if (!plan.data) return;
      const { error } = await supabase.from("production_plans").update(patch).eq("id", plan.data.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const upsertElement = useMutation({
    mutationFn: async (args: { id?: string; patch: Partial<ProductionPlanElement> }) => {
      if (args.id) {
        const { error } = await supabase.from("production_plan_elements").update(args.patch).eq("id", args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("production_plan_elements").insert(args.patch as never);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const removeElement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_plan_elements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  if (!order.data || plan.isLoading) {
    return (
      <p className="font-mono text-xs uppercase text-muted-foreground">
        {order.isLoading || plan.isLoading ? "LOADING…" : "ORDER NOT FOUND"}
      </p>
    );
  }

  if (!plan.data) {
    return (
      <div className="space-y-4">
        <Link
          to="/orders/$orderId"
          params={{ orderId }}
          className="label-caps text-xs text-muted-foreground hover:text-foreground"
        >
          ← {order.data.order_number}
        </Link>
        <p className="font-mono text-xs uppercase text-muted-foreground">
          이 주문에는 아직 PRODUCTION PLAN이 없습니다. ORDER DETAIL에서 "CREATE PRODUCTION PLAN"으로
          먼저 생성하세요.
        </p>
      </div>
    );
  }

  const planData = plan.data;
  const title = titleDraft ?? planData.title ?? "";
  const rows = elements.data ?? [];
  const coreRows = CORE_ELEMENT_SLOTS.map((slot) => ({
    slot,
    row: rows.find((r) => r.kind === "CORE" && r.slot === slot) ?? null,
  }));
  const decorativeRows = rows.filter((r) => r.kind === "DECORATIVE");

  // SELECTED FORMULA VERSIONS — 각 Element가 고른 formula_version을 모아 중복 제거(2026-10-06).
  // Source of truth는 항상 Element 쪽이고, 이 섹션은 그 결과를 보여주기만 한다.
  const selectedVersions = new Map<string, { formulaName: string; versionNumber: number; status: string }>();
  for (const r of rows) {
    if (r.formula_version_id && r.formula_versions) {
      selectedVersions.set(r.formula_version_id, {
        formulaName: r.formula_versions.formulas?.name ?? "—",
        versionNumber: r.formula_versions.version_number,
        status: r.formula_versions.status,
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="space-y-1">
          <Link
            to="/orders/$orderId"
            params={{ orderId }}
            className="label-caps text-xs text-muted-foreground hover:text-foreground"
          >
            ← {order.data.order_number}
          </Link>
          <input
            className="label-caps block w-full max-w-xl border-0 bg-transparent p-0 text-lg text-foreground outline-none focus:border-b focus:border-foreground"
            value={title}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft != null && titleDraft !== planData.title) {
                updatePlan.mutate({ title: titleDraft });
              }
              setTitleDraft(null);
            }}
          />
        </div>
        <select
          className={selectClass + " w-auto"}
          value={planData.status}
          onChange={(e) => updatePlan.mutate({ status: e.target.value })}
        >
          {PLAN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <SectionCard title="CORE ELEMENTS">
        <div className="space-y-3">
          {coreRows.map(({ slot, row }) => (
            <ElementEditor
              key={slot}
              label={CORE_ELEMENT_LABELS[slot]}
              element={row}
              components={components.data ?? []}
              onChangeComponent={(componentId) => {
                if (row) {
                  upsertElement.mutate({ id: row.id, patch: { component_id: componentId || null, formula_version_id: null } });
                } else if (componentId) {
                  upsertElement.mutate({
                    patch: {
                      production_plan_id: planData.id,
                      kind: "CORE",
                      slot,
                      label: CORE_ELEMENT_LABELS[slot],
                      component_id: componentId,
                      formula_version_id: null,
                      sort_order: CORE_ELEMENT_SLOTS.indexOf(slot),
                    } as never,
                  });
                }
              }}
              onChangeFormulaVersion={(formulaVersionId) => {
                if (row) upsertElement.mutate({ id: row.id, patch: { formula_version_id: formulaVersionId || null } });
              }}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="DECORATIVE ELEMENTS"
        action={
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              upsertElement.mutate({
                patch: {
                  production_plan_id: planData.id,
                  kind: "DECORATIVE",
                  slot: null,
                  label: "New Element",
                  component_id: null,
                  formula_version_id: null,
                  sort_order: decorativeRows.length,
                } as never,
              })
            }
          >
            + ADD ELEMENT
          </button>
        }
      >
        {decorativeRows.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            장식/마감 요소가 없습니다. "+ ADD ELEMENT"로 추가하세요(예: Chocolate Tuile).
          </p>
        ) : (
          <div className="space-y-3">
            {decorativeRows.map((row) => (
              <ElementEditor
                key={row.id}
                label={row.label}
                editableLabel
                onChangeLabel={(label) => upsertElement.mutate({ id: row.id, patch: { label } })}
                element={row}
                components={components.data ?? []}
                onChangeComponent={(componentId) =>
                  upsertElement.mutate({ id: row.id, patch: { component_id: componentId || null, formula_version_id: null } })
                }
                onChangeFormulaVersion={(formulaVersionId) =>
                  upsertElement.mutate({ id: row.id, patch: { formula_version_id: formulaVersionId || null } })
                }
                onRemove={() => removeElement.mutate(row.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="SELECTED FORMULA VERSIONS">
        {selectedVersions.size === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            아직 선택된 FORMULA VERSION이 없습니다 — 위 Element에서 선택하면 여기 자동으로 모입니다.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {[...selectedVersions.values()].map((v, i) => (
              <li key={i} className="py-1.5 text-sm">
                {v.formulaName} — v{v.versionNumber}
                {v.status !== "DRAFT" && <span className="text-muted-foreground"> ({v.status})</span>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="PRODUCTION WORKFLOW">
        <p className="font-mono text-xs text-muted-foreground">
          실제 생산 순서/작업은 기존 PRODUCTION(WORK SESSION)에서 관리합니다. 이 Production Plan이
          확정되면 PRODUCTION 메뉴에서 WORK SESSION을 시작해 Element의 Formula Version으로 작업을
          진행하세요.
        </p>
        <Link to="/production" className={buttonClass + " mt-2 inline-flex"}>
          PRODUCTION으로 이동
        </Link>
      </SectionCard>

      {order.data.event_date && (
        <p className="font-mono text-[11px] text-muted-foreground">
          DELIVERY {formatDateLabel(order.data.pickup_at ? order.data.pickup_at.slice(0, 10) : order.data.event_date)}
        </p>
      )}
    </div>
  );
}

function ElementEditor({
  label,
  editableLabel,
  onChangeLabel,
  element,
  components,
  onChangeComponent,
  onChangeFormulaVersion,
  onRemove,
}: {
  label: string;
  editableLabel?: boolean;
  onChangeLabel?: (label: string) => void;
  element: ProductionPlanElementRow | null;
  components: { id: string; name: string }[];
  onChangeComponent: (componentId: string) => void;
  onChangeFormulaVersion: (formulaVersionId: string) => void;
  onRemove?: () => void;
}) {
  const formulas = useQuery({
    ...formulasByComponentQuery(element?.component_id ?? ""),
    enabled: Boolean(element?.component_id),
  });
  const versionOptions = (formulas.data ?? []).flatMap((formula) =>
    formula.formula_versions.map((v) => ({
      id: v.id,
      label: `${formula.name} · V${v.version_number}${v.status !== "DRAFT" ? ` (${v.status})` : ""}`,
    })),
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border border-border p-2">
      {editableLabel ? (
        <input
          className={inputClass + " !w-40"}
          defaultValue={label}
          onBlur={(e) => onChangeLabel?.(e.target.value.trim() || "New Element")}
        />
      ) : (
        <span className="label-caps w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      )}
      <select
        className={selectClass + " !w-44"}
        value={element?.component_id ?? ""}
        onChange={(e) => onChangeComponent(e.target.value)}
      >
        <option value="">— COMPONENT 선택 —</option>
        {components.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className={selectClass + " !w-56"}
        value={element?.formula_version_id ?? ""}
        onChange={(e) => onChangeFormulaVersion(e.target.value)}
        disabled={!element?.component_id}
      >
        <option value="">— FORMULA VERSION 선택 —</option>
        {versionOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      {onRemove && (
        <button type="button" className="label-caps text-xs text-muted-foreground hover:text-destructive" onClick={onRemove}>
          ✕ 제거
        </button>
      )}
    </div>
  );
}
