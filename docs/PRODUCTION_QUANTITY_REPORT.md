# Production quantity and workflow alignment

Production dashboard now builds Adjust Quantity and both Work View modes from the same date-scoped selection groups, in timeline order. Split blocks count a selection once. Previous per-session mould controls and component creation remain under Individual Settings / Add Component.

MERGE SAME FORMULA combines only identical formula_version_id values, including across order sessions and usage slots. UNMERGE restores the individual columns. This is a reversible production grouping, not deletion or consolidation of order rows. Grouping preference is stored in this browser for the current set of selection IDs; saved quantities live in the existing database rows.

Editing the total multiplier or grams distributes it in the original allocation ratio. The client checks ownership and stale rows, submits all quantity allocations in one bulk upsert, and writes selection-specific multiplier history. A history failure is shown separately from a successful quantity save. Mould/base-weight/capacity counts scale proportionally; their IDs, order links, tasks and schedules remain unchanged.

Merged weighing completion updates every source selection in a single upsert. A merged cell is DONE only when every member is DONE. Individual notes are preserved on completion changes. Split the group before editing an individual source recipe.

Workflow timeline columns deduplicate formula version IDs and display their total multiplier. Dashboard task details show the target multiplier from the same selection used by Adjust Quantity. Actual output quantities remain independently recorded observations.

Validation: 24 unit/regression tests, TypeScript noEmit, production build and changed-file ESLint (no errors; one pre-existing effect dependency warning). Authenticated live UI and live database writes were not exercised. No schema migration or existing-data update was applied during development.
