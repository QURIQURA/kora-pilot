import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";

const row = {
  id: "selected",
  user_id: "owner",
  work_session_id: "session",
  formula_version_id: "version",
  updated_at: "timestamp",
  planner_task_id: "planner-selection",
};
function harness(options = {}) {
  const state = { calls: [], synced: null, blockReads: 0, ...options };
  globalThis.__planActions = state;
  state.from = (table) => {
    const q = { table, action: "read", filters: [] };
    const chain = {};
    for (const method of ["select", "eq", "neq", "in", "is", "single"])
      chain[method] = (...args) => {
        q.filters.push([method, ...args]);
        return chain;
      };
    chain.delete = () => {
      q.action = "delete";
      return chain;
    };
    chain.then = (resolve) => {
      state.calls.push(q);
      let data = [],
        error = null;
      if (q.action === "delete") {
        data = { id: "selected" };
        if (table === "work_session_formula_versions" && state.conflict)
          error = { message: "conflict" };
      } else if (table === "work_sessions") data = { status: "PLANNED", order_id: "order" };
      else if (table === "orders") data = { status: "CONFIRMED" };
      else if (table === "work_blocks")
        data =
          ++state.blockReads === 1
            ? [{ id: "block", planner_task_id: "planner-block", work_session_task_id: "task" }]
            : state.shared
              ? [{ work_session_task_id: "task" }]
              : [];
      else if (table === "work_session_progress") data = state.progress ?? [];
      else if (table === "work_session_tasks")
        data = [
          {
            id: "task",
            status: state.started ? "IN_PROGRESS" : "NOT_STARTED",
            actual_started_at: state.started ? "started" : null,
            completed_at: null,
            note: null,
            checklist_items: [],
          },
        ];
      return Promise.resolve({ data, error }).then(resolve);
    };
    return chain;
  };
  return state;
}
const { removePlannedComponent } = await loadTs("src/lib/production-plan-actions.ts", {
  "@/integrations/supabase/client":
    "export const supabase={from:(table)=>globalThis.__planActions.from(table)};",
  "@/lib/queries": "export async function currentUserId(){return 'owner'};",
  "@/lib/work-session":
    "export async function syncWorkSessionToPlanner(id,options){globalThis.__planActions.synced={id,options};return null};",
});
test("remove exactly one planned assignment with owner and timestamp guards; preserve recipe masters", async () => {
  const state = harness();
  await removePlannedComponent(row);
  const deleted = state.calls.filter((q) => q.action === "delete");
  assert.deepEqual(
    deleted.map((q) => q.table),
    ["work_session_formula_versions", "work_session_tasks"],
  );
  assert.ok(
    deleted[0].filters.some(
      (f) => f[0] === "eq" && f[1] === "updated_at" && f[2] === row.updated_at,
    ),
  );
  assert.ok(
    deleted.every((q) =>
      q.filters.some((f) => f[0] === "eq" && f[1] === "user_id" && f[2] === "owner"),
    ),
  );
  assert.deepEqual(state.synced.options.deletePlannerTaskIds, [
    "planner-selection",
    "planner-block",
  ]);
});
test("production or weighing records prevent planned deletion", async () => {
  for (const options of [{ started: true }, { progress: [{ status: "DONE", note: null }] }]) {
    const state = harness(options);
    await assert.rejects(removePlannedComponent(row), /기록/);
    assert.equal(
      state.calls.some((q) => q.action === "delete"),
      false,
    );
  }
});
test("tasks referenced by remaining blocks are preserved", async () => {
  const state = harness({ shared: true });
  await removePlannedComponent(row);
  assert.equal(
    state.calls.some((q) => q.table === "work_session_tasks" && q.action === "delete"),
    false,
  );
});
test("foreign owner and concurrent modifications cannot delete other data", async () => {
  let state = harness();
  await assert.rejects(removePlannedComponent({ ...row, user_id: "foreign" }), /접근/);
  assert.equal(state.calls.length, 0);
  state = harness({ conflict: true });
  await assert.rejects(removePlannedComponent(row), /다른 화면/);
  assert.equal(
    state.calls.some((q) => q.table === "work_session_tasks" && q.action === "delete"),
    false,
  );
  assert.equal(state.synced, null);
});
