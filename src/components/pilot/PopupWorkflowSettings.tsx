import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { pilotSettingsQuery, currentUserId } from "@/lib/queries";
import { readPopupStages, validatePopupStages, type PopupStage } from "@/lib/popup-workflow";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";
export function PopupWorkflowSettings() {
  const settings = useQuery(pilotSettingsQuery());
  const client = useQueryClient();
  const [stages, setStages] = useState<PopupStage[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const baseline = useRef<{ stages: PopupStage[]; stamp: string | null } | null>(null);
  useEffect(() => {
    if (settings.isLoading || settings.isError) return;
    if (!baseline.current || JSON.stringify(stages) === JSON.stringify(baseline.current.stages)) {
      const next = readPopupStages(settings.data?.popup_workflow);
      baseline.current = { stages: next, stamp: settings.data?.updated_at ?? null };
      setStages(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data?.updated_at, settings.isLoading, settings.isError]);
  const dirty = !!stages && JSON.stringify(stages) !== JSON.stringify(baseline.current?.stages);
  const conflict =
    dirty && (baseline.current?.stamp ?? null) !== (settings.data?.updated_at ?? null);
  const validation = stages ? validatePopupStages(stages) : null;
  const save = useMutation({
    mutationFn: async () => {
      if (!stages || validation) throw new Error(validation ?? "단계를 입력하세요");
      if (conflict) throw new Error("다른 화면에서 설정이 변경되었습니다. 최신 값을 불러오세요");
      const uid = await currentUserId();
      const payload = stages.map((s) => ({ ...s, label: s.label.trim() }));
      const request = baseline.current?.stamp
        ? supabase
            .from("pilot_settings")
            .update({ popup_workflow: payload as unknown as Json })
            .eq("user_id", uid)
            .eq("updated_at", baseline.current.stamp)
        : supabase
            .from("pilot_settings")
            .insert({ user_id: uid, popup_workflow: payload as unknown as Json });
      const { data, error } = await request.select("updated_at").single();
      if (error) throw error;
      return { stages: payload, stamp: data.updated_at };
    },
    onSuccess: async (result) => {
      baseline.current = result;
      setStages(result.stages);
      await Promise.all(
        ["pilot_settings", "orders", "dashboard_components"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  if (settings.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        진행 단계 설정을 불러오지 못했습니다.
      </p>
    );
  if (!stages) return <p className="text-sm">불러오는 중…</p>;
  const move = (i: number, d: number) => {
    const target = i + d;
    if (target < 0 || target >= stages.length - 1) return;
    const next = [...stages];
    [next[i], next[target]] = [next[target]!, next[i]!];
    setStages(next);
  };
  return (
    <fieldset disabled={save.isPending} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Saturday Night Live 전용 진행 단계입니다. 케이크 주문 단계와 별도로 추가·이름·순서를
        관리합니다. 새 팝업은 첫 단계로 시작하며, 번호는 SND-001부터 순서대로 부여됩니다.
      </p>
      {stages.map((stage, i) => (
        <div key={stage.id} className="flex items-center gap-1">
          <input
            aria-label={`${stage.label || "진행 단계"} 이름`}
            className={inputClass}
            value={stage.label}
            maxLength={80}
            onChange={(e) =>
              setStages(
                stages.map((s) => (s.id === stage.id ? { ...s, label: e.target.value } : s)),
              )
            }
          />
          {stage.id === "COMPLETED" ? (
            <span className="shrink-0 px-2 text-xs text-muted-foreground">완료 단계</span>
          ) : (
            <>
              <button
                type="button"
                className={buttonClass}
                aria-label={`${stage.label} 위로`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-label={`${stage.label} 아래로`}
                disabled={i === stages.length - 2}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-label={`${stage.label} 단계 삭제`}
                disabled={stages.length <= 2}
                onClick={() => setStages(stages.filter((s) => s.id !== stage.id))}
              >
                삭제
              </button>
            </>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <input
          aria-label="새 팝업 단계 이름"
          className={inputClass}
          placeholder="새 진행 단계"
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={stages.length >= 30}
          onClick={() => {
            const label = name.trim();
            if (!label) {
              setError("단계 이름을 입력하세요");
              return;
            }
            if (stages.some((s) => s.label.trim().toLowerCase() === label.toLowerCase())) {
              setError("같은 이름의 단계가 있습니다");
              return;
            }
            setStages([
              ...stages.slice(0, -1),
              { id: crypto.randomUUID(), label },
              stages[stages.length - 1]!,
            ]);
            setName("");
          }}
        >
          + 단계
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        사용 중인 단계는 팝업을 다른 단계로 옮긴 뒤 삭제할 수 있습니다. 마지막 완료 단계는 이름을
        바꿀 수 있으며, 완료된 팝업은 생산 이력으로 분류됩니다.
      </p>
      {(error || validation || save.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {error || validation || save.error?.message}
        </p>
      )}
      {conflict && (
        <p role="alert" className="text-sm text-destructive">
          설정이 변경되었습니다.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const next = readPopupStages(settings.data?.popup_workflow);
              baseline.current = { stages: next, stamp: settings.data?.updated_at ?? null };
              setStages(next);
            }}
          >
            최신 값 불러오기 (미저장 변경 취소)
          </button>
        </p>
      )}
      <button
        type="button"
        className={primaryButtonClass}
        disabled={!dirty || !!validation || conflict}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "저장 중…" : "SAVE POPUP STAGES"}
      </button>
    </fieldset>
  );
}
