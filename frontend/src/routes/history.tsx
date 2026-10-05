import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/components/bidbot/HistoryPage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "BidBot AI — Bid History" },
      {
        name: "description",
        content:
          "Persistent BidBot archive of completed RFP proposals and compliance results.",
      },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  return <HistoryPage />;
}
