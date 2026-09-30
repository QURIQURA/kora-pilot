import { useState } from "react";
import { ProductCreateModal } from "@/components/pilot/ProductCreateModal";
import { ComponentCreateModal } from "@/components/pilot/ComponentCreateModal";
import { buttonClass } from "@/components/pilot/ui";
import type { WidgetDef } from "./types";

type CreateTarget = "product" | "component" | null;

function QuickCreateWidget() {
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
      </div>

      {open === "product" && (
        <ProductCreateModal onClose={() => setOpen(null)} />
      )}
      {open === "component" && (
        <ComponentCreateModal onClose={() => setOpen(null)} />
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
