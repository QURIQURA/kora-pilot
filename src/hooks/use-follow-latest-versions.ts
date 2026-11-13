import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { followLatestVersions } from "@/lib/follow-latest-versions";
import { invalidateProductionSync } from "@/lib/production-sync";

/** 앱을 열 때·탭으로 돌아올 때·2분마다, 진행 중 오더/제품 구성이 낡은 레시피 버전에 머물러 있으면 최신 버전으로 옮긴다. */
export function useFollowLatestVersions(userId: string) {
  const client = useQueryClient();
  useEffect(() => {
    let alive = true;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const n = await followLatestVersions();
        if (alive && n > 0) {
          await invalidateProductionSync(client);
          await client.invalidateQueries({ queryKey: ["product_components"] });
        }
      } catch (e) {
        console.error("최신 버전 따라가기 실패:", e);
      } finally {
        running = false;
      }
    };
    void run();
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => void run(), 120_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [client, userId]);
}
