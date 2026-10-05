import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pilotSettingsQuery } from "@/lib/queries";
import { buttonClass } from "./ui";

/**
 * 구글 캘린더 "다른 캘린더 구독"용 읽기전용 .ics 피드 URL.
 * OAuth 연동 없이, 랜덤 토큰을 쿼리 파라미터로 넣은 구독 링크만 발급한다 — 구글 캘린더 쪽에서는
 * 절대 수정이 안 되고(읽기 전용), 수정은 항상 Pilot에서 한다.
 */
export function OrdersCalendarFeedSection() {
  const queryClient = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());
  const [copied, setCopied] = useState(false);

  const regenerate = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await supabase
        .from("pilot_settings")
        .update({ ics_feed_token: token })
        .eq("user_id", settings.data?.user_id ?? "");
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pilot_settings"] });
    },
  });

  const projectUrl = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ?? "";
  const token = settings.data?.ics_feed_token;
  const feedUrl = projectUrl && token ? `${projectUrl}/functions/v1/orders-ics?token=${token}` : null;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        아래 링크를 구글 캘린더 → "다른 캘린더 추가" → "URL로 추가"에 붙여넣으면 ORDERS의 픽업/행사
        날짜가 구글 캘린더에 보입니다. 읽기 전용이라 구글 캘린더 쪽에서는 수정이 안 되고, 수정은
        항상 여기 Pilot에서 하세요. 구글이 몇 시간 간격으로 다시 불러오므로 실시간 반영은 아닙니다.
      </p>
      {feedUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all border border-border bg-background px-2 py-1 font-mono text-xs">{feedUrl}</code>
          <button
            type="button"
            className={buttonClass}
            onClick={async () => {
              await navigator.clipboard.writeText(feedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "COPIED" : "COPY LINK"}
          </button>
        </div>
      ) : (
        <p className="font-mono text-xs text-muted-foreground">LOADING…</p>
      )}
      <button type="button" className={buttonClass} disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
        토큰 재발급 (기존 링크 무효화)
      </button>
      {regenerate.isError && (
        <p className="font-mono text-xs uppercase text-destructive">{(regenerate.error as Error).message}</p>
      )}
    </div>
  );
}
