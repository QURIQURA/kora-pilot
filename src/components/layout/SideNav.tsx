import { Link } from "@tanstack/react-router";
import { cn } from "../../lib/utils";

const TOP_ITEMS = [
  { label: "DASHBOARD", to: "/" },
  { label: "PRODUCTS", to: "/products" },
  { label: "COMPONENTS", to: "/components" },
  { label: "FORMULAS", to: "/formulas" },
  { label: "EXPERIMENTS", to: "/experiments" },
  { label: "KNOWLEDGE", to: "/knowledge" },
  { label: "INGREDIENTS", to: "/ingredients" },
  { label: "REFERENCES", to: "/references" },
] as const;

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <Link
          to="/"
          className="label-caps block text-foreground hover:text-muted-foreground"
          onClick={onNavigate}
        >
          PILOT
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <ul className="space-y-0.5 px-2">
          {TOP_ITEMS.map((item) => (
            <li key={item.to}>
              <NavItem item={item} onClick={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border p-2">
        <NavItem item={{ label: "SETTINGS", to: "/settings" }} onClick={onNavigate} />
      </div>
    </nav>
  );
}

function NavItem({
  item,
  onClick,
}: {
  item: { label: string; to: string };
  onClick?: (() => void) | undefined;
}) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      activeOptions={{ exact: item.to === "/" }}
      activeProps={{ className: "bg-foreground text-background" }}
      inactiveProps={{ className: "text-foreground hover:bg-secondary" }}
      className={cn(
        "label-caps block px-3 py-3 transition-colors",
        "min-h-[48px] content-center"
      )}
    >
      {item.label}
    </Link>
  );
}
