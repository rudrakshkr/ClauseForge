const activity = [
  {
    text: "✦ [Agent 1 • Parser] Full-page RFP scan",
    tone: "text-emerald-400",
  },
  {
    text: "✓ [Agent 2 • Evidence KB] 10 verified records",
    tone: "text-emerald-400",
  },
  {
    text: "✦ [Agent 3 • Drafter] Evidence-backed proposal",
    tone: "text-foreground",
  },
  {
    text: "✦ [Agent 4 • Critic] Clause-level adversarial audit",
    tone: "text-foreground",
  },
  {
    text: "✓ [Human Gate] Export locked until approval",
    tone: "text-emerald-400",
  },
];

export function AgentTicker() {
  return (
    <div
      aria-label="BidBot agent pipeline"
      className="agent-ticker mt-8 overflow-hidden border-y border-border py-3"
    >
      <div className="agent-ticker-track flex w-max font-mono text-[10px] uppercase tracking-[0.16em]">
        {[...activity, ...activity].map(
          (item, index) => (
            <span
              key={`${item.text}-${index}`}
              className={`shrink-0 whitespace-nowrap pr-12 ${item.tone}`}
            >
              {item.text}
            </span>
          ),
        )}
      </div>
    </div>
  );
}