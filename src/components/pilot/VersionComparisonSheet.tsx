import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { versionIngredientsQuery, type VersionIngredientRow } from "@/lib/queries";
import { fmtNumber, versionLabel } from "@/lib/formula";
import { ingredientDisplayName } from "@/lib/pilot";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./ui";

const DEFAULT_COL_WIDTH = 140;
const MIN_COL_WIDTH = 72;
const DEFAULT_ROW_HEIGHT = 40;
const MIN_ROW_HEIGHT = 28;

interface CellFlags {
  isNew: boolean;
  changed: boolean;
  removed: boolean;
}

interface SheetRow {
  id: string; // ingredient_id — 재료 단위 안정적인 키(드래그 재정렬/높이 조절용)
  name: string;
  firstSeenAt: number;
  sortOrder: number;
  byVersion: Map<string, VersionIngredientRow>;
  // NEW/변경됨/삭제됨 표시는 항상 버전의 실제 시간 순서(오래된→최신) 기준으로 미리 계산해둔다 —
  // 화면에서 열 순서를 드래그로 바꿔도(display order) 이 표시는 흔들리지 않게 하기 위함.
  flags: Map<string, CellFlags>;
}

/** VersionHistory(Formula 상세 페이지)와 CurrentFormulaPanel(Component 페이지)이 함께 쓰는
 * "버전 비교 엑셀 시트" — 이 Formula의 모든 버전을 열로 나란히 두고 재료별로 뭐가
 * 달라졌는지/추가됐는지/삭제됐는지 한눈에 보여준다. 읽기 전용(재료 값 수정은 항상 Formula
 * 상세 페이지에서) — 다만 실제 엑셀처럼 행/열을 드래그로 재배치하거나 크기를 조절하는 것은
 * 이 화면 자체의 "보기 편의" 기능이라 지원한다. 순서/크기는 이 화면 세션 안에서만 유지되고
 * 저장되지 않는다(재료 자체의 process 순서는 Formula 페이지의 드래그 재정렬이 소스).
 */
export function VersionComparisonSheet({
  versions,
}: {
  versions: { id: string; version_number: number; status: string }[];
}) {
  // 버전 순서(오래된 → 최신)로 정렬 — 데이터 자체의 기본 순서. 사용자가 드래그하면
  // columnOrder가 이 기본 순서를 오버라이드한다.
  const baseVersions = useMemo(
    () => [...versions].sort((a, b) => a.version_number - b.version_number),
    [versions],
  );

  // 모든 버전의 재료를 한번에 조회 — 버전 개수가 가변이라 useQueries 사용
  const versionIngredientQueries = useQueries({
    queries: baseVersions.map((v) => versionIngredientsQuery(v.id)),
  });

  // 전체 버전에 등장한 재료를 하나의 행 목록으로 합친다. 순서는 가장 먼저 등장한 버전에서의
  // sort_order를 기준으로 — 나중 버전에서만 추가된 재료는 그 뒤에 자연스럽게 붙는다.
  const baseRows = useMemo<SheetRow[]>(() => {
    const byIngredient = new Map<string, SheetRow>();
    baseVersions.forEach((v, vIdx) => {
      const rows = versionIngredientQueries[vIdx]?.data ?? [];
      rows.forEach((row) => {
        const key = row.ingredient_id;
        const existing = byIngredient.get(key);
        if (existing) {
          existing.byVersion.set(v.id, row);
        } else {
          byIngredient.set(key, {
            id: key,
            name: row.ingredients ? ingredientDisplayName(row.ingredients) : "—",
            firstSeenAt: vIdx,
            sortOrder: row.sort_order,
            byVersion: new Map([[v.id, row]]),
            flags: new Map(),
          });
        }
      });
    });
    // NEW/변경됨/삭제됨 플래그를 버전의 실제 시간 순서로 한 번 계산해둔다.
    for (const sheetRow of byIngredient.values()) {
      let prevCell: VersionIngredientRow | undefined;
      baseVersions.forEach((v, vIdx) => {
        const cell = sheetRow.byVersion.get(v.id);
        const isNew = vIdx === sheetRow.firstSeenAt && vIdx > 0;
        const changed =
          !isNew &&
          !!cell &&
          !!prevCell &&
          (Number(cell.amount) !== Number(prevCell.amount) || cell.unit !== prevCell.unit);
        const removed = !cell && prevCell != null;
        sheetRow.flags.set(v.id, { isNew, changed, removed });
        if (cell) prevCell = cell;
      });
    }
    return [...byIngredient.values()].sort(
      (a, b) => a.firstSeenAt - b.firstSeenAt || a.sortOrder - b.sortOrder,
    );
  }, [baseVersions, versionIngredientQueries]);

  const sheetLoading = versionIngredientQueries.some((q) => q.isLoading);

  // 실제 엑셀처럼 열(버전)과 행(재료) 순서를 드래그로 바꿀 수 있다. 이 화면을 다시 열면
  // 초기화되는 세션 전용 상태 — DB에는 아무것도 쓰지 않는다.
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  // 데이터가 바뀌면(버전/재료 추가·삭제) 순서 목록을 맞춰준다 — 기존에 정해둔 순서는
  // 최대한 유지하고, 새로 생긴 항목만 뒤에 붙이고 사라진 항목은 뺀다.
  useEffect(() => {
    setColumnOrder((prev) => {
      const ids = baseVersions.map((v) => v.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [baseVersions]);

  useEffect(() => {
    setRowOrder((prev) => {
      const ids = baseRows.map((r) => r.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [baseRows]);

  const displayVersions = useMemo(() => {
    const byId = new Map(baseVersions.map((v) => [v.id, v]));
    return columnOrder.map((id) => byId.get(id)).filter((v): v is (typeof baseVersions)[number] => !!v);
  }, [baseVersions, columnOrder]);

  const displayRows = useMemo(() => {
    const byId = new Map(baseRows.map((r) => [r.id, r]));
    return rowOrder.map((id) => byId.get(id)).filter((r): r is SheetRow => !!r);
  }, [baseRows, rowOrder]);

  const colSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const rowSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRowOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const startColumnResize = (versionId: string, startX: number) => {
    const startWidth = colWidths[versionId] ?? DEFAULT_COL_WIDTH;
    const onMove = (e: PointerEvent) => {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [versionId]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startRowResize = (rowId: string, startY: number) => {
    const startHeight = rowHeights[rowId] ?? DEFAULT_ROW_HEIGHT;
    const onMove = (e: PointerEvent) => {
      const next = Math.max(MIN_ROW_HEIGHT, startHeight + (e.clientY - startY));
      setRowHeights((prev) => ({ ...prev, [rowId]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (baseVersions.length === 0) return null;

  if (sheetLoading) {
    return <p className="font-mono text-xs uppercase text-muted-foreground">LOADING…</p>;
  }

  return (
    <div className="overflow-x-auto border border-border">
      <table
        className="w-full border-collapse text-sm"
        style={{ tableLayout: "fixed", minWidth: 220 + displayVersions.length * DEFAULT_COL_WIDTH }}
      >
        <colgroup>
          <col style={{ width: 180 }} />
          {displayVersions.map((v) => (
            <col key={v.id} style={{ width: colWidths[v.id] ?? DEFAULT_COL_WIDTH }} />
          ))}
        </colgroup>
        <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <th className="label-caps px-3 py-2 text-xs text-muted-foreground">INGREDIENT</th>
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                {displayVersions.map((v) => (
                  <SheetColumnHeader
                    key={v.id}
                    id={v.id}
                    label={versionLabel(v.version_number)}
                    status={v.status}
                    onResizeStart={(clientX) => startColumnResize(v.id, clientX)}
                  />
                ))}
              </SortableContext>
            </tr>
          </thead>
        </DndContext>
        <DndContext sensors={rowSensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd}>
          <SortableContext items={rowOrder} strategy={verticalListSortingStrategy}>
            <tbody>
              {displayRows.map((row) => (
                <SheetBodyRow
                  key={row.id}
                  row={row}
                  versions={displayVersions}
                  height={rowHeights[row.id] ?? DEFAULT_ROW_HEIGHT}
                  onResizeStart={(clientY) => startRowResize(row.id, clientY)}
                />
              ))}
            </tbody>
          </SortableContext>
        </DndContext>
      </table>
    </div>
  );
}

function SheetColumnHeader({
  id,
  label,
  status,
  onResizeStart,
}: {
  id: string;
  label: string;
  status: string;
  onResizeStart: (clientX: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <th
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "label-caps relative border-l border-dashed border-border px-3 py-2 text-xs text-muted-foreground",
        isDragging && "relative z-10 bg-secondary",
      )}
    >
      <div className="flex items-center gap-1">
        {/* 열(버전) 드래그 손잡이 — 실제 엑셀처럼 컬럼 순서를 바꿀 수 있게 */}
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span>{label}</span>
        <StatusBadge status={status} />
      </div>
      {/* 열 너비 조절 손잡이 — 오른쪽 경계를 드래그 */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-foreground/20"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeStart(e.clientX);
        }}
      />
    </th>
  );
}

function SheetBodyRow({
  row,
  versions,
  height,
  onResizeStart,
}: {
  row: SheetRow;
  versions: { id: string; version_number: number; status: string }[];
  height: number;
  onResizeStart: (clientY: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  return (
    <tr
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition, height }}
      className={cn(
        "relative border-b border-border align-top",
        isDragging && "relative z-10 bg-background shadow-md",
      )}
    >
      <td className="relative px-3 py-2" style={{ height }}>
        <div className="flex items-center gap-1.5">
          {/* 행(재료) 드래그 손잡이 — 실제 엑셀처럼 행 순서를 바꿀 수 있게 */}
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </button>
          <span>{row.name}</span>
        </div>
        {/* 행 높이 조절 손잡이 — 아래쪽 경계를 드래그 */}
        <div
          role="separator"
          aria-orientation="horizontal"
          className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize touch-none hover:bg-foreground/20"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(e.clientY);
          }}
        />
      </td>
      {versions.map((v) => {
        const cell = row.byVersion.get(v.id);
        const { isNew, changed, removed } = row.flags.get(v.id) ?? {
          isNew: false,
          changed: false,
          removed: false,
        };
        return (
          <td
            key={v.id}
            style={{ height }}
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
}
