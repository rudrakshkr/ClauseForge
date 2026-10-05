import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/components/clauseforge/HistoryPage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "ClauseForge AI — Bid History" },
      {
        name: "description",
        content:
          "Persistent ClauseForge archive of completed RFP proposals and compliance results.",
      },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  return <HistoryPage />;
}
