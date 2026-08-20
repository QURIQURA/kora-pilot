import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useBreadcrumbSegments, type CrumbSegment } from "./breadcrumb-context";

export function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const override = useBreadcrumbSegments();
  const [expanded, setExpanded] = useState(false);

  const segments: CrumbSegment[] = override ?? buildSegments(pathname);

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

            const className = cn(
              "label-caps transition-colors",
              isLast
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            );

            return (
              <li key={`${segment.label}-${index}`} className="flex items-center">
                {segment.path ? (
                  <Link to={segment.path} className={className}>
                    {segment.label}
                  </Link>
                ) : (
                  <span className={className}>{segment.label}</span>
                )}
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

function buildSegments(pathname: string): CrumbSegment[] {
  const parts = pathname.split("/").filter(Boolean);
  const segments: CrumbSegment[] = [{ label: "PILOT", path: "/" }];
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
