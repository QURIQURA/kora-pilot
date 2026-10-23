import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import {
  cmInputToMm,
  mmToCmInput,
  mouldFootprintCm2,
  MOULD_REFERENCE_PRESETS,
} from "@/lib/mould-dimensions";
import { Field, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

/** Shared by SETTINGS and + NEW MOULD. Numeric dimensions are stored at creation. */
export function MouldCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shapeSize, setShapeSize] = useState("");
  const [shape, setShape] = useState<"ROUND" | "RECTANGLE">("ROUND");
  const [diameter, setDiameter] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");
  const [referenceWeight, setReferenceWeight] = useState("");
  const [notes, setNotes] = useState("");

  const dimensions = () => {
    const diameter_mm = shape === "ROUND" ? cmInputToMm(diameter) : null;
    return {
      diameter_mm,
      width_mm: shape === "ROUND" ? diameter_mm : cmInputToMm(width),
      length_mm: shape === "ROUND" ? diameter_mm : cmInputToMm(length),
      height_mm: cmInputToMm(height),
    };
  };
  let area: number | null = null;
  try {
    area = mouldFootprintCm2(dimensions());
  } catch {
    /* Validation is shown on submit. */
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("몰드 이름을 입력하세요.");
      const weight = referenceWeight.trim() ? Number(referenceWeight) : null;
      if (weight != null && (!Number.isFinite(weight) || weight <= 0))
        throw new Error("기준 반죽량은 0보다 큰 g 숫자로 입력하세요.");
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("moulds")
        .insert({
          user_id,
          name: name.trim(),
          shape_size: shapeSize.trim() || null,
          ...dimensions(),
          reference_weight_g: weight,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["moulds"] });
      await queryClient.invalidateQueries({ queryKey: ["capacities"] });
      setName("");
      setShapeSize("");
      setReferenceWeight("");
      setNotes("");
      setDiameter("");
      setWidth("");
      setLength("");
      setHeight("");
      onCreated?.(id);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Field label="참고 규격 불러오기 (선택)">
        <select
          className={selectClass}
          value=""
          onChange={(e) => {
            const preset = MOULD_REFERENCE_PRESETS.find((p) => p.key === e.target.value);
            if (!preset) return;
            setName(preset.name);
            setShape(preset.shape === "ROUND" ? "ROUND" : "RECTANGLE");
            setDiameter(mmToCmInput(preset.diameter_mm));
            setWidth(mmToCmInput(preset.width_mm));
            setLength(mmToCmInput(preset.length_mm));
            setHeight(mmToCmInput(preset.height_mm));
            setShapeSize(
              preset.shape === "ROUND"
                ? `ROUND · Ø${preset.width_mm / 10} × H10cm`
                : `SQUARE · ${preset.width_mm / 10} × ${preset.length_mm / 10} × H10cm`,
            );
            setReferenceWeight("");
            setNotes(preset.notes);
          }}
        >
          <option value="">— 직접 입력 / 기본 6종 선택 —</option>
          {MOULD_REFERENCE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-muted-foreground">
        6/8/10인치≈15/20/25cm의 명목 참고값입니다. 높이 10cm·바닥분리형은 지정 조건이며 보유 몰드의
        실측값이 아닙니다. 중앙 기둥이 있으면 아래 면적은 외곽 면적입니다. 반죽량은 레시피별로
        확인한 뒤 입력하세요.
      </p>
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          required
          placeholder="시폰틀 15cm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="형태">
        <select
          className={selectClass}
          value={shape}
          onChange={(e) => setShape(e.target.value as "ROUND" | "RECTANGLE")}
        >
          <option value="ROUND">원형</option>
          <option value="RECTANGLE">정사각 / 직사각</option>
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        {shape === "ROUND" ? (
          <Field label="내부 지름 (cm)">
            <input
              type="number"
              step="any"
              min="0.01"
              className={inputClass}
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
            />
          </Field>
        ) : (
          <>
            <Field label="내부 가로 (cm)">
              <input
                type="number"
                step="any"
                min="0.01"
                className={inputClass}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field label="내부 세로 (cm)">
              <input
                type="number"
                step="any"
                min="0.01"
                className={inputClass}
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="도구 높이 (cm)">
          <input
            type="number"
            step="any"
            min="0.01"
            className={inputClass}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </Field>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        외곽 바닥 면적: {area == null ? "미입력" : `${area.toFixed(1)} cm²`} · 중앙 기둥·테이퍼
        미반영
      </p>
      <Field label="SHAPE / SIZE 메모 (선택)">
        <input
          className={inputClass}
          placeholder="ROUND · Ø15 × H10cm"
          value={shapeSize}
          onChange={(e) => setShapeSize(e.target.value)}
        />
      </Field>
      <Field label="기준 반죽량 g (선택 — PRODUCTION 배수 계산)">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0.01"
          className={inputClass}
          placeholder="미측정이면 비워두세요"
          value={referenceWeight}
          onChange={(e) => setReferenceWeight(e.target.value)}
        />
      </Field>
      <Field label="NOTES (선택)">
        <textarea
          rows={3}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {create.isError && (
        <p role="alert" className="font-mono text-xs text-destructive">
          {(create.error as Error).message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          CREATE
        </button>
        {onCancel && (
          <button type="button" className={buttonClass} onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>
    </form>
  );
}
