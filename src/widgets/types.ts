import type { ComponentType } from "react";

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetDef {
  id: string;
  title: string;
  size: WidgetSize;
  component: ComponentType;
}
