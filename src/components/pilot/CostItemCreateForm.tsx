import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, type CostItemCategory } from "@/lib/queries";
import { Field, buttonClass, inputClass, primaryButtonClass, selectClass } from "./ui";

const CATEGORY_OPTIONS: { value: CostItemCategory; label: string }[] = [
  { value: "UTILITY", label: "UTILITY — 개당 전기/수도/가스 등" },
  { value: "CONSUMABLE", label: "CONSUMABLE — 개당 소모품" },
  { value: "PACKAGING", label: "PACKAGING — 개당 상자/스티커 등" },
  { value: "OVERHEAD", label: "OVERHEAD — 월 고정비(참고용 기록)" },
];

/**
 * 공용 COST ITEM 생성 폼.
 * SETTINGS의 COST ITEMS 섹션에서 사용. defaultCategory로 시작 카테고리를 고정할 수 있다.
 */
export function CostItemCreateForm({
  defaultCategory,
  onCreated,
  onCancel,
}: {
  defaultCategory?: CostItemCategory;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<CostItemCategory>(defaultCategory ?? "UTILITY");
  const [name, setName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("cost_items")
        .insert({
          user_id,
          category,
          name: name.trim(),
          unit_cost: unitCost.trim() ? Number(unitCost) : 0,
          unit_label: unitLabel.trim() || null,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["cost_items"] });
      setName("");
      setUnitCost("");
      setUnitLabel("");
      setNotes("");
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
      <Field label="CATEGORY">
        <select
          className={selectClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as CostItemCategory)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          required
          placeholder="예: 케이크 박스 8인치"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="UNIT COST (AUD)">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className={inputClass}
          placeholder="예: 2.50"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
        />
      </Field>
      <Field label="UNIT LABEL (OPTIONAL)">
        <input
          className={inputClass}
          placeholder="예: 개, 회, kWh"
          value={unitLabel}
          onChange={(e) => setUnitLabel(e.target.value)}
        />
      </Field>
      <Field label="NOTES (OPTIONAL)">
        <textarea
          rows={2}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {create.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
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
