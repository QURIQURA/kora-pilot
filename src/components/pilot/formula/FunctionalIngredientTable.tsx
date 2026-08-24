import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  functionalRowCalc,
  gelatinConvert,
  scaledAmount,
  type BasisInfo,
  type BasisKey,
} from "@/lib/formula-calc";
import { UNITS, fmtNumber, parseNumber, toGrams } from "@/lib/formula";
import { ingredientDisplayName } from "@/lib/pilot";
import type { VersionIngredientRow } from "@/lib/queries";
import { RangeBar } from "@/components/pilot/RangeBar";
import { cn } from "@/lib/utils";

export interface FunctionalRowPatch {
  amount?: number;
  unit?: string;
  note?: string | null;
  amount_source?: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * FUNCTIONAL INGREDIENTS 구역.
 * 저장되는 것은 사용자가 확정한 amount + amount_source뿐.
 * RATE·권장 범위·제안값은 볼 때마다 계산되는 표시값이다.
 */
export function FunctionalIngredientTable({
  rows,
  bases,
  locked,
  batch,
  onPatch,
  onRemove,
}: {
  rows: VersionIngredientRow[];
  bases: Record<BasisKey, BasisInfo>;
  locked: boolean;
  batch: number;
  onPatch: (id: string, patch: FunctionalRowPatch) => void;
  onRemove: (id: string) => void;
}) {
  const calcs = rows.map((row) => functionalRowCalc(row, bases));
  const outOfRange = rows
    .map((row, i) => ({ row, calc: calcs[i]! }))
    .filter(({ calc }) => calc.status === "low" || calc.status === "high");
  const suggestedCount = rows.filter((r) => r.amount_source === "suggested").length;

  return (
    <div>
      {/* 구역 요약 — 범위 이탈 + 미검증(권장값 그대로) 항목 */}
      {rows.length > 0 && (
        <div className="mb-3 space-y-1">
          {outOfRange.length > 0 && (
            <p className="border border-dashed border-foreground px-3 py-2 font-mono text-xs uppercase">
              권장 범위를 벗어난 재료 {outOfRange.length}개 —{" "}
              {outOfRange
                .map(
                  ({ row, calc }) =>
                    `${row.ingredients?.name} ${fmtNumber(calc.ratePct ?? 0, 1)}%${
                      calc.status === "high" ? " (HIGH)" : " (LOW)"
                    }`
                )
                .join(", ")}
            </p>
          )}
          {suggestedCount > 0 && (
            <p className="px-1 font-mono text-xs uppercase text-muted-foreground">
              기능성 재료 {rows.length}개 중 {suggestedCount}개가 권장값 그대로 — 미검증
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO FUNCTIONAL INGREDIENTS
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                {["INGREDIENT", "AMOUNT", "UNIT", "RATE", "BASIS", "RECOMMENDED", "NOTE", ""].map(
                  (header) => (
                    <th
                      key={header}
                      className="label-caps px-2 py-2 text-xs text-muted-foreground"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <FunctionalRow
                  key={row.id}
                  row={row}
                  calc={calcs[i]!}
                  locked={locked}
                  batch={batch}
                  onPatch={(patch) => onPatch(row.id, patch)}
                  onRemove={() => onRemove(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FunctionalRow({
  row,
  calc,
  locked,
  batch,
  onPatch,
  onRemove,
}: {
  row: VersionIngredientRow;
  calc: ReturnType<typeof functionalRowCalc>;
  locked: boolean;
  batch: number;
  onPatch: (patch: FunctionalRowPatch) => void;
  onRemove: () => void;
}) {
  const [targetPctOpen, setTargetPctOpen] = useState(false);
  const [targetPct, setTargetPct] = useState("");
  const [bloomOpen, setBloomOpen] = useState(false);
  const [myBloom, setMyBloom] = useState("");

  const ing = row.ingredients;
  const amount = Number(row.amount);
  const unitFactor = toGrams(1, row.unit);
  const source = row.amount_source ?? "manual";

  // 설계 모드 제안값 — 양이 비어 있을 때만. 적용 전에는 절대 저장되지 않는다.
  const showSuggestion = !locked && amount === 0 && calc.suggestedInUnit != null;

  // 기준량 변경 재맞춤 — 저장된 양은 자동으로 바꾸지 않고 버튼만 제공
  const showResync =
    !locked &&
    amount > 0 &&
    calc.suggestedInUnit != null &&
    Math.abs(calc.suggestedInUnit - amount) / Math.max(amount, 1e-9) > 0.01 &&
    (calc.status === "low" || calc.status === "high" || source === "suggested");

  const scaled = scaledAmount(
    amount,
    ing?.scaling_mode,
    ing?.scaling_exponent != null ? Number(ing.scaling_exponent) : null,
    batch
  );

  const bloomSuggestion =
    ing?.bloom != null && amount > 0 && myBloom
      ? gelatinConvert(amount, Number(ing.bloom), parseNumber(myBloom))
      : null;

  const applyTargetPct = () => {
    const pct = parseNumber(targetPct);
    if (pct <= 0 || calc.basisGrams == null || !unitFactor) return;
    onPatch({
      amount: round2((calc.basisGrams * pct) / 100 / unitFactor),
      amount_source: "suggested",
    });
    setTargetPctOpen(false);
    setTargetPct("");
  };

  return (
    <tr className="border-b border-border align-top">
      {/* INGREDIENT + 출처 뱃지 */}
      <td className="px-2 py-2 text-sm">
        <Link
          to="/ingredients/$ingredientId"
          params={{ ingredientId: row.ingredient_id }}
          className="hover:underline"
        >
          {ing ? ingredientDisplayName(ing) : "—"}
        </Link>
        {source === "suggested" && (
          <span className="label-caps ml-2 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            권장값
          </span>
        )}
        {source === "copied" && (
          <span className="label-caps ml-2 border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            복사됨
          </span>
        )}
        {ing?.bloom != null && !locked && (
          <button
            type="button"
            className="label-caps ml-2 px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
            onClick={() => setBloomOpen((v) => !v)}
          >
            BLOOM {fmtNumber(Number(ing.bloom), 0)}
          </button>
        )}
        {bloomOpen && ing?.bloom != null && (
          <div className="mt-1 flex flex-wrap items-center gap-1 font-mono text-xs">
            <span className="text-muted-foreground">내 제품 BLOOM</span>
            <input
              type="number"
              inputMode="decimal"
              className="min-h-[44px] w-20 border border-input bg-background px-2 py-1 text-base outline-none focus:border-foreground"
              value={myBloom}
              onChange={(e) => setMyBloom(e.target.value)}
            />
            {bloomSuggestion != null && (
              <>
                <span className="tabular-nums">→ {fmtNumber(bloomSuggestion, 1)}{row.unit}</span>
                <button
                  type="button"
                  className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                  onClick={() => {
                    onPatch({ amount: round2(bloomSuggestion), amount_source: "manual" });
                    setBloomOpen(false);
                    setMyBloom("");
                  }}
                >
                  적용
                </button>
              </>
            )}
          </div>
        )}
      </td>

      {/* AMOUNT + 배치 스케일 + 제안값 */}
      <td className="px-2 py-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          className={cn(
            "min-h-[48px] w-24 border bg-background px-2 py-2 font-mono text-base tabular-nums outline-none focus:border-foreground disabled:opacity-60",
            amount === 0 && showSuggestion
              ? "border-dashed border-input text-muted-foreground"
              : "border-input"
          )}
          disabled={locked}
          defaultValue={amount || ""}
          key={`amt-${row.id}-${amount}`}
          placeholder="0"
          onBlur={(e) => {
            const next = parseNumber(e.target.value);
            if (next !== amount) onPatch({ amount: next, amount_source: "manual" });
          }}
        />
        {batch !== 1 && amount > 0 && (
          <p className="mt-1 bg-secondary px-1 font-mono text-xs tabular-nums">
            ×{fmtNumber(batch, 2)} → {fmtNumber(scaled.scaled, 2)}
            {scaled.nonLinear && (
              <span className="text-muted-foreground">
                {" "}
                (비례 시 {fmtNumber(scaled.linear, 2)})
              </span>
            )}
          </p>
        )}
        {showSuggestion && (
          <div className="mt-1 space-y-1">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              ≈ {fmtNumber(calc.suggestedInUnit!, 2)}
              {row.unit} ({fmtNumber(calc.midPct!, 1)}%) — 권장 중앙값
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                onClick={() =>
                  onPatch({
                    amount: round2(calc.suggestedInUnit!),
                    amount_source: "suggested",
                  })
                }
              >
                적용
              </button>
              <button
                type="button"
                className="label-caps border border-input px-2 py-1 text-[10px] hover:bg-secondary"
                onClick={() => setTargetPctOpen((v) => !v)}
              >
                목표 %로 채우기
              </button>
            </div>
            {targetPctOpen && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="min-h-[44px] w-20 border border-input bg-background px-2 py-1 font-mono text-base outline-none focus:border-foreground"
                  placeholder="%"
                  value={targetPct}
                  onChange={(e) => setTargetPct(e.target.value)}
                />
                <button
                  type="button"
                  className="label-caps border border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
                  onClick={applyTargetPct}
                >
                  적용
                </button>
              </div>
            )}
          </div>
        )}
        {showResync && (
          <button
            type="button"
            className="label-caps mt-1 border border-dashed border-foreground px-2 py-1 text-[10px] hover:bg-secondary"
            onClick={() =>
              onPatch({
                amount: round2(calc.suggestedInUnit!),
                amount_source: "suggested",
              })
            }
          >
            기준량 변경됨 — {fmtNumber(calc.midPct!, 1)}%로 다시 맞추기 →{" "}
            {fmtNumber(calc.suggestedInUnit!, 2)}
            {row.unit}
          </button>
        )}
      </td>

      {/* UNIT */}
      <td className="px-2 py-2">
        <select
          className="min-h-[48px] w-20 border border-input bg-background px-2 py-2 font-mono text-sm disabled:opacity-60"
          disabled={locked}
          value={row.unit}
          onChange={(e) => onPatch({ unit: e.target.value })}
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </td>

      {/* RATE — 자동 계산, 저장 안 함 */}
      <td className="px-2 py-2 font-mono text-sm tabular-nums">
        {calc.ratePct != null ? (
          <>
            {fmtNumber(calc.ratePct, 2)}%
            <span className="block text-[10px] uppercase text-muted-foreground">
              of {calc.basisLabel} {calc.basisGrams != null ? `${fmtNumber(calc.basisGrams)}g` : "—"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* BASIS */}
      <td className="label-caps px-2 py-2 text-xs text-muted-foreground">
        {calc.basisLabel}
      </td>

      {/* RECOMMENDED — 막대(데스크톱) + 숫자(항상) */}
      <td className="px-2 py-2">
        {calc.recMinPct != null && calc.recMaxPct != null ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <RangeBar value={calc.ratePct} min={calc.recMinPct} max={calc.recMaxPct} />
            </span>
            <span className="font-mono text-xs tabular-nums">
              {calc.ratePct != null ? `${fmtNumber(calc.ratePct, 1)}%` : "—"} · 권장{" "}
              {fmtNumber(calc.recMinPct, 1)}–{fmtNumber(calc.recMaxPct, 1)}%{" "}
              {calc.status === "in" && "✓"}
              {calc.status === "low" && "LOW"}
              {calc.status === "high" && "HIGH"}
            </span>
          </div>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* NOTE */}
      <td className="px-2 py-2">
        <input
          className="min-h-[48px] w-36 border border-input bg-background px-2 py-2 text-base outline-none focus:border-foreground disabled:opacity-60"
          disabled={locked}
          defaultValue={row.note ?? ""}
          key={`note-${row.id}`}
          onBlur={(e) => {
            const note = e.target.value.trim() || null;
            if (note !== (row.note ?? null)) onPatch({ note });
          }}
        />
        {ing?.process_note && (
          <p className="mt-1 max-w-44 font-mono text-[10px] uppercase text-muted-foreground">
            ⚠ {ing.process_note}
          </p>
        )}
      </td>

      <td className="px-2 py-2">
        {!locked && (
          <button
            type="button"
            className="label-caps min-h-[48px] px-2 text-xs hover:bg-secondary"
            onClick={onRemove}
          >
            REMOVE
          </button>
        )}
      </td>
    </tr>
  );
}
