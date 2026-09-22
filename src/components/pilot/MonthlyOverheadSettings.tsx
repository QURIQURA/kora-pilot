import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, pilotSettingsQuery } from "@/lib/queries";
import { overheadPerUnit, fmtCurrency } from "@/lib/cost";
import { Field, SectionCard, inputClass } from "./ui";

/**
 * SETTINGS — 월 고정비(임대료/보험 등 OVERHEAD) 총액과 월 예상 케익(제품 단위) 개수를 입력하면
 * 케익 1개당 배분액을 자동 계산해 보여준다. 이 배분액은 모든 Product의 FULL PRODUCTION COST에
 * 공통으로 더해진다(개별 배정 불필요).
 * "배치" 대신 "케익 개수" 기준(2026-09-23, 사용자 확정) — 케익 하나에 들어가는 Component 개수만큼
 * 배치 횟수가 무한히 배수될 수 있어 고정 기준으로 삼기 애매하다는 판단.
 */
export function MonthlyOverheadSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());

  const upsert = useMutation({
    mutationFn: async (patch: { monthly_overhead?: number; monthly_unit_count?: number }) => {
      const user_id = await currentUserId();
      const current = settings.data;
      const { error } = await supabase.from("pilot_settings").upsert({
        user_id,
        monthly_overhead: patch.monthly_overhead ?? current?.monthly_overhead ?? 0,
        monthly_unit_count: patch.monthly_unit_count ?? current?.monthly_unit_count ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pilot_settings"] }),
  });

  const data = settings.data;
  const perUnit = overheadPerUnit(
    data ? { monthly_overhead: data.monthly_overhead, monthly_unit_count: data.monthly_unit_count } : null,
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
        <Field label="월 예상 케익(제품) 개수">
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="0"
            className={inputClass}
            defaultValue={data?.monthly_unit_count ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim() ? Number(e.target.value) : 0;
              if (next !== (data?.monthly_unit_count ?? 0))
                upsert.mutate({ monthly_unit_count: next });
            }}
          />
        </Field>
      </div>
      <p className="mt-3 font-mono text-xs uppercase text-muted-foreground">
        {perUnit != null
          ? `케익 1개당 배분액: ${fmtCurrency(perUnit)}`
          : "월 예상 케익 개수를 입력하면 개당 배분액이 계산됩니다."}
      </p>
    </SectionCard>
  );
}
