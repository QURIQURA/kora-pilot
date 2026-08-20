import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "PILOT — Settings" },
      { name: "description", content: "PILOT settings" },
      { property: "og:title", content: "PILOT — Settings" },
      { property: "og:description", content: "PILOT settings" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="label-caps text-foreground">SETTINGS</h1>
      </div>
      <p className="font-mono text-sm text-muted-foreground">
        Settings will be available in a later phase.
      </p>
    </div>
  );
}
