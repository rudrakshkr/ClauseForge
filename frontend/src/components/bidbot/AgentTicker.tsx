const activity = "✦ [Parser Node] Ingesting GovTech_RFP.pdf ... ✦ [Vector Store] 12,480 chunks indexed ...";

export function AgentTicker() {
  return (
    <div aria-label="Live Agent Swarm — simulated activity" className="agent-ticker mt-8 overflow-hidden border-y border-border py-3 font-mono text-xs uppercase tracking-widest text-stream-muted">
      <div className="agent-ticker-track flex w-max">
        <span className="shrink-0 whitespace-nowrap pr-12">{activity}</span>
        <span aria-hidden="true" className="shrink-0 whitespace-nowrap pr-12">{activity}</span>
      </div>
    </div>
  );
}
