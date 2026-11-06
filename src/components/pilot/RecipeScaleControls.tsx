/**
 * 레시피 중량 조절 컨트롤 — 재료 한 개(AdjustInput) / 모든 재료(ScaleAllPanel).
 * 계산 규칙은 lib/recipe-scale.ts. 포뮬라 화면과 WORK VIEW 편집 창이 같이 쓴다.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtNumber } from "@/lib/formula";
import { adjustAmount, scaleFactor, type ScaleMode } from "@/lib/recipe-scale";

export function AdjustInput({
  current,
  onApply,
}: {
  current: number;
  onApply: (next: number) => void;
}) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const apply = () => {
    if (!text.trim()) return;
    const next = adjustAmount(current, text);
    if (next == null) {
      setBad(true);
      return;
    }
    setBad(false);
    onApply(next);
    setText("");
  };
  return (
    <input
      className={cn(
        "mt-1 min-h-[32px] w-24 border bg-background px-1 py-1 font-mono text-xs outline-none focus:border-foreground",
        bad ? "border-destructive" : "border-dashed border-input",
      )}
      placeholder="+20 ×1.2 +10%"
      title="+20 더하기 · -10 빼기 · +10% · ×1.2 또는 7/6 배수 · 숫자만 쓰면 그 값으로. Enter로 적용"
      aria-label="이 재료 증량"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      }}
      onBlur={apply}
    />
  );
}

export /** 모든 재료 중량 조절 — 곱할 배수 / 퍼센트 증량 / 총 중량(g) 맞추기 */
function ScaleAllPanel({
  mode,
  value,
  currentTotal,
  onMode,
  onValue,
  onApply,
}: {
  mode: ScaleMode;
  value: string;
  currentTotal: number;
  onMode: (mode: ScaleMode) => void;
  onValue: (value: string) => void;
  onApply: (factor: number) => void;
}) {
  const factor = value.trim() ? scaleFactor(mode, value, currentTotal) : null;
  const invalid = value.trim() !== "" && factor == null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border border-dashed border-border bg-muted/30 p-2 text-sm">
      <select
        className="min-h-[32px] border border-input bg-background px-2 text-sm"
        value={mode}
        onChange={(e) => onMode(e.target.value as ScaleMode)}
        aria-label="조절 방식"
      >
        <option value="FACTOR">× 배수</option>
        <option value="PERCENT">+ 퍼센트</option>
        <option value="TOTAL">총 중량(g)로 맞추기</option>
      </select>
      <input
        className={cn(
          "min-h-[32px] w-32 border bg-background px-2 font-mono text-sm outline-none focus:border-foreground",
          invalid ? "border-destructive" : "border-input",
        )}
        placeholder={
          mode === "FACTOR" ? "1.2 또는 7/6" : mode === "PERCENT" ? "10 (= +10%)" : "1000"
        }
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && factor != null) {
            e.preventDefault();
            onApply(factor);
          }
        }}
        aria-label="조절 값"
      />
      <button
        type="button"
        className="label-caps min-h-[32px] border border-foreground bg-foreground px-3 text-xs text-background hover:opacity-90"
        onClick={() => factor != null && onApply(factor)}
      >
        APPLY
      </button>
      <span className="font-mono text-xs text-muted-foreground">
        {invalid
          ? "숫자를 확인하세요"
          : factor != null
            ? `총 ${fmtNumber(currentTotal, 1)}g → ${fmtNumber(currentTotal * factor, 1)}g (×${fmtNumber(factor, 3)})`
            : `지금 총 ${fmtNumber(currentTotal, 1)}g · 단위 %인 재료는 제외, 개수 표기도 같은 비율로 바뀌어요`}
      </span>
    </div>
  );
}
