import type { QueryClient } from "@tanstack/react-query";

export const PRODUCTION_SYNC_QUERY_KEYS = [
  "orders",
  "work_sessions",
  "work_session_formula_versions",
  "dashboard_components",
  "work_blocks",
  "work_session_tasks",
  "work_session_task_ingredients",
  "work_session_progress",
  "formulas",
  "formula_versions",
  "formula_version_ingredients_bulk",
  "formula_version_ingredients",
] as const;

export async function invalidateProductionSync(client: QueryClient) {
  await Promise.all(
    PRODUCTION_SYNC_QUERY_KEYS.map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}

/** Remote changes may update clean fields, but must not overwrite unsaved local input. */
export function shouldHydrateDraftField(previous: unknown, local: unknown): boolean {
  return JSON.stringify(previous) === JSON.stringify(local);
}
