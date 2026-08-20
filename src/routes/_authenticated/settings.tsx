import { createFileRoute } from "@tanstack/react-router";
import { CategoryManager } from "@/components/pilot/CategoryManager";
import { TagManager } from "@/components/pilot/TagManager";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "PILOT — Settings" },
      { name: "description", content: "PILOT settings: categories and tags" },
      { property: "og:title", content: "PILOT — Settings" },
      {
        property: "og:description",
        content: "PILOT settings: categories and tags",
      },
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
      <CategoryManager />
      <TagManager />
    </div>
  );
}

