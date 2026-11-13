import { useEffect, useMemo, useState } from "react";
import { fetchPlannerTasks } from "@/lib/mindmap-planner";

/** 연결된 플래너 작업의 완료 여부 — 열 때·1분마다·창 복귀/변경 이벤트 때 플래너에서 다시 읽는다. */
export function useTaskDone(taskIds: string[], enabled: boolean) {
  const key = useMemo(() => [...new Set(taskIds)].sort().join(","), [taskIds]);
  const [done, setDone] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (!enabled || !key) {
      setDone(new Map());
      return;
    }
    let alive = true;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      fetchPlannerTasks(key.split(","))
        .then((ts) => alive && setDone(new Map(ts.map((t) => [t.id, t.completed]))))
        .catch(() => undefined);
    };
    run();
    const t = setInterval(run, 60_000);
    window.addEventListener("mm-tasks-changed", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("mm-tasks-changed", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, key]);
  return done;
}

export const progressText = (ids: string[] | undefined, done: Map<string, boolean>) => {
  const known = (ids ?? []).filter((id) => done.has(id));
  if (known.length === 0) return undefined;
  return `${known.filter((id) => done.get(id)).length}/${known.length}`;
};
