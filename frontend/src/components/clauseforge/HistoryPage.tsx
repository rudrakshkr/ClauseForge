import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  History as HistoryIcon,
  Trash2,
} from "lucide-react";
import { spring } from "@/components/clauseforge/motion";
import { useNavigate } from "@tanstack/react-router";

type Requirement = {
  clause_id: string;
  description: string;
  is_mandatory: boolean;
};

type CriticFlag = {
  clause_id: string;
  status: string;
  severity: string;
  issue: string;
  suggestion: string;
};

type EvidenceRecord = {
  requirement_id: string;
  source_id: string;
  source_type: string;
  title: string;
  content: string;
  relevance_score: number;
};

type BidHistoryItem = {
  id: string;
  fileName: string;
  projectTitle: string;
  createdAt: string;
  updatedAt: string;
  initialScore: number;
  finalScore: number;
  requirements: Requirement[];
  evidence: EvidenceRecord[];
  criticFlags: CriticFlag[];
  draftText: string;
};

const BID_HISTORY_KEY = "clauseforge-active-bids";
const OPEN_BID_KEY = "clauseforge-open-bid-id";

function readHistory(): BidHistoryItem[] {
  try {
    const stored = localStorage.getItem(BID_HISTORY_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? (parsed as BidHistoryItem[])
      : [];
  } catch (error) {
    console.error("Failed to load bid history:", error);
    return [];
  }
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [bidHistory, setBidHistory] = useState<BidHistoryItem[]>([]);

  useEffect(() => {
    setBidHistory(readHistory());
  }, []);

  const deleteBid = (bidId: string) => {
    const updated = bidHistory.filter(
      (bid) => bid.id !== bidId,
    );

    setBidHistory(updated);
    localStorage.setItem(
      BID_HISTORY_KEY,
      JSON.stringify(updated),
    );
  };

  const openBid = (bidId: string) => {
    sessionStorage.setItem(OPEN_BID_KEY, bidId);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Workspace
          </button>

          <span className="h-4 w-px shrink-0 bg-border" />

          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-accent" />
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Bid History
            </span>
          </div>
        </div>

        <span className="font-mono text-xs text-muted-foreground">
          {bidHistory.length} saved bid{bidHistory.length === 1 ? "" : "s"}
        </span>
      </header>

      <main className="clauseforge-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                Persistent Workspace Archive
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Saved bids
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Completed bids are stored locally in this browser and can be reopened without rerunning the agent swarm.
              </p>
            </div>
          </div>

          {bidHistory.length === 0 ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border">
              <div className="max-w-sm text-center">
                <HistoryIcon className="mx-auto h-7 w-7 text-muted-foreground" />
                <h2 className="mt-4 text-base font-semibold">
                  No saved bids yet
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Run an RFP through the complete swarm and the finished bid will appear here automatically.
                </p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="mt-5 inline-flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Workspace
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bidHistory.map((bid, index) => {
                const reviewCount = bid.criticFlags.length;
                const scoreImprovement =
                  bid.finalScore - bid.initialScore;
                const mandatoryCount = bid.requirements.filter(
                  (requirement) => requirement.is_mandatory,
                ).length;
                const evidenceCount = bid.evidence.length;

                return (
                  <motion.article
                    key={bid.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: index * 0.03 }}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="border-b border-border bg-background px-6 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-accent">
                              Bid {index + 1}
                            </span>
                            <span
                              className={[
                                "rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-widest",
                                reviewCount > 0
                                  ? "border-yellow-400/20 text-yellow-400"
                                  : "border-accent/20 text-accent",
                              ].join(" ")}
                            >
                              {reviewCount > 0
                                ? `${reviewCount} review${reviewCount === 1 ? "" : "s"}`
                                : "Ready"}
                            </span>
                          </div>

                          <h2 className="mt-3 truncate text-lg font-semibold">
                            {bid.projectTitle}
                          </h2>
                          <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {bid.fileName}
                          </p>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Final Score
                            </p>
                            <p className="mt-2 text-lg font-semibold">
                              {bid.finalScore}
                              <span className="text-xs text-muted-foreground">/100</span>
                            </p>
                          </div>
                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Initial
                            </p>
                            <p className="mt-2 text-lg font-semibold">
                              {bid.initialScore}
                            </p>
                          </div>
                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Revision Impact
                            </p>
                            <p
                              className={[
                                "mt-2 text-lg font-semibold",
                                scoreImprovement > 0
                                  ? "text-accent"
                                  : "text-foreground",
                              ].join(" ")}
                            >
                              {scoreImprovement > 0 ? "+" : ""}
                              {scoreImprovement}
                            </p>
                          </div>
                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Evidence
                            </p>
                            <p className="mt-2 text-lg font-semibold">
                              {evidenceCount}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
                      <div className="bg-card p-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                          Mandatory Clauses
                        </p>
                        <p className="mt-2 text-sm font-semibold">
                          {mandatoryCount}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                          Needs Review
                        </p>
                        <p
                          className={[
                            "mt-2 text-sm font-semibold",
                            reviewCount > 0
                              ? "text-yellow-400"
                              : "text-accent",
                          ].join(" ")}
                        >
                          {reviewCount}
                        </p>
                      </div>
                      <div className="bg-card p-4">
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                          Saved
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {new Date(bid.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        {reviewCount > 0 ? (
                          <p className="truncate text-xs text-yellow-400">
                            Outstanding: {bid.criticFlags[0]?.clause_id ?? "Clause"} — {bid.criticFlags[0]?.issue ?? "Human review required."}
                          </p>
                        ) : (
                          <p className="text-xs text-accent">
                            No outstanding mandatory critic findings.
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => deleteBid(bid.id)}
                          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-[10px] font-medium text-muted-foreground transition hover:border-red-400/30 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>

                        <button
                          type="button"
                          onClick={() => openBid(bid.id)}
                          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-primary-foreground transition hover:opacity-90"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Open Workspace
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
