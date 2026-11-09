import { cn } from "../lib/utils";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  message,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center gap-3 border border-border bg-card p-4 md:p-5",
        className
      )}
    >
      <p className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
        {message}
      </p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="label-caps min-h-[30px] border border-input bg-background px-3 py-1 text-foreground transition-colors hover:bg-secondary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
