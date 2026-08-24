import { useState } from "react";
import {
  BASIS_ORDER,
  parseBasisOverrides,
  type BasisInfo,
  type BasisKey,
  type BasisOverrides,
} from "@/lib/formula-calc";
import { fmtNumber, parseNumber } from "@/lib/formula";
import type { VersionIngredientRow } from "@/lib/queries";
import { CollapsibleSection, inputClass } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

/**
 * BASIS 패널 — 기준량 자동 집계 표시 + 체크 조정.
 * 집계값은 저장되지 않고, 사용자 조정(include/exclude)과 bath 입력만 저장된다.
 */
export function BasisPanel({
  bases,
  rows,
  overrides,
  bathWaterG,
  locked,
  onOverridesChange,
  onBathChange,
}: {
  bases: Record<BasisKey, BasisInfo>;
  rows: VersionIngredientRow[];
  overrides: BasisOverrides;
  bathWaterG: number | null;
  locked: boolean;
  onOverridesChange: (next: BasisOverrides) => void;
  onBathChange: (grams: number | null) => void;
}) {
  const [openKey, setOpenKey] = useState<BasisKey | null>(null);

  const toggleMember = (key: BasisKey, ingredientId: string, autoMember: boolean, included: boolean) => {
    const next = parseBasisOverrides(JSON.parse(JSON.stringify(overrides)));
    const entry = { include: [...(next[key]?.include ?? [])], exclude: [...(next[key]?.exclude ?? [])] };
    if (included) {
      entry.exclude = entry.exclude.filter((id) => id !== ingredientId);
      if (!autoMember && !entry.include.includes(ingredientId)) entry.include.push(ingredientId);
    } else {
      entry.include = entry.include.filter((id) => id !== ingredientId);
      if (autoMember && !entry.exclude.includes(ingredientId)) entry.exclude.push(ingredientId);
    }
    next[key] = entry;
    onOverridesChange(next);
  };

  return (
    <CollapsibleSection title="BASIS — 기준량 (자동 집계)" defaultOpen>
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {BASIS_ORDER.map((key) => {
          const basis = bases[key];
          const isOpen = openKey === key;
          return (
            <button
              key={key}
              type="button"
              disabled={key === "bath" ? locked : !basis.adjustable || basis.members.length === 0}
              onClick={() => setOpenKey(isOpen ? null : key)}
              className={cn(
                "flex min-h-[48px] flex-col items-start justify-center bg-card px-3 py-2 text-left",
                basis.adjustable && basis.members.length > 0 && "hover:bg-secondary",
                isOpen && "bg-secondary"
              )}
            >
              <span className="label-caps text-[10px] text-muted-foreground">
                {basis.label}
                {basis.adjustable && basis.members.length > 0 && (isOpen ? " −" : " +")}
              </span>
              {key === "bath" ? (
                <span className="font-mono text-sm tabular-nums">
                  {basis.grams != null ? `${fmtNumber(basis.grams)}g` : "직접 입력"}
                </span>
              ) : (
                <span className="font-mono text-sm tabular-nums">
                  {basis.approx && "≈"}
                  {fmtNumber(basis.grams ?? 0)}g
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* BATH 직접 입력 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="label-caps text-xs text-muted-foreground">
          BATH — 침전조 물 양 (자동 집계 불가)
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          className={cn(inputClass, "w-32 font-mono tabular-nums")}
          disabled={locked}
          defaultValue={bathWaterG ?? ""}
          key={`bath-${bathWaterG ?? "x"}`}
          placeholder="g"
          onBlur={(e) => {
            const next = e.target.value ? parseNumber(e.target.value) : null;
            if (next !== bathWaterG) onBathChange(next);
          }}
        />
      </div>

      {/* 선택된 기준의 구성 재료 체크 조정 */}
      {openKey && bases[openKey].adjustable && (
        <div className="mt-3 border border-border">
          <p className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase text-muted-foreground">
            {bases[openKey].label} 구성 재료 — 체크 해제/추가 시 기준량 재집계
          </p>
          <ul className="divide-y divide-border">
            {bases[openKey].members.map((member) => (
              <li key={member.ingredientId} className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  className="size-5 accent-foreground"
                  checked
                  disabled={locked}
                  onChange={() => toggleMember(openKey, member.ingredientId, member.auto, false)}
                />
                <span className="flex-1 text-sm">{member.name}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {member.approx && "≈"}
                  {fmtNumber(member.grams)}g
                </span>
              </li>
            ))}
            {/* 제외됐거나 미포함된 재료 — 체크하면 include */}
            {rows
              .filter(
                (row) =>
                  row.ingredients &&
                  Number(row.amount) > 0 &&
                  !bases[openKey].members.some((m) => m.ingredientId === row.ingredient_id)
              )
              .map((row) => (
                <li key={row.ingredient_id} className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-5 accent-foreground"
                    checked={false}
                    disabled={locked}
                    onChange={() => toggleMember(openKey, row.ingredient_id, false, true)}
                  />
                  <span className="flex-1 text-sm">
                    {row.ingredients!.name}
                    {row.ingredients!.name_en ? ` (${row.ingredients!.name_en})` : ""}
                  </span>
                  <span className="font-mono text-xs uppercase">제외됨</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </CollapsibleSection>
  );
}
