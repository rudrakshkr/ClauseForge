import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Landing } from "@/components/bidbot/Landing";
import {
  TransitionCoin,
  type CoinOrigin,
} from "@/components/bidbot/TransitionCoin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BidBot AI — Multi-Agent RFP Grant Writer" },
      {
        name: "description",
        content:
          "BidBot uses a multi-agent swarm to ingest dense RFPs, retrieve verified evidence, and draft compliant proposals in minutes.",
      },
      {
        property: "og:title",
        content: "BidBot AI — Win Bids on Autopilot",
      },
      {
        property: "og:description",
        content:
          "Multi-agent RFP drafting with adversarial compliance review and human sign-off.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState<CoinOrigin | null>(null);
  const [covered, setCovered] = useState(false);

  const launch = (position: CoinOrigin) => {
    if (origin) return;
    setOrigin(position);
  };

  const showDashboard = useCallback(() => {
    setCovered(true);
    window.scrollTo(0, 0);
  }, []);

  const finishLaunch = useCallback(() => {
    navigate({ to: "/dashboard" });
    setCovered(false);
    setOrigin(null);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Landing
        onLaunch={launch}
        launching={origin !== null}
      />

      {origin && (
        <TransitionCoin
          origin={origin}
          onCovered={showDashboard}
          onComplete={finishLaunch}
        />
      )}

      {covered && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 bg-transition-white"
        />
      )}
    </div>
  );
}
