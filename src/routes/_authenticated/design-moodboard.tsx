import { createFileRoute } from "@tanstack/react-router";
import { DesignMoodboardSection } from "@/components/pilot/OrderMoodboardSection";
import { PageHeader } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/design-moodboard")({
  head: () => ({
    meta: [
      { title: "PILOT — Design Mood Board" },
      { name: "description", content: "Signature design mood board" },
      { property: "og:title", content: "PILOT — Design Mood Board" },
      { property: "og:description", content: "Signature design mood board" },
    ],
  }),
  component: DesignMoodboardPage,
});

/** 시그니처 디자인 무드보드(2026-11-08) — 오더 하위가 아닌 독립 보드. 기능은 오더 무드보드와 동일. */
function DesignMoodboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="DESIGN MOOD BOARD" />
      <DesignMoodboardSection />
    </div>
  );
}
