import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { versionIngredientsQuery, type VersionIngredientRow } from "@/lib/queries";
import { fmtNumber, versionLabel } from "@/lib/formula";
import { ingredientDisplayName } from "@/lib/pilot";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./ui";

/** VersionHistory(Formula 상세 페이지)와 CurrentFormulaPanel(Component 페이지)이 함께 쓰는
 * "버전 비교 엑셀 시트" — 이 Formula의 모든 버전을 열로 나란히 두고 재료별로 뭐가
 * 달라졌는지/추가됐는지/삭제됐는지 한눈에 보여준다. 읽기 전용 — 편집은 항상
 * Formula 상세 페이지(OPEN FULL FORMULA)에서 버전을 선택해서 한다. */
export function VersionComparisonSheet({
  versions,
}: {
  versions: { id: string; version_number: number; status: string }[];
}) {
  // 버전 순서(오래된 → 최신)로 정렬 — 시트 열 순서를 V1, V2, V3... 순으로 고정
  const orderedVersions = useMemo(
    () => [...versions].sort((a, b) => a.version_number - b.version_number),
    [versions],
  );

  // 모든 버전의 재료를 한번에 조회 — 버전 개수가 가변이라 useQueries 사용
  const versionIngredientQueries = useQueries({
    queries: orderedVersions.map((v) => versionIngredientsQuery(v.id)),
  });

  // 전체 버전에 등장한 재료를 하나의 행 목록으로 합친다. 순서는 가장 먼저 등장한 버전에서의
  // sort_order를 기준으로 — 나중 버전에서만 추가된 재료는 그 뒤에 자연스럽게 붙는다.
  const sheetRows = useMemo(() => {
    const byIngredient = new Map<
      string,
      { name: string; firstSeenAt: number; sortOrder: number; byVersion: Map<string, VersionIngredientRow> }
    >();
    orderedVersions.forEach((v, vIdx) => {
      const rows = versionIngredientQueries[vIdx]?.data ?? [];
      rows.forEach((row) => {
        const key = row.ingredient_id;
        const existing = byIngredient.get(key);
        if (existing) {
          existing.byVersion.set(v.id, row);
        } else {
          byIngredient.set(key, {
            name: row.ingredients ? ingredientDisplayName(row.ingredients) : "—",
            firstSeenAt: vIdx,
            sortOrder: row.sort_order,
            byVersion: new Map([[v.id, row]]),
          });
        }
      });
    });
    return [...byIngredient.values()].sort(
      (a, b) => a.firstSeenAt - b.firstSeenAt || a.sortOrder - b.sortOrder,
    );
  }, [orderedVersions, versionIngredientQueries]);

  const sheetLoading = versionIngredientQueries.some((q) => q.isLoading);

  if (orderedVersions.length === 0) return null;

  if (sheetLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th className="label-caps px-3 py-2 text-xs text-muted-foreground">INGREDIENT</th>
            {orderedVersions.map((v) => (
              <th
                key={v.id}
                className="label-caps border-l border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex items-center gap-1">
                  <span>{versionLabel(v.version_number)}</span>
                  <StatusBadge status={v.status} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheetRows.map((row) => {
            let prevCell: VersionIngredientRow | undefined;
            return (
              <tr key={row.name + row.firstSeenAt} className="border-b border-border align-top">
                <td className="px-3 py-2">{row.name}</td>
                {orderedVersions.map((v, vIdx) => {
                  const cell = row.byVersion.get(v.id);
                  const isNew = vIdx === row.firstSeenAt;
                  const changed =
                    !isNew &&
                    cell &&
                    prevCell &&
                    (Number(cell.amount) !== Number(prevCell.amount) || cell.unit !== prevCell.unit);
                  const removed = !cell && prevCell != null;
                  if (cell) prevCell = cell;
                  return (
                    <td
                      key={v.id}
                      className={cn(
                        "border-l border-dashed border-border px-3 py-2 font-mono text-xs tabular-nums",
                        changed && "bg-secondary font-semibold",
                        isNew && "text-foreground",
                      )}
                    >
                      {cell ? (
                        <>
                          {fmtNumber(Number(cell.amount), 1)}
                          {cell.unit}
                          {isNew && (
                            <span className="label-caps ml-1 border border-foreground px-1 py-0.5 text-[9px]">
                              NEW
                            </span>
                          )}
                        </>
                      ) : removed ? (
                        <span className="text-muted-foreground line-through">삭제됨</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
