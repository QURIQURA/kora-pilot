import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pullPlannerDeliveries } from "@/lib/order-planner-sync";
import { invalidateProductionSync } from "@/lib/production-sync";

/**
 * 플래너(WANN)에서 Delivery를 체크하면 PILOT 오더를 COMPLETED로 넘긴다(2026-11-09).
 * WANN은 별도 프로젝트라 푸시할 수 없어서, 앱을 열 때 / 창으로 돌아올 때 / 1분마다 확인한다.
 */
export function usePlannerDeliveryPull() {
  const client = useQueryClient();
  useEffect(() => {
    let running = false;
    const run = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const n = await pullPlannerDeliveries();
        if (n > 0) {
          await client.invalidateQueries({ queryKey: ["orders"] });
          await invalidateProductionSync(client);
        }
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 60_000);
    const onVisible = () => void run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client]);
}
