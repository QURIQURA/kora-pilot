import { useState } from "react";
import { SideNav } from "./SideNav";

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
        <span className="label-caps">PILOT</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label-caps min-h-[48px] px-3 text-foreground"
          aria-label="Open navigation"
        >
          MENU
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
          <div className="flex items-center justify-between border-b border-border p-3">
            <span className="label-caps">PILOT</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="label-caps min-h-[48px] px-3 text-foreground"
              aria-label="Close navigation"
            >
              CLOSE
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
