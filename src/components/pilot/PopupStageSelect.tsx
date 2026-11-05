import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pilotSettingsQuery, type OrderListRow } from "@/lib/queries";
import { readPopupPlan } from "@/lib/popup";
import { popupStageId, readPopupStages } from "@/lib/popup-workflow";
import { invalidateProductionSync } from "@/lib/production-sync";
import { selectClass } from "./ui";
export function PopupStagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const settings = useQuery(pilotSettingsQuery());
  const stages = readPopupStages(settings.data?.popup_workflow);
  return (
    <select
      aria-label="SNL 팝업 진행 단계"
      className={`${selectClass} !w-auto`}
      value={value || stages[0]?.id || ""}
      disabled={disabled || settings.isLoading || settings.isError}
      onChange={(e) => onChange(e.target.value)}
    >
      {value && !stages.some((s) => s.id === value) && (
        <option value={value}>{value} (저장된 단계)</option>
      )}
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
export function PopupOrderStageSelect({ order }: { order: OrderListRow }) {
  const client = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());
  const stages = readPopupStages(settings.data?.popup_workflow);
  const save = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("save_popup_stage", {
        p_order_id: order.id,
        p_stage_id: id,
        p_expected_updated_at: order.updated_at,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateProductionSync(client),
  });
  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      <PopupStagePicker
        value={popupStageId(readPopupPlan(order.popup_plan), order.status, stages)}
        onChange={(id) => save.mutate(id)}
        disabled={save.isPending}
      />
      {save.isError && (
        <p role="alert" className="text-xs text-destructive">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
