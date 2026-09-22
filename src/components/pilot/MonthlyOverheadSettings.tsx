import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, pilotSettingsQuery } from "@/lib/queries";
import { overheadPerBatch, fmtCurrency } from "@/lib/cost";
import { Field, SectionCard, inputClass } from "./ui";

/**
 * SETTINGS — 월 고정비(임대료/보험 등 OVERHEAD) 총액과 월 예상 배치 수를 입력하면
 * 배치 1회당 배분액을 자동 계산해 보여준다. 이 배분액은 모든 Component의 PRODUCTION COST에
 * 공통으로 더해진다(개별 배정 불필요).
 */
export function MonthlyOverheadSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());

  const upsert = useMutation({
    mutationFn: async (patch: { monthly_overhead?: number; monthly_batch_count?: number }) => {
      const user_id = await currentUserId();
      const current = settings.data;
      const { error } = await supabase.from("pilot_settings").upsert({
        user_id,
        monthly_overhead: patch.monthly_overhead ?? current?.monthly_overhead ?? 0,
        monthly_batch_count: patch.monthly_batch_count ?? current?.monthly_batch_count ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pilot_settings"] }),
  });

  const data = settings.data;
  const perBatch = overheadPerBatch(
    data ? { monthly_overhead: data.monthly_overhead, monthly_batch_count: data.monthly_batch_count } : null,
  );

  return (
    <SectionCard title="MONTHLY OVERHEAD">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="월 고정비 총액 (AUD) — 임대료/보험/구독료 등">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className={inputClass}
            defaultValue={data?.monthly_overhead ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim() ? Number(e.target.value) : 0;
              if (next !== (data?.monthly_overhead ?? 0))
                upsert.mutate({ monthly_overhead: next });
            }}
          />
        </Field>
        <Field label="월 예상 배치 수">
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            className={inputClass}
            defaultValue={data?.monthly_batch_count ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim() ? Number(e.target.value) : 0;
              if (next !== (data?.monthly_batch_count ?? 0))
                upsert.mutate({ monthly_batch_count: next });
            }}
          />
        </Field>
      </div>
      <p className="mt-3 font-mono text-xs uppercase text-muted-foreground">
        {perBatch != null
          ? `배치 1회당 배분액: ${fmtCurrency(perBatch)}`
          : "월 예상 배치 수를 입력하면 배치당 배분액이 계산됩니다."}
      </p>
    </SectionCard>
  );
}
