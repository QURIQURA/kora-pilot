import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ProductCreateModal } from "@/components/pilot/ProductCreateModal";
import { ComponentCreateModal } from "@/components/pilot/ComponentCreateModal";
import { ExperimentCreateModal } from "@/components/pilot/ExperimentCreateForm";
import { buttonClass } from "@/components/pilot/ui";
import type { WidgetDef } from "./types";

type CreateTarget = "product" | "component" | "experiment" | null;

function QuickCreateWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<CreateTarget>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen("product")}
        >
          + PRODUCT
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen("component")}
        >
          + COMPONENT
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen("experiment")}
        >
          + EXPERIMENT
        </button>
      </div>

      {open === "product" && (
        <ProductCreateModal onClose={() => setOpen(null)} />
      )}
      {open === "component" && (
        <ComponentCreateModal onClose={() => setOpen(null)} />
      )}
      {open === "experiment" && (
        <ExperimentCreateModal
          onCancel={() => setOpen(null)}
          onCreated={(id) => {
            setOpen(null);
            void navigate({
              to: "/experiments/$experimentId",
              params: { experimentId: id },
            });
          }}
        />
      )}
    </div>
  );
}

export const quickCreateWidget: WidgetDef = {
  id: "quick-create",
  title: "QUICK CREATE",
  size: "full",
  component: QuickCreateWidget,
};
