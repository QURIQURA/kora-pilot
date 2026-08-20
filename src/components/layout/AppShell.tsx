import { Outlet } from "@tanstack/react-router";
import { SideNav } from "./SideNav";
import { Breadcrumb } from "./Breadcrumb";
import { MobileHeader } from "./MobileHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-body text-foreground md:flex-row">
      <MobileHeader />
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <SideNav />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Breadcrumb />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
