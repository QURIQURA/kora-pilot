import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "../../lib/utils";

export function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [expanded, setExpanded] = useState(false);

  const segments = buildSegments(pathname);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3 md:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm">
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;
            const isRoot = index === 0;

            if (!expanded && !isRoot && !isLast && segments.length > 3) {
              if (index === 1) {
                return (
                  <li key="ellipsis" className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="px-1 text-muted-foreground hover:text-foreground"
                      aria-label="Show full breadcrumb"
                    >
                      …
                    </button>
                    <span className="ml-2 text-muted-foreground">/</span>
                  </li>
                );
              }
              return null;
            }

            return (
              <li key={segment.path} className="flex items-center">
                <Link
                  to={segment.path}
                  className={cn(
                    "label-caps transition-colors",
                    isLast
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {segment.label}
                </Link>
                {!isLast && (
                  <span className="ml-2 text-muted-foreground">/</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

function buildSegments(pathname: string): { label: string; path: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  const segments: { label: string; path: string }[] = [{ label: "PILOT", path: "/" }];
  let currentPath = "";

  for (const part of parts) {
    currentPath += `/${part}`;
    segments.push({
      label: decodeURIComponent(part).replace(/-/g, " ").toUpperCase(),
      path: currentPath,
    });
  }

  return segments;
}
