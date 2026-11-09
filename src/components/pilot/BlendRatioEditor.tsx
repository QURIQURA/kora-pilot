import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adjustBlendPercentages, type BlendSource } from "@/lib/component-blend";
import { fmtNumber } from "@/lib/formula";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";

const colors = ["#262626", "#a3a3a3", "#525252", "#d4d4d4"];

export function BlendRatioEditor({
  rows,
  versionId,
  updatedAt,
  multiplier,
  disabled,
  onCancel,
  onCreated,
}: {
  rows: BlendSource[];
  versionId: string;
  updatedAt: string;
  multiplier: number;
  disabled: boolean;
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const total = rows.reduce((sum, r) => sum + r.amount_g, 0);
  const original = rows.map((r) => (r.amount_g / total) * 100);
  const [values, setValues] = useState(original);
  const [inputs, setInputs] = useState(original.map((v) => String(Number(v.toFixed(4)))));
  const [reason, setReason] = useState("");
  const valid = inputs.every(
    (v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100,
  );
  const changed = values.some((v, i) => Math.abs(v - original[i]!) > 1e-8);
  const bounds = values
    .slice(0, -1)
    .map((_, i) => values.slice(0, i + 1).reduce((s, v) => s + v, 0));
  const applyValues = (next: number[]) => {
    setValues(next);
    setInputs(next.map((v) => String(Number(v.toFixed(4)))));
  };
  const save = useMutation({
    mutationFn: async () => {
      if (disabled || !valid || !changed) throw new Error("변경할 비율을 확인하세요");
      const { data, error } = await supabase.rpc("revise_component_blend", {
        p_version_id: versionId,
        p_expected_updated_at: updatedAt,
        p_percentages: values,
        ...(reason.trim() ? { p_reason: reason.trim() } : {}),
      });
      if (error) throw error;
      const result = data as { version_id: string };
      return result.version_id;
    },
    onSuccess: onCreated,
  });
  const stops = values
    .map((_, i) => {
      const start = i === 0 ? 0 : bounds[i - 1];
      const end = i === values.length - 1 ? 100 : bounds[i];
      return `${colors[i % colors.length]} ${start}% ${end}%`;
    })
    .join(", ");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">총 {fmtNumber(total, 2)}g 유지 · 합계 100%</p>
      <Slider.Root
        className="relative flex h-11 w-full touch-none select-none items-center"
        min={0}
        max={100}
        step={0.1}
        value={bounds}
        disabled={save.isPending}
        onValueChange={(next) => {
          const points = [0, ...next, 100];
          applyValues(values.map((_, i) => Math.max(0, points[i + 1]! - points[i]!)));
        }}
      >
        <Slider.Track
          className="relative h-3 w-full grow"
          style={{ background: `linear-gradient(to right, ${stops})` }}
        />
        {bounds.map((_, i) => (
          <Slider.Thumb
            key={rows[i]!.version_id}
            aria-label={`${rows[i]!.component_name} 비율 경계`}
            className="block h-6 w-4 border border-foreground bg-background shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        ))}
      </Slider.Root>
      {rows.map((row, i) => (
        <div key={row.version_id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            <span
              className="mr-2 inline-block h-2 w-2"
              style={{ background: colors[i % colors.length] }}
            />
            {row.component_name} · V{row.version_number}
          </span>
          <div className="flex items-center gap-2 font-mono text-sm">
            <input
              aria-label={`${row.component_name} 비율 (%)`}
              type="number"
              min="0"
              max="100"
              step="any"
              className={`${inputClass} !w-28`}
              value={inputs[i]}
              disabled={save.isPending}
              onChange={(e) => {
                const text = e.target.value;
                const number = Number(text);
                if (text.trim() !== "" && Number.isFinite(number) && number >= 0 && number <= 100) {
                  const next = adjustBlendPercentages(values, i, number);
                  setValues(next);
                  setInputs(next.map((v, j) => (j === i ? text : String(Number(v.toFixed(4))))));
                } else setInputs((all) => all.map((v, j) => (j === i ? text : v)));
              }}
            />
            <span>% · {fmtNumber(((total * values[i]!) / 100) * multiplier, 2)}g</span>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        원재료는 저장 당시 원본 배합으로 다시 계산됩니다. 아래 표를 직접 수정했던 경우 그 수정은
        기존 버전에 남습니다. 새 버전은 DRAFT로 저장됩니다.
      </p>
      <input
        aria-label="비율 변경 메모"
        className={inputClass}
        placeholder="변경 메모 (선택)"
        value={reason}
        disabled={save.isPending}
        onChange={(e) => setReason(e.target.value)}
      />
      {disabled && (
        <p role="alert" className="text-sm text-destructive">
          페이지 변경 사항을 먼저 SAVE하거나 되돌리세요.
        </p>
      )}
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          비율은 0–100%로 입력하세요.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {(save.error as Error).message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={disabled || !valid || !changed || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "저장 중…" : "새 버전으로 저장"}
        </button>
        <button type="button" className={buttonClass} disabled={save.isPending} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
