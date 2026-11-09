import { popupStageLabel, readPopupStages } from "@/lib/popup-workflow";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readPopupPlan } from "@/lib/popup";
import { formatDateTime } from "@/lib/datetime";
import {
  pilotSettingsQuery,
  workSessionFormulaVersionsQuery,
  workSessionQuery,
  type OrderListRow,
} from "@/lib/queries";
import { invalidateProductionSync } from "@/lib/production-sync";
import { AddFormulaVersionForm } from "./WorkSessionWorkspace";
import { OrderComponentPlanRow } from "./OrderComponentPlanRow";
import { slotBoxClass } from "@/lib/slot-color";
import { removePlannedComponent } from "@/lib/production-plan-actions";
import { toast } from "sonner";
import { addProductComponentsToSession } from "@/lib/product-session-components";
import { buttonClass } from "./ui";

export function PopupProductionCard({ order }: { order: OrderListRow }) {
  const plan = readPopupPlan(order.popup_plan);
  const settings = useQuery(pilotSettingsQuery());
  return (
    <section className="space-y-3 border border-border bg-card p-3">
      <Link className="text-sm underline" to="/orders/$orderId" params={{ orderId: order.id }}>
        {order.order_number} · POP UP · {plan.title}
      </Link>
      <p className="text-xs text-muted-foreground">
        {order.pickup_at ? formatDateTime(order.pickup_at) : "일정 미지정"} · {plan.location}
      </p>
      {plan.items.map((item) => (
        <div key={item.id} className="space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span>
              {item.label} · 준비 {item.ready_quantity}/{item.quantity} {item.unit}
            </span>
            {item.work_session_id && (
              <Link
                className="text-xs underline"
                to="/production/$sessionId"
                params={{ sessionId: item.work_session_id }}
              >
                생산 세션 →
              </Link>
            )}
          </div>
          {item.work_session_id && (
            <PopupItemProduction
              sessionId={item.work_session_id}
              productId={item.product_id}
              readOnly={order.status === "COMPLETED"}
            />
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        준비 체크 {plan.checklist.filter((c) => c.done).length}/{plan.checklist.length} ·{" "}
        {popupStageLabel(plan, order.status, readPopupStages(settings.data?.popup_workflow))}
      </p>
      <Link className={buttonClass} to="/orders/$orderId" params={{ orderId: order.id }}>
        POP UP DETAIL · 품목별 세션 준비
      </Link>
    </section>
  );
}
function PopupItemProduction({
  sessionId,
  productId,
  readOnly,
}: {
  sessionId: string;
  productId: string;
  readOnly: boolean;
}) {
  const client = useQueryClient();
  const rows = useQuery(workSessionFormulaVersionsQuery(sessionId));
  const session = useQuery(workSessionQuery(sessionId));
  const locked =
    readOnly ||
    session.isLoading ||
    session.isError ||
    session.data?.status === "COMPLETED" ||
    session.data?.status === "CANCELLED";
  const [adding, setAdding] = useState(false);
  // 제품이 연결된 품목은 제품에 저장된 하위 컴포넌트를 세션에 불러온다 — 세션이 비어 있으면 자동으로 한 번,
  // 이후엔 "제품 컴포넌트 불러오기" 버튼으로(이미 있는 건 건너뜀).
  const loadProduct = useMutation({
    mutationFn: () => addProductComponentsToSession(client, sessionId, productId),
    onSettled: () => void invalidateProductionSync(client),
  });
  const removeRow = useMutation({
    mutationFn: (row: NonNullable<typeof rows.data>[number]) => removePlannedComponent(row),
    onSuccess: (warning) => {
      if (warning) toast.error(warning);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => void invalidateProductionSync(client),
  });
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !productId || locked || !rows.isSuccess) return;
    autoTried.current = true;
    if ((rows.data ?? []).length === 0) loadProduct.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.isSuccess, locked, productId]);
  return (
    <div className="space-y-2">
      {rows.isError && (
        <p role="alert" className="text-xs text-destructive">
          생산 구성을 불러오지 못했습니다.
        </p>
      )}
      {(rows.data ?? []).map((row) => (
        <div key={row.id} className={`border p-2 ${slotBoxClass(row.slot)}`}>
          <OrderComponentPlanRow row={row} disabled={locked} />
          {!locked && (
            <div className="mt-1 text-right">
              <button
                type="button"
                title="이 품목에서 컴포넌트 삭제"
                className="border border-border px-1.5 font-mono text-[11px] leading-5 text-muted-foreground hover:border-destructive hover:text-destructive"
                disabled={removeRow.isPending}
                onClick={() => {
                  const name =
                    row.formula_versions.formulas.components?.name ??
                    row.formula_versions.formulas.name;
                  if (
                    confirm(
                      `${name} 지정을 삭제할까요? 예정 블록도 제거되며 원본 레시피는 유지됩니다.`,
                    )
                  )
                    removeRow.mutate(row);
                }}
              >
                {removeRow.isPending ? "…" : "✕ 삭제"}
              </button>
            </div>
          )}
        </div>
      ))}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          {productId && (
            <button
              type="button"
              className={buttonClass}
              disabled={loadProduct.isPending}
              onClick={() => loadProduct.mutate()}
            >
              {loadProduct.isPending ? "불러오는 중…" : "제품 컴포넌트 불러오기"}
            </button>
          )}
          <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
            {adding ? "닫기" : "+ 생산 컴포넌트 지정"}
          </button>
        </div>
      )}
      {loadProduct.isError && (
        <p role="alert" className="text-xs text-destructive">
          {(loadProduct.error as Error).message}
        </p>
      )}
      {loadProduct.isSuccess && loadProduct.data === 0 && (rows.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">
          이 제품에 불러올 수 있는 하위 컴포넌트가 없어요(컴포넌트 연결·레시피·기법 분류 확인).
        </p>
      )}
      {adding && !locked && (
        <AddFormulaVersionForm
          sessionId={sessionId}
          nextSort={rows.data?.length ?? 0}
          kind="CORE"
          onDone={() => {
            setAdding(false);
            void invalidateProductionSync(client);
          }}
        />
      )}
    </div>
  );
}
