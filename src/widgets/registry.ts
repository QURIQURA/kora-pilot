import type { WidgetDef } from "./types";
import { todayWidget } from "./today.widget";
import { activeExperimentsWidget } from "./active-experiments.widget";
import { recentObservationsWidget } from "./recent-observations.widget";
import { recentProcessLogsWidget } from "./recent-process-logs.widget";

export const widgets: WidgetDef[] = [
  todayWidget,
  activeExperimentsWidget,
  recentObservationsWidget,
  recentProcessLogsWidget,
];
