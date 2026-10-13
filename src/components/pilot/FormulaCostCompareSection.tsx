import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formulaCostCompareQuery,
  formulasQuery,
  techniqueCategoriesQuery,
  type FormulaCostCompareIssue,
  type FormulaCostCompareRow,
} from "@/lib/queries";
import { fmtNumber, versionLabel } from "@/lib/formula";
import { fmtCurrency } from "@/lib/cost";
import { leafTechniques, techniquePathLabel } from "@/lib/technique";
import { buttonClass, Field, inputClass, primaryButtonClass, selectClass, StatusBadge } from "./ui";

/**
 * COST 탭 — "포뮬라 단가 비교"(2026-10-13, 사용자 요청: "White Whipping Ganache"와
 * "Mascarpone Condensed Milk Vanilla Cream"처럼 배치 중량이 서로 다른 포뮬라들을 같은 기준
 * 중량으로 환산해서 원가를 비교하고 싶다는 요청).
 *
 * 기존 데이터(FORMULA/VERSION/재료 가격/원가 계산 로직)는 전혀 건드리지 않고 조회만 한다.
 * 선택 목록·기준 중량·추가 비용은 전부 이 화면 세션에서만 유지되는 로컬 상태(저장 안 함) —
 * 작업지시서 4번 "별도 저장 기능은 필요하지 않다"에 따름.
 */

type ExtraCostBasis = "BATCH" | "TARGET";

interface ExtraCostLine {
  id: string;
  label: string;
  amount: string; // 입력 중 빈 문자열 허용을 위해 string으로 보관
  basis: ExtraCostBasis;
}

let extraCostSeq = 0;
function nextExtraCostId() {
  extraCostSeq += 1;
  return `extra-${extraCostSeq}`;
}

export function FormulaCostCompareSection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baseWeightInput, setBaseWeightInput] = useState("1000");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [extraCostsByFormula, setExtraCostsByFormula] = useState<Record<string, ExtraCostLine[]>>({});

  const baseWeightG = Number(baseWeightInput) > 0 ? Number(baseWeightInput) : 0;

  const formulas = useQuery(formulasQuery());
  const categories = useQuery(techniqueCategoriesQuery());
  const compare = useQuery(formulaCostCompareQuery(selectedIds));

  const categoryList = categories.data ?? [];
  const compareRowsById = useMemo(() => {
    const map = new Map<string, FormulaCostCompareRow>();
    for (const row of compare.data ?? []) map.set(row.formulaId, row);
    return map;
  }, [compare.data]);

  // 선택된 순서를 그대로 유지해서 표시(선택 즉시 뒤에 추가)
  const selectedRows = selectedIds
    .map((id) => compareRowsById.get(id))
    .filter((r): r is FormulaCostCompareRow => !!r);

  const term = search.trim().toLowerCase();
  const pickerResults = (formulas.data ?? [])
    .filter((f) => !selectedIds.includes(f.id))
    .filter((f) => (categoryFilter ? f.technique_category_id === categoryFilter : true))
    .filter((f) => (term ? f.name.toLowerCase().includes(term) : true))
    .slice(0, 40);

  const addFormula = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const removeFormula = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    setExtraCostsByFormula((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addExtraCostLine = (formulaId: string) => {
    setExtraCostsByFormula((prev) => ({
      ...prev,
      [formulaId]: [...(prev[formulaId] ?? []), { id: nextExtraCostId(), label: "", amount: "", basis: "TARGET" }],
    }));
  };
  const updateExtraCostLine = (formulaId: string, lineId: string, patch: Partial<ExtraCostLine>) => {
    setExtraCostsByFormula((prev) => ({
      ...prev,
      [formulaId]: (prev[formulaId] ?? []).map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    }));
  };
  const removeExtraCostLine = (formulaId: string, lineId: string) => {
    setExtraCostsByFormula((prev) => ({
      ...prev,
      [formulaId]: (prev[formulaId] ?? []).filter((line) => line.id !== lineId),
    }));
  };

  // 각 포뮬라의 "기준 중량 환산 원가 + 추가비용 = 최종 비교 원가"를 계산.
  // 실제 원가를 계산할 수 없는 경우(issues에 NO_VERSION/ZERO_WEIGHT/UNIT_CONVERSION/CALC_ERROR가
  // 있어 costPerGram이 null)에는 최종 비교 원가도 계산하지 않는다 — "오류를 해결 안 했는데
  // 정상 계산된 것처럼 보이면 안 된다"는 작업지시서 5번 규칙.
  const computed = selectedRows.map((row) => {
    const lines = extraCostsByFormula[row.formulaId] ?? [];
    const blockingIssue = row.issues.find(
      (i) => i.code === "NO_VERSION" || i.code === "ZERO_WEIGHT" || i.code === "UNIT_CONVERSION" || i.code === "CALC_ERROR",
    );
    const convertedCost =
      row.costPerGram != null && baseWeightG > 0 ? row.costPerGram * baseWeightG : null;

    let extraCostAtTarget = 0;
    let extraCostUnresolved = false;
    for (const line of lines) {
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      if (line.basis === "TARGET") {
        extraCostAtTarget += amount;
      } else {
        // 배치 전체 금액 → 기준 중량에 맞춰 환산(배치 총중량 기준 비율)
        if (row.totalGrams > 0 && baseWeightG > 0) {
          extraCostAtTarget += (amount / row.totalGrams) * baseWeightG;
        } else {
          extraCostUnresolved = true;
        }
      }
    }

    const hasAnyExtraCost = lines.some((l) => Number(l.amount) !== 0 && l.amount.trim() !== "");
    const finalCost =
      !blockingIssue && convertedCost != null && !extraCostUnresolved
        ? convertedCost + extraCostAtTarget
        : null;

    // "최저 원가"로 선정될 수 있는 대상 — 작업지시서 8번: 오류가 있는 포뮬라는 제외
    const eligibleForMin = row.issues.length === 0 && finalCost != null;

    return {
      row,
      convertedCost,
      extraCostAtTarget,
      extraCostUnresolved,
      hasAnyExtraCost,
      finalCost,
      eligibleForMin,
      blockingIssue,
    };
  });

  const minFinalCost = computed
    .filter((c) => c.eligibleForMin)
    .reduce((min, c) => (min == null || (c.finalCost as number) < min ? (c.finalCost as number) : min), null as number | null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="비교 기준 중량(g)">
          <input
            className={`${inputClass} w-28`}
            type="number"
            min={0}
            value={baseWeightInput}
            onChange={(e) => setBaseWeightInput(e.target.value)}
          />
        </Field>
        <p className="max-w-md font-mono text-[11px] uppercase text-muted-foreground">
          배치 중량이 서로 다른 포뮬라를 이 기준 중량으로 환산해서 비교합니다. 기본값 1,000g.
        </p>
      </div>

      {/* 선택된 포뮬라 칩 */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedRows.map((row) => (
            <button
              key={row.formulaId}
              type="button"
              className="label-caps inline-flex items-center gap-1.5 border border-foreground bg-foreground px-2 py-1 text-[11px] text-background hover:opacity-80"
              onClick={() => removeFormula(row.formulaId)}
              title="제거"
            >
              {row.formulaName}
              {row.versionNumber != null && <span className="opacity-70">{versionLabel(row.versionNumber)}</span>}
              <span>×</span>
            </button>
          ))}
        </div>
      )}

      {/* 포뮬라 검색/필터/추가 */}
      <div className="space-y-2 border border-dashed border-border p-3">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputClass} max-w-xs flex-1`}
            placeholder="포뮬라명 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`${selectClass} w-auto`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">전체 카테고리</option>
            {leafTechniques(categoryList).map(({ category }) => (
              <option key={category.id} value={category.id}>
                {techniquePathLabel(categoryList, category.id)}
              </option>
            ))}
          </select>
        </div>
        {formulas.isLoading ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
        ) : pickerResults.length === 0 ? (
          <p className="font-mono text-xs uppercase text-muted-foreground">NO MATCH</p>
        ) : (
          <ul className="max-h-48 divide-y divide-border overflow-auto border border-border">
            {pickerResults.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex min-h-[40px] w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-secondary"
                  onClick={() => addFormula(f.id)}
                >
                  <span className="text-sm">{f.name}</span>
                  <span className="label-caps text-[10px] text-muted-foreground">
                    {techniquePathLabel(categoryList, f.technique_category_id)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 비교표 */}
      {selectedIds.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          위에서 포뮬라를 2개 이상 선택하면 비교표가 표시됩니다.
        </p>
      ) : compare.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {computed.map(({ row, convertedCost, extraCostAtTarget, extraCostUnresolved, hasAnyExtraCost, finalCost, eligibleForMin }) => (
            <FormulaCompareRow
              key={row.formulaId}
              row={row}
              baseWeightG={baseWeightG}
              convertedCost={convertedCost}
              extraCostAtTarget={extraCostAtTarget}
              extraCostUnresolved={extraCostUnresolved}
              hasAnyExtraCost={hasAnyExtraCost}
              finalCost={finalCost}
              isLowest={eligibleForMin && minFinalCost != null && finalCost === minFinalCost}
              minFinalCost={minFinalCost}
              lines={extraCostsByFormula[row.formulaId] ?? []}
              onAddLine={() => addExtraCostLine(row.formulaId)}
              onUpdateLine={(lineId, patch) => updateExtraCostLine(row.formulaId, lineId, patch)}
              onRemoveLine={(lineId) => removeExtraCostLine(row.formulaId, lineId)}
              onRemove={() => removeFormula(row.formulaId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const ISSUE_LABEL: Record<FormulaCostCompareIssue["code"], string> = {
  NO_VERSION: "버전 없음",
  ZERO_WEIGHT: "배치 중량 오류",
  UNIT_CONVERSION: "단위 변환 오류",
  MISSING_PRICE: "재료 가격 누락",
  CALC_ERROR: "원가 계산 오류",
};

function FormulaCompareRow({
  row,
  baseWeightG,
  convertedCost,
  extraCostAtTarget,
  extraCostUnresolved,
  hasAnyExtraCost,
  finalCost,
  isLowest,
  minFinalCost,
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onRemove,
}: {
  row: FormulaCostCompareRow;
  baseWeightG: number;
  convertedCost: number | null;
  extraCostAtTarget: number;
  extraCostUnresolved: boolean;
  hasAnyExtraCost: boolean;
  finalCost: number | null;
  isLowest: boolean;
  minFinalCost: number | null;
  lines: ExtraCostLine[];
  onAddLine: () => void;
  onUpdateLine: (lineId: string, patch: Partial<ExtraCostLine>) => void;
  onRemoveLine: (lineId: string) => void;
  onRemove: () => void;
}) {
  const diff = finalCost != null && minFinalCost != null ? finalCost - minFinalCost : null;
  const diffPct = diff != null && minFinalCost != null && minFinalCost > 0 ? (diff / minFinalCost) * 100 : null;

  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{row.formulaName}</span>
          {row.versionNumber != null && row.versionStatus != null && (
            <>
              <span className="font-mono text-xs text-muted-foreground">{versionLabel(row.versionNumber)}</span>
              <StatusBadge status={row.versionStatus} />
            </>
          )}
          {row.categoryName && (
            <span className="label-caps text-[10px] text-muted-foreground">{row.categoryName}</span>
          )}
          {isLowest && (
            <span className="label-caps border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              최저 원가
            </span>
          )}
        </div>
        <button type="button" className={buttonClass} onClick={onRemove}>
          REMOVE
        </button>
      </div>

      {row.issues.length > 0 && (
        <ul className="space-y-0.5">
          {row.issues.map((issue, idx) => (
            <li key={idx} className="font-mono text-[11px] uppercase text-destructive">
              [{ISSUE_LABEL[issue.code]}] {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground sm:grid-cols-4">
        <Stat label="배치 총중량" value={row.totalGrams > 0 ? `${fmtNumber(row.totalGrams)}g` : "—"} />
        <Stat label="배치 총원가" value={row.totalGrams > 0 && row.costPerGram != null ? fmtCurrency(row.totalCost) : "—"} />
        <Stat label="1g당" value={row.costPerGram != null ? fmtCurrency(row.costPerGram) : "—"} />
        <Stat label="100g당" value={row.costPerGram != null ? fmtCurrency(row.costPerGram * 100) : "—"} />
        <Stat label="1kg당" value={row.costPerGram != null ? fmtCurrency(row.costPerGram * 1000) : "—"} />
        <Stat
          label={`${fmtNumber(baseWeightG)}g 환산`}
          value={convertedCost != null ? fmtCurrency(convertedCost) : "—"}
        />
        <Stat
          label="추가 비용"
          value={hasAnyExtraCost ? (extraCostUnresolved ? "환산 불가" : fmtCurrency(extraCostAtTarget)) : "—"}
        />
        <Stat
          label="최종 비교 원가"
          value={finalCost != null ? fmtCurrency(finalCost) : "원가 오류 — 비교 불가"}
          emphasis
        />
      </div>

      {diff != null && (
        <p className="font-mono text-[11px] text-muted-foreground">
          최저 원가와의 차이: {diff === 0 ? "—" : `+${fmtCurrency(diff)}`}
          {diffPct != null && diff !== 0 ? ` (+${diffPct.toFixed(1)}%)` : ""}
        </p>
      )}

      {/* 사용자 추가 비용 입력 */}
      <div className="space-y-1.5 border border-dashed border-border p-2">
        <p className="label-caps text-[10px] text-muted-foreground">사용자 추가 비용</p>
        {lines.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            추가 재료비·포장비·작업비 등 비교에 포함할 비용이 있으면 추가하세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {lines.map((line) => (
              <div key={line.id} className="flex flex-wrap items-center gap-1.5">
                <input
                  className={`${inputClass} w-32`}
                  placeholder="항목명(예: 포장비)"
                  value={line.label}
                  onChange={(e) => onUpdateLine(line.id, { label: e.target.value })}
                />
                <input
                  className={`${inputClass} w-24`}
                  type="number"
                  placeholder="금액"
                  value={line.amount}
                  onChange={(e) => onUpdateLine(line.id, { amount: e.target.value })}
                />
                <select
                  className={`${selectClass} w-auto`}
                  value={line.basis}
                  onChange={(e) => onUpdateLine(line.id, { basis: e.target.value as ExtraCostBasis })}
                >
                  <option value="TARGET">기준 중량 기준 금액</option>
                  <option value="BATCH">배치 전체 금액</option>
                </select>
                <button type="button" className={buttonClass} onClick={() => onRemoveLine(line.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className={primaryButtonClass} onClick={onAddLine}>
          + ADD COST
        </button>
      </div>
    </li>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={emphasis ? "text-sm font-semibold text-foreground" : "text-xs text-foreground"}>{value}</p>
    </div>
  );
}
