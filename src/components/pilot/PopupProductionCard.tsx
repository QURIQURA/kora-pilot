import { popupStageLabel, readPopupStages } from "@/lib/popup-workflow";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
function PopupItemProduction({ sessionId, readOnly }: { sessionId: string; readOnly: boolean }) {
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
  return (
    <div className="space-y-2">
      {rows.isError && (
        <p role="alert" className="text-xs text-destructive">
          생산 구성을 불러오지 못했습니다.
        </p>
      )}
      {(rows.data ?? []).map((row) => (
        <OrderComponentPlanRow key={row.id} row={row} disabled={locked} />
      ))}
      {!locked && (
        <button type="button" className={buttonClass} onClick={() => setAdding((v) => !v)}>
          {adding ? "닫기" : "+ 생산 컴포넌트 지정"}
        </button>
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
