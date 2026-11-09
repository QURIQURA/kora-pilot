import { useEffect, useState, type ReactNode } from "react";
import { SideNav } from "./SideNav";
import { Breadcrumb } from "./Breadcrumb";
import { MobileHeader } from "./MobileHeader";
import { BreadcrumbProvider } from "./breadcrumb-context";

const STORAGE_KEY = "pilot.sidebar.collapsed";

/** 데스크톱 왼쪽 메뉴를 숨겼는지 — 브라우저에 기억한다(저장소를 못 쓰면 항상 펼침). */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* 저장소를 못 쓰는 환경 — 기본값 유지 */
    }
  }, []);
  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 무시 */
    }
  };
  return [collapsed, set] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  // 숨긴 상태에서 MENU를 누르면 화면 위로 잠깐 펼쳐지는 서랍(바깥을 누르거나 이동하면 닫힘)
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <BreadcrumbProvider>
      <div className="flex min-h-screen flex-col bg-background font-body text-foreground md:flex-row">
        <MobileHeader />
        {!collapsed && (
          <aside className="hidden w-48 shrink-0 flex-col border-r border-border bg-background md:sticky md:top-0 md:flex md:h-screen">
            <SideNav onCollapse={() => setCollapsed(true)} />
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-stretch">
            {collapsed && (
              <button
                type="button"
                aria-label="메뉴 열기"
                className="label-caps hidden shrink-0 border-b border-r border-border px-3 hover:bg-secondary md:block"
                onClick={() => setDrawer(true)}
              >
                ☰ MENU
              </button>
            )}
            <div className="min-w-0 flex-1">
              <Breadcrumb />
            </div>
          </div>
          <div className="flex-1 p-3 md:p-4">{children}</div>
        </main>
        {collapsed && drawer && (
          <div className="fixed inset-0 z-50 hidden md:flex">
            <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-background shadow-lg">
              <SideNav
                onNavigate={() => setDrawer(false)}
                onCollapse={() => {
                  setDrawer(false);
                }}
                collapseLabel="CLOSE ✕"
                pinLabel="항상 펼치기"
                onPin={() => {
                  setCollapsed(false);
                  setDrawer(false);
                }}
              />
            </aside>
            <button
              type="button"
              aria-label="메뉴 닫기"
              className="flex-1 bg-foreground/30"
              onClick={() => setDrawer(false)}
            />
          </div>
        )}
      </div>
    </BreadcrumbProvider>
  );
}
