import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CategoryManager } from "@/components/pilot/CategoryManager";
import { TagManager } from "@/components/pilot/TagManager";
import { MouldManager } from "@/components/pilot/MouldManager";
import { ProcessCategoryManager } from "@/components/pilot/ProcessCategoryManager";
import { ProcessParameterManager } from "@/components/pilot/ProcessParameterManager";
import { TechniqueCategoryManager } from "@/components/pilot/TechniqueCategoryManager";
import { MethodManager } from "@/components/pilot/MethodManager";
import { IngredientFunctionManager } from "@/components/pilot/IngredientFunctionManager";
import { SensoryAttributeManager } from "@/components/pilot/SensoryAttributeManager";
import { FlavourFamilyManager } from "@/components/pilot/FlavourFamilyManager";
import { AromaTagManager } from "@/components/pilot/AromaTagManager";
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

function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">SETTINGS</h1>
      </div>
      <SettingsSection title="CATEGORIES" defaultOpen>
        <CategoryManager />
      </SettingsSection>
      <SettingsSection title="TAGS">
        <TagManager />
      </SettingsSection>
      <SettingsSection title="MOULDS">
        <MouldManager />
      </SettingsSection>
      <SettingsSection title="PROCESS CATEGORIES">
        <ProcessCategoryManager />
      </SettingsSection>
      <SettingsSection title="PROCESS PARAMETERS">
        <ProcessParameterManager />
      </SettingsSection>
      <SettingsSection title="TECHNIQUE CATEGORIES">
        <TechniqueCategoryManager />
      </SettingsSection>
      <SettingsSection title="METHODS">
        <MethodManager />
      </SettingsSection>
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
    </div>
  );
}
