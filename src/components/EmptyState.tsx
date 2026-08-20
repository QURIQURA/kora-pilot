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
        "flex flex-col items-start justify-center gap-4 border border-border bg-card p-6 md:p-8",
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
          className="label-caps min-h-[48px] border border-input bg-background px-4 py-2 text-foreground transition-colors hover:bg-secondary"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
