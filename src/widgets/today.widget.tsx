import { formatDateLabel, nowLocalTime } from "../lib/datetime";
import type { WidgetDef } from "./types";

function TodayWidget() {
  return (
    <div className="space-y-2">
      <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
        {formatDateLabel(new Date().toISOString().slice(0, 10))}
      </p>
      <p className="font-mono text-3xl font-normal text-foreground">
        {nowLocalTime()}
      </p>
    </div>
  );
}

export const todayWidget: WidgetDef = {
  id: "today",
  title: "TODAY",
  size: "small",
  component: TodayWidget,
};
