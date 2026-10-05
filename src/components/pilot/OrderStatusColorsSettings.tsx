import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  pilotSettingsQuery,
  orderStatusLabel,
  orderStatusColor,
  ORDER_STATUSES,
} from "@/lib/queries";

/**
 * SETTINGS — ORDER STATUS COLORS (2026-10-06 사용자 요청)
 * Status 자체와 색상을 분리 — 색상은 하드코딩하지 않고 pilot_settings.order_status_colors(jsonb)에
 * persist하며, ORDERS LIST / ORDER DETAIL 등 모든 화면이 이 값을 공통으로 조회한다.
 * 색상을 지정하지 않은 단계는 queries.ts의 DEFAULT_ORDER_STATUS_COLORS를 그대로 보여준다.
 */
export function OrderStatusColorsSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());
  const colors = (settings.data?.order_status_colors as Record<string, string> | null) ?? null;

  const setColor = useMutation({
    mutationFn: async ({ status, color }: { status: string; color: string }) => {
      const user_id = await currentUserId();
      const next = { ...(colors ?? {}), [status]: color };
      const { error } = await supabase.from("pilot_settings").upsert({
        user_id,
        order_status_colors: next,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pilot_settings"] }),
  });

  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground">
        각 단계의 색상을 바꾸면 ORDERS LIST와 ORDER DETAIL에 바로 동일하게 적용됩니다. 설정은
        저장되어 새로고침/재로그인 후에도 유지됩니다.
      </p>
      <ul className="divide-y divide-border border border-border bg-card">
        {ORDER_STATUSES.map((s) => (
          <li key={s} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="label-caps text-xs text-foreground">{orderStatusLabel(s)}</span>
            <input
              type="color"
              className="h-7 w-10 cursor-pointer border border-input bg-background p-0.5"
              value={orderStatusColor(colors, s)}
              onChange={(e) => setColor.mutate({ status: s, color: e.target.value })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
