import { createFileRoute } from "@tanstack/react-router";
import { WorkSessionWorkspace } from "@/components/pilot/WorkSessionWorkspace";

export const Route = createFileRoute("/_authenticated/production/$sessionId")({
  head: () => ({
    meta: [
      { title: "PILOT — Work Session" },
      { name: "description", content: "Production / weighing work session" },
    ],
  }),
  component: WorkSessionPage,
});

function WorkSessionPage() {
  const { sessionId } = Route.useParams();
  return <WorkSessionWorkspace sessionId={sessionId} />;
}
