import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProductionSync } from "@/lib/production-sync";

/** One user-scoped subscription for Order, Work Session and Production, including other tabs. */
export function useProductionSync(userId: string) {
  const client = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void invalidateProductionSync(client);
      }, 100);
    };
    const bus =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`pilot:production:${userId}`)
        : null;
    if (bus) bus.onmessage = refresh;
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        refresh();
        bus?.postMessage("changed");
      }
    });
    const channel = supabase.channel(`pilot-production-${userId}`);
    for (const table of [
      "orders",
      "work_sessions",
      "work_session_formula_versions",
      "formula_versions",
      "formula_version_ingredients",
      "work_session_tasks",
      "work_blocks",
      "order_production_sync_log",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        refresh,
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
    });
    // Also recover changes after a disconnected/sleeping tab resumes.
    window.addEventListener("focus", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      unsubscribe();
      bus?.close();
      void supabase.removeChannel(channel);
    };
  }, [client, userId]);
}
