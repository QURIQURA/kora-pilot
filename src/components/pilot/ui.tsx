import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/lib/pilot";
import { readableTextColor } from "@/lib/pilot";

export const inputClass =
  "w-full min-h-[44px] border border-input bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-foreground";

export const selectClass = inputClass;

export const buttonClass =
  "label-caps inline-flex min-h-[44px] items-center justify-center border border-input bg-background px-4 py-2 text-foreground transition-colors hover:bg-secondary disabled:opacity-40";

export const primaryButtonClass =
  "label-caps inline-flex min-h-[44px] items-center justify-center border border-foreground bg-foreground px-4 py-2 text-background transition-colors hover:opacity-90 disabled:opacity-40";

export function SectionCard({
  title,
  action,
  subtitle,
  children,
  muted,
  bodyClassName,
}: {
  title: string;
  action?: ReactNode;
  /** 헤더 바로 아래, 스크롤되는 본문 밖에 항상 보이는 줄 — 예: 합계 표시(2026-09-23) */
  subtitle?: ReactNode;
  children?: ReactNode;
  muted?: boolean;
  /** 본문 영역에 추가할 클래스 — 예: 좁은 그리드 칸에서 내용이 길어지면 스크롤되도록 max-h + overflow-y-auto */
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "border border-border bg-card",
        muted && "border-dashed opacity-70"
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="label-caps text-muted-foreground">{title}</h2>
        {action}
      </header>
      {subtitle && (
        <div className="border-b border-dashed border-border bg-muted/30 px-3 py-1.5 font-mono text-xs tabular-nums text-foreground">
          {subtitle}
        </div>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="label-caps block text-xs text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const SOLID_STATUSES = ["ACTIVE", "TESTING", "RUNNING", "COMPLETE", "CURRENT"];
const DASHED_STATUSES = ["IDEA", "PLANNED", "DRAFT"];
const FADED_STATUSES = ["ARCHIVED", "CANCELLED", "FAILED", "SUPERSEDED"];

export function StatusBadge({ status }: { status: ProductStatus | string }) {
  const solid = SOLID_STATUSES.includes(status);
  const dashed = DASHED_STATUSES.includes(status);
  const faded = FADED_STATUSES.includes(status);
  return (
    <span
      className={cn(
        "label-caps inline-block border px-2 py-0.5 text-[11px]",
        solid && "border-foreground bg-foreground text-background",
        dashed && "border-dashed border-border text-foreground",
        faded && "border-border text-muted-foreground opacity-60",
        !solid && !dashed && !faded && "border-foreground text-foreground"
      )}
    >
      {status}
    </span>
  );
}

export function CategoryBadge({
  label,
  color,
}: {
  label: string;
  color?: string | null | undefined;
}) {
  if (!color) {
    return (
      <span className="label-caps text-xs text-muted-foreground">{label}</span>
    );
  }
  return (
    <span
      className="label-caps inline-block px-2 py-0.5 text-[11px]"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {label}
    </span>
  );
}

export function NextPhaseSection({ title }: { title: string }) {
  return (
    <SectionCard title={title} muted>
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        NEXT PHASE
      </p>
    </SectionCard>
  );
}

/** 접이식 섹션 — 부담스러운 긴 폼을 접어둘 때 사용 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-secondary",
          open && "border-b border-border"
        )}
      >
        <span className="label-caps text-muted-foreground">{title}</span>
        <span className="flex items-center gap-2">
          {badge}
          <span className="label-caps text-xs text-muted-foreground">
            {open ? "− CLOSE" : "+ OPEN"}
          </span>
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <h1 className="label-caps text-foreground">{title}</h1>
      {action}
    </div>
  );
}
