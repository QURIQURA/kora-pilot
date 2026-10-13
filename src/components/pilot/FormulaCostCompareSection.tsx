import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formulaCostCompareQuery,
  formulasQuery,
  techniqueCategoriesQuery,
  versionIngredientsBulkQuery,
  type FormulaCostCompareIssue,
  type FormulaCostCompareRow,
  type VersionIngredientRow,
} from "@/lib/queries";
import { fmtNumber, toGrams, versionLabel } from "@/lib/formula";
import { costPerGram, fmtCurrency } from "@/lib/cost";
import { ingredientDisplayName } from "@/lib/pilot";
import { leafTechniques, techniquePathLabel } from "@/lib/technique";
import { cn } from "@/lib/utils";
import { Field, inputClass, primaryButtonClass, selectClass, StatusBadge } from "./ui";

/**
 * COST 탭 — "포뮬라 단가 비교"(2026-10-13, 사용자 요청: "White Whipping Ganache"와
 * "Mascarpone Condensed Milk Vanilla Cream"처럼 배치 중량이 서로 다른 포뮬라들을 같은 기준
 * 중량으로 환산해서 원가를 비교하고 싶다는 요청).
 *
 * 2026-10-13 추가 요청: "2열로(더 추가되면 열을 늘리고 스크롤), 동일한 재료는 동일한 행에
 * 뜨게 재료도 나열해달라 — 단, VersionComparisonSheet(계량 정확도가 중요한 화면)와 달리 여기는
 * 정확히 계량하려고 보는 게 아니니 재료는 회색 텍스트로, 가격 차이가 제일 큰 두 재료만 빨간색으로."
 * → 포뮬라를 열(컬럼)로, 재료를 행(로우)으로 나란히 두는 엑셀 스타일 표로 재구성.
 *
 * 기존 데이터(FORMULA/VERSION/재료 가격/원가 계산 로직)는 전혀 건드리지 않고 조회만 한다.
 * 선택 목록·기준 중량·추가 비용은 전부 이 화면 세션에서만 유지되는 로컬 상태(저장 안 함) —
 * 작업지시서 4번 "별도 저장 기능은 필요하지 않다"에 따름.
 */

const INGREDIENT_COL_WIDTH = 150;
const FORMULA_COL_WIDTH = 230;
/** "2열로(더 추가되면 스크롤)" — 기본으로는 딱 2개 포뮬라 열만 보이고, 그 이상은 가로 스크롤 */
const VISIBLE_FORMULA_COLS = 2;

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

interface IngredientRowData {
  ingredientId: string;
  name: string;
  firstSeenIndex: number;
  byFormula: Map<string, VersionIngredientRow>;
}

/** 재료 한 줄의 비용(원) — 가격 정보가 없으면 null(모른다는 뜻, 0이 아님) */
function ingredientLineCost(cell: VersionIngredientRow | undefined): number | null {
  if (!cell) return 0; // 그 포뮬라에는 아예 안 쓰임 → 비용 기여 0
  const grams = toGrams(Number(cell.amount), cell.unit) ?? 0;
  const cpg = costPerGram(cell.ingredients);
  return cpg != null ? grams * cpg : null;
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

  // 선택된 순서를 그대로 유지해서 표시(선택 즉시 뒤에 열로 추가)
  const selectedRows = selectedIds
    .map((id) => compareRowsById.get(id))
    .filter((r): r is FormulaCostCompareRow => !!r);

  const versionIds = selectedRows.map((r) => r.versionId).filter((id): id is string => id != null);
  const ingredientsByVersion = useQuery(versionIngredientsBulkQuery(versionIds));

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

  // 각 포뮬라의 "기준 중량 환산 원가 + 추가비용 = 최종 비교 원가" 계산.
  // 실제 원가를 계산할 수 없는 경우(NO_VERSION/ZERO_WEIGHT/UNIT_CONVERSION/CALC_ERROR)엔
  // 최종 비교 원가도 계산하지 않는다 — 오류를 해결 안 했는데 정상 계산된 것처럼 보이면 안 됨.
  const computed = selectedRows.map((row) => {
    const lines = extraCostsByFormula[row.formulaId] ?? [];
    const blockingIssue = row.issues.find(
      (i) => i.code === "NO_VERSION" || i.code === "ZERO_WEIGHT" || i.code === "UNIT_CONVERSION" || i.code === "CALC_ERROR",
    );
    const convertedCost = row.costPerGram != null && baseWeightG > 0 ? row.costPerGram * baseWeightG : null;

    let extraCostAtTarget = 0;
    let extraCostUnresolved = false;
    for (const line of lines) {
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      if (line.basis === "TARGET") {
        extraCostAtTarget += amount;
      } else if (row.totalGrams > 0 && baseWeightG > 0) {
        extraCostAtTarget += (amount / row.totalGrams) * baseWeightG;
      } else {
        extraCostUnresolved = true;
      }
    }

    const hasAnyExtraCost = lines.some((l) => Number(l.amount) !== 0 && l.amount.trim() !== "");
    const finalCost = !blockingIssue && convertedCost != null && !extraCostUnresolved ? convertedCost + extraCostAtTarget : null;
    const eligibleForMin = row.issues.length === 0 && finalCost != null;

    return { row, convertedCost, extraCostAtTarget, extraCostUnresolved, hasAnyExtraCost, finalCost, eligibleForMin };
  });

  const minFinalCost = computed
    .filter((c) => c.eligibleForMin)
    .reduce((min, c) => (min == null || (c.finalCost as number) < min ? (c.finalCost as number) : min), null as number | null);

  // 재료 행 — 선택된 포뮬라들의 effective version 재료를 ingredient_id로 병합(동일 재료 = 동일 행)
  const ingredientRows = useMemo<IngredientRowData[]>(() => {
    const byIngredient = new Map<string, IngredientRowData>();
    selectedRows.forEach((row, idx) => {
      if (!row.versionId) return;
      const lines = ingredientsByVersion.data?.[row.versionId] ?? [];
      lines.forEach((line) => {
        const key = line.ingredient_id;
        const existing = byIngredient.get(key);
        if (existing) {
          existing.byFormula.set(row.formulaId, line);
        } else {
          byIngredient.set(key, {
            ingredientId: key,
            name: line.ingredients ? ingredientDisplayName(line.ingredients) : "—",
            firstSeenIndex: idx,
            byFormula: new Map([[row.formulaId, line]]),
          });
        }
      });
    });
    return [...byIngredient.values()].sort(
      (a, b) => a.firstSeenIndex - b.firstSeenIndex || a.name.localeCompare(b.name),
    );
  }, [selectedRows, ingredientsByVersion.data]);

  // 재료별 "포뮬라 간 비용 차이"가 가장 큰 두 재료만 강조 표시(2026-10-13 사용자 요청)
  const topDiffIngredientIds = useMemo(() => {
    const diffs = ingredientRows.map((ir) => {
      const costs = selectedRows
        .map((row) => ingredientLineCost(ir.byFormula.get(row.formulaId)))
        .filter((c): c is number => c != null);
      const diff = costs.length > 0 ? Math.max(...costs) - Math.min(...costs) : 0;
      return { id: ir.ingredientId, diff };
    });
    return new Set(
      diffs
        .filter((d) => d.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 2)
        .map((d) => d.id),
    );
  }, [ingredientRows, selectedRows]);

  const colCount = selectedRows.length;
  const visibleWidth = INGREDIENT_COL_WIDTH + Math.min(colCount, VISIBLE_FORMULA_COLS) * FORMULA_COL_WIDTH + 2;
  const totalWidth = INGREDIENT_COL_WIDTH + colCount * FORMULA_COL_WIDTH;

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

      {/* 비교표 — 포뮬라를 열로, 재료를 행으로(동일 재료 = 동일 행). 기본 2열만 보이고 더 추가되면
          가로 스크롤(2026-10-13 사용자 요청). */}
      {selectedIds.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          위에서 포뮬라를 2개 이상 선택하면 비교표가 표시됩니다.
        </p>
      ) : compare.isLoading ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>
      ) : (
        <div className="overflow-x-auto border border-border" style={{ maxWidth: visibleWidth }}>
          <table className="border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: totalWidth }}>
            <colgroup>
              <col style={{ width: INGREDIENT_COL_WIDTH }} />
              {selectedRows.map((row) => (
                <col key={row.formulaId} style={{ width: FORMULA_COL_WIDTH }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left">
                <th className="label-caps px-2 py-2 text-[10px] text-muted-foreground">포뮬라</th>
                {computed.map(({ row, eligibleForMin, finalCost }) => (
                  <th key={row.formulaId} className="border-l border-dashed border-border px-2 py-2 align-top">
                    <div className="flex items-start justify-between gap-1">
                      <div className="space-y-0.5">
                        <p className="text-sm leading-tight">{row.formulaName}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {row.versionNumber != null && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {versionLabel(row.versionNumber)}
                            </span>
                          )}
                          {row.versionStatus && <StatusBadge status={row.versionStatus} />}
                        </div>
                        {row.categoryName && (
                          <p className="label-caps text-[9px] text-muted-foreground">{row.categoryName}</p>
                        )}
                        {eligibleForMin && finalCost != null && finalCost === minFinalCost && (
                          <span className="label-caps inline-block border border-foreground bg-foreground px-1 py-0.5 text-[9px] text-background">
                            최저 원가
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 font-mono text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => removeFormula(row.formulaId)}
                        title="제거"
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 이슈 — 하나라도 있는 포뮬라가 있을 때만 행 표시 */}
              {computed.some((c) => c.row.issues.length > 0) && (
                <StatRow label="이슈">
                  {computed.map(({ row }) => (
                    <td key={row.formulaId} className="border-l border-dashed border-border px-2 py-1.5 align-top">
                      {row.issues.length === 0 ? (
                        <span className="font-mono text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {row.issues.map((issue, idx) => (
                            <li key={idx} className="font-mono text-[10px] uppercase text-destructive">
                              [{ISSUE_LABEL[issue.code]}] {issue.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </StatRow>
              )}

              <StatRow label="배치 총중량">
                {computed.map(({ row }) => (
                  <ValueCell key={row.formulaId}>{row.totalGrams > 0 ? `${fmtNumber(row.totalGrams)}g` : "—"}</ValueCell>
                ))}
              </StatRow>

              <StatRow label="배치 총원가">
                {computed.map(({ row }) => (
                  <ValueCell key={row.formulaId}>
                    {row.totalGrams > 0 && row.costPerGram != null ? fmtCurrency(row.totalCost) : "—"}
                  </ValueCell>
                ))}
              </StatRow>

              <StatRow label="1g당">
                {computed.map(({ row }) => (
                  <ValueCell key={row.formulaId}>{row.costPerGram != null ? fmtCurrency(row.costPerGram) : "—"}</ValueCell>
                ))}
              </StatRow>
              <StatRow label="100g당">
                {computed.map(({ row }) => (
                  <ValueCell key={row.formulaId}>
                    {row.costPerGram != null ? fmtCurrency(row.costPerGram * 100) : "—"}
                  </ValueCell>
                ))}
              </StatRow>
              <StatRow label="1kg당">
                {computed.map(({ row }) => (
                  <ValueCell key={row.formulaId}>
                    {row.costPerGram != null ? fmtCurrency(row.costPerGram * 1000) : "—"}
                  </ValueCell>
                ))}
              </StatRow>

              <StatRow label={`${fmtNumber(baseWeightG)}g 환산`}>
                {computed.map(({ row, convertedCost }) => (
                  <ValueCell key={row.formulaId}>{convertedCost != null ? fmtCurrency(convertedCost) : "—"}</ValueCell>
                ))}
              </StatRow>

              <StatRow label="추가 비용">
                {computed.map(({ row }) => (
                  <td key={row.formulaId} className="border-l border-dashed border-border px-2 py-1.5 align-top">
                    <ExtraCostEditor
                      lines={extraCostsByFormula[row.formulaId] ?? []}
                      onAdd={() => addExtraCostLine(row.formulaId)}
                      onUpdate={(lineId, patch) => updateExtraCostLine(row.formulaId, lineId, patch)}
                      onRemove={(lineId) => removeExtraCostLine(row.formulaId, lineId)}
                    />
                  </td>
                ))}
              </StatRow>

              <StatRow label="최종 비교 원가" emphasis>
                {computed.map(({ row, finalCost }) => (
                  <ValueCell key={row.formulaId} emphasis>
                    {finalCost != null ? fmtCurrency(finalCost) : "원가 오류"}
                  </ValueCell>
                ))}
              </StatRow>

              <StatRow label="최저 대비 차이">
                {computed.map(({ row, finalCost, eligibleForMin }) => {
                  const diff = finalCost != null && minFinalCost != null ? finalCost - minFinalCost : null;
                  const diffPct = diff != null && minFinalCost != null && minFinalCost > 0 ? (diff / minFinalCost) * 100 : null;
                  return (
                    <ValueCell key={row.formulaId}>
                      {diff == null
                        ? "—"
                        : !eligibleForMin
                          ? "비교 제외"
                          : diff === 0
                            ? "—"
                            : `+${fmtCurrency(diff)}${diffPct != null ? ` (+${diffPct.toFixed(1)}%)` : ""}`}
                    </ValueCell>
                  );
                })}
              </StatRow>

              {/* 구역 구분 — 요약 통계와 재료별 상세를 실선으로 명확히 나눔 */}
              <tr>
                <td
                  colSpan={colCount + 1}
                  className="border-t-2 border-foreground bg-secondary/60 px-2 py-1.5 font-mono text-[10px] uppercase text-muted-foreground"
                >
                  재료별 비용(참고용 — 정확한 계량 확인용이 아니라, 어느 재료가 포뮬라 간 가격 차이를
                  만드는지 보기 위한 것) · 가격 차이가 가장 큰 재료 2개는 빨간색
                </td>
              </tr>

              {ingredientsByVersion.isLoading ? (
                <tr>
                  <td colSpan={colCount + 1} className="px-2 py-2 font-mono text-[11px] uppercase text-muted-foreground">
                    LOADING…
                  </td>
                </tr>
              ) : ingredientRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount + 1} className="px-2 py-2 font-mono text-[11px] uppercase text-muted-foreground">
                    등록된 재료가 없습니다.
                  </td>
                </tr>
              ) : (
                ingredientRows.map((ir) => {
                  const highlighted = topDiffIngredientIds.has(ir.ingredientId);
                  const tone = highlighted ? "text-destructive" : "text-muted-foreground";
                  return (
                    <tr key={ir.ingredientId} className="border-b border-border">
                      <td className={cn("px-2 py-1.5 font-mono text-[11px]", tone)}>{ir.name}</td>
                      {selectedRows.map((row) => {
                        const cell = ir.byFormula.get(row.formulaId);
                        return (
                          <td
                            key={row.formulaId}
                            className={cn(
                              "border-l border-dashed border-border px-2 py-1.5 font-mono text-[11px] tabular-nums",
                              tone,
                            )}
                          >
                            {cell ? (
                              <>
                                {fmtNumber(Number(cell.amount), 1)}
                                {cell.unit}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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

function StatRow({ label, emphasis, children }: { label: string; emphasis?: boolean; children: React.ReactNode }) {
  return (
    <tr className="border-b border-border">
      <td
        className={cn(
          "label-caps px-2 py-1.5 text-[10px] text-muted-foreground",
          emphasis && "text-foreground",
        )}
      >
        {label}
      </td>
      {children}
    </tr>
  );
}

function ValueCell({ children, emphasis }: { children: React.ReactNode; emphasis?: boolean }) {
  return (
    <td
      className={cn(
        "border-l border-dashed border-border px-2 py-1.5 font-mono text-xs tabular-nums",
        emphasis && "text-sm font-semibold text-foreground",
      )}
    >
      {children}
    </td>
  );
}

function ExtraCostEditor({
  lines,
  onAdd,
  onUpdate,
  onRemove,
}: {
  lines: ExtraCostLine[];
  onAdd: () => void;
  onUpdate: (lineId: string, patch: Partial<ExtraCostLine>) => void;
  onRemove: (lineId: string) => void;
}) {
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <div key={line.id} className="space-y-1 border border-dashed border-border p-1">
          <input
            className={`${inputClass} h-6 text-[11px]`}
            placeholder="항목명(예: 포장비)"
            value={line.label}
            onChange={(e) => onUpdate(line.id, { label: e.target.value })}
          />
          <div className="flex items-center gap-1">
            <input
              className={`${inputClass} h-6 w-16 text-[11px]`}
              type="number"
              placeholder="금액"
              value={line.amount}
              onChange={(e) => onUpdate(line.id, { amount: e.target.value })}
            />
            <select
              className={`${selectClass} h-6 flex-1 text-[10px]`}
              value={line.basis}
              onChange={(e) => onUpdate(line.id, { basis: e.target.value as ExtraCostBasis })}
            >
              <option value="TARGET">기준중량 금액</option>
              <option value="BATCH">배치 전체 금액</option>
            </select>
            <button type="button" className="shrink-0 font-mono text-[11px] text-muted-foreground hover:text-destructive" onClick={() => onRemove(line.id)}>
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className={`${primaryButtonClass} h-6 w-full text-[10px]`} onClick={onAdd}>
        + ADD COST
      </button>
    </div>
  );
}
