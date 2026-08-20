import type { WidgetDef } from "./types";
import { todayWidget } from "./today.widget";
import { recentExperimentsWidget } from "./recent-experiments.widget";

export const widgets: WidgetDef[] = [todayWidget, recentExperimentsWidget];
