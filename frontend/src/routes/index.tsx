import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Landing } from "@/components/bidbot/Landing";
import { Dashboard } from "@/components/bidbot/Dashboard";
import { TransitionCoin, type CoinOrigin } from "@/components/bidbot/TransitionCoin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BidBot AI — Multi-Agent RFP Grant Writer" },
      {
        name: "description",
        content:
          "BidBot uses a multi-agent swarm to ingest dense RFPs, search past data, and draft compliant proposals in minutes.",
      },
      { property: "og:title", content: "BidBot AI — Win Bids on Autopilot" },
      {
        property: "og:description",
        content: "Multi-agent RFP drafting with adversarial compliance review and human sign-off.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [view, setView] = useState<"landing" | "dashboard">("landing");
  const [origin, setOrigin] = useState<CoinOrigin | null>(null);
  const [covered, setCovered] = useState(false);

  const launch = (position: CoinOrigin) => {
    if (origin) return;
    setOrigin(position);
  };
  const showDashboard = useCallback(() => {
    setCovered(true);
    setView("dashboard");
    window.scrollTo(0, 0);
  }, []);
  const finishLaunch = useCallback(() => {
    setCovered(false);
    setOrigin(null);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {view === "landing" ? (
        <Landing onLaunch={launch} launching={origin !== null} />
      ) : (
        <Dashboard onBack={() => setView("landing")} />
      )}
      {origin && <TransitionCoin origin={origin} onCovered={showDashboard} onComplete={finishLaunch} />}
      {covered && <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 bg-transition-white" />}
    </div>
  );
}
