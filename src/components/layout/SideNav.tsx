import { Link } from "@tanstack/react-router";
import { cn } from "../../lib/utils";
import { DIETARY_ASSEMBLY_ENABLED } from "../../lib/feature-flags";

const TOP_ITEMS = [
  { label: "DASHBOARD", to: "/" },
  { label: "ORDERS", to: "/orders" },
  { label: "CUSTOMERS", to: "/customers" },
  { label: "PRODUCTS", to: "/products" },
  { label: "COMPONENTS", to: "/components" },
  { label: "FORMULAS", to: "/formulas" },
  ...(DIETARY_ASSEMBLY_ENABLED ? [{ label: "DIETARY", to: "/dietary" }] : []),
  { label: "COST", to: "/cost" },
  { label: "PRODUCTION", to: "/production" },
  { label: "DESIGN BOARD", to: "/design-moodboard" },
  { label: "EFFICIENCY", to: "/efficiency" },
  { label: "INVENTORY", to: "/inventory" },
  { label: "INGREDIENTS", to: "/ingredients" },
  { label: "REFERENCES", to: "/references" },
] as const;

export function SideNav({
  onNavigate,
  onCollapse,
  collapseLabel = "◂ 숨기기",
  onPin,
  pinLabel,
}: {
  onNavigate?: () => void;
  /** 데스크톱: 메뉴 숨기기(또는 서랍 닫기) 버튼 */
  onCollapse?: () => void;
  collapseLabel?: string;
  /** 서랍 상태에서 "항상 펼치기"로 되돌리는 버튼 */
  onPin?: () => void;
  pinLabel?: string;
}) {
  return (
    <nav className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <Link
          to="/"
          className="label-caps block text-foreground hover:text-muted-foreground"
          onClick={onNavigate}
        >
          PILOT
        </Link>
        <div className="flex items-center gap-2">
          {onPin && pinLabel && (
            <button
              type="button"
              onClick={onPin}
              className="label-caps text-[10px] text-muted-foreground hover:text-foreground"
            >
              {pinLabel}
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="메뉴 숨기기"
              className="label-caps text-[10px] text-muted-foreground hover:text-foreground"
            >
              {collapseLabel}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1.5">
        <ul className="space-y-px px-1.5">
          {TOP_ITEMS.map((item) => (
            <li key={item.to}>
              <NavItem item={item} onClick={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border p-1.5">
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
      className={cn("label-caps block px-2.5 py-1.5 transition-colors", "min-h-[30px] content-center")}
    >
      {item.label}
    </Link>
  );
}
