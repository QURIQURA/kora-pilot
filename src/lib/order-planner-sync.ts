import { supabase } from "@/integrations/supabase/client";

/**
 * 오더 완료 ↔ 플래너 Delivery 양방향 동기화(2026-11-09). 서버는 edge function
 * sync-work-session-to-planner(WANN 서비스 키 보유)가 처리한다.
 * - 오더 상태가 COMPLETED로 바뀌면 Delivery 체크, COMPLETED에서 되돌리면 체크 해제.
 * - 플래너에서 Delivery를 체크하면 pullPlannerDeliveries()가 그 오더를 COMPLETED로 넘긴다.
 * 실패 사유 문자열 또는 null.
 */
export async function syncOrderDeliveryToPlanner(
  orderId: string,
  completed: boolean,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
      body: { order_delivery: { order_id: orderId, completed } },
    });
    if (error) return error.message;
    if (data && typeof data === "object" && "error" in data && data.error)
      return String((data as { error: unknown }).error);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 플래너에서 Delivery가 체크된 미완료 오더를 COMPLETED로 넘기고, 넘긴 오더 수를 돌려준다(실패 시 0). */
export async function pullPlannerDeliveries(): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke("sync-work-session-to-planner", {
      body: { pull_planner_deliveries: true },
    });
    if (error || !data || typeof data !== "object") return 0;
    return Number((data as { completed_orders?: number }).completed_orders ?? 0);
  } catch {
    return 0;
  }
}
