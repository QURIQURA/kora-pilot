import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CategoryManager } from "@/components/pilot/CategoryManager";
import { TagManager } from "@/components/pilot/TagManager";
import { MouldManager } from "@/components/pilot/MouldManager";
import { BaseWeightManager } from "@/components/pilot/BaseWeightManager";
import { ProcessCategoryManager } from "@/components/pilot/ProcessCategoryManager";
import { ProcessParameterManager } from "@/components/pilot/ProcessParameterManager";
import { TechniqueCategoryManager } from "@/components/pilot/TechniqueCategoryManager";
import { MethodManager } from "@/components/pilot/MethodManager";
import { IngredientFunctionManager } from "@/components/pilot/IngredientFunctionManager";
import { SensoryAttributeManager } from "@/components/pilot/SensoryAttributeManager";
import { FlavourFamilyManager } from "@/components/pilot/FlavourFamilyManager";
import { AromaTagManager } from "@/components/pilot/AromaTagManager";
import { CostItemManager } from "@/components/pilot/CostItemManager";
import { MonthlyOverheadSettings } from "@/components/pilot/MonthlyOverheadSettings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "PILOT — Settings" },
      { name: "description", content: "PILOT settings: master data" },
      { property: "og:title", content: "PILOT — Settings" },
      {
        property: "og:description",
        content: "PILOT settings: master data",
      },
    ],
  }),
  component: SettingsPage,
});

/** 접이식 Settings 섹션 래퍼 — 화면이 길어지므로 섹션별로 접는다 */
function SettingsSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-[48px] w-full items-center justify-between gap-2 border border-border bg-card px-4 py-3 text-left hover:bg-secondary",
        )}
      >
        <span className="label-caps text-muted-foreground">{title}</span>
        <span className="label-caps text-xs text-muted-foreground">
          {open ? "− CLOSE" : "+ OPEN"}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/** 같은 계열 지표를 2열 그리드로 묶는 그룹 래퍼 (2026-09-23, 사용자 요청 — "규칙없이 나열" 개선) */
function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="label-caps text-[11px] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">SETTINGS</h1>
      </div>

      <SettingsGroup label="PRODUCT TAXONOMY">
        <SettingsSection title="CATEGORIES" defaultOpen>
          <CategoryManager />
        </SettingsSection>
        <SettingsSection title="TAGS">
          <TagManager />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="COST">
        <p className="mb-3 font-mono text-[11px] text-muted-foreground">
          PRODUCT 페이지의 "FULL PRODUCTION COST"는 RAW MATERIAL(재료 원가) + 여기 COST
          ITEMS의 UTILITY/CONSUMABLE/PACKAGING(케익 1개당) + 아래 MONTHLY OVERHEAD(월 고정비÷월
          예상 케익 개수)를 모두 합한 금액입니다. 각 항목의 산정 근거는 COST ITEMS의 "이력"에서
          확인/수정하세요.
        </p>
        <SettingsSection title="COST ITEMS (UTILITY / PACKAGING / CONSUMABLE / OVERHEAD)">
          <CostItemManager />
        </SettingsSection>
        <SettingsSection title="MONTHLY OVERHEAD">
          <MonthlyOverheadSettings />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="PRODUCTION BASIS">
        <SettingsSection title="MOULDS">
          <MouldManager />
        </SettingsSection>
        <SettingsSection title="BASE WEIGHTS">
          <BaseWeightManager />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="PROCESS">
        <SettingsSection title="PROCESS CATEGORIES">
          <ProcessCategoryManager />
        </SettingsSection>
        <SettingsSection title="PROCESS PARAMETERS">
          <ProcessParameterManager />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="TECHNIQUE">
        <SettingsSection title="TECHNIQUE CATEGORIES">
          <TechniqueCategoryManager />
        </SettingsSection>
        <SettingsSection title="METHODS">
          <MethodManager />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup label="INGREDIENT / SENSORY">
        <SettingsSection title="INGREDIENT FUNCTIONS">
          <IngredientFunctionManager />
        </SettingsSection>
        <SettingsSection title="SENSORY ATTRIBUTES">
          <SensoryAttributeManager />
        </SettingsSection>
        <SettingsSection title="FLAVOUR FAMILIES">
          <FlavourFamilyManager />
        </SettingsSection>
        <SettingsSection title="AROMA TAGS">
          <AromaTagManager />
        </SettingsSection>
      </SettingsGroup>
    </div>
  );
}
