import { motion, useReducedMotion } from "framer-motion";
import type { MouseEvent } from "react";
import { ArrowRight, Database, ShieldAlert, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentTicker } from "./AgentTicker";
import type { CoinOrigin } from "./TransitionCoin";
import { spring } from "./motion";

const bento = [
  {
    icon: Database,
    title: "Context Ingestion",
    body: "Parses 300-page RFPs into structured requirements and retrieves matching case studies from your vector knowledge base.",
    meta: "12,480 chunks indexed",
  },
  {
    icon: ShieldAlert,
    title: "Adversarial Compliance Checker",
    body: "A critic agent cross-examines every section against mandatory clauses (Section L/M, ISO, SOC 2) before you ever see it.",
    meta: "214 clauses verified",
  },
  {
    icon: FileCheck2,
    title: "Human-in-the-Loop Export",
    body: "Every flag is surfaced inline. Nothing ships until a named reviewer approves and signs off on the final PDF.",
    meta: "Audit trail attached",
  },
];

const pipeline = [
  {
    step: "01",
    title: "Ingest",
    body: "Drop in the RFP. The parser reads every page, clause, and appendix in minutes — not days.",
  },
  {
    step: "02",
    title: "Retrieve",
    body: "Agents search your knowledge base for past proposals, case studies, and proof points that fit.",
  },
  {
    step: "03",
    title: "Draft",
    body: "The drafting engine writes each section in your voice, mapped to the evaluation criteria.",
  },
  {
    step: "04",
    title: "Defend",
    body: "The critic agent flags gaps and risky clauses before a human reviewer signs off on the export.",
  },
];

export function Landing({ onLaunch, launching = false }: { onLaunch: (origin: CoinOrigin) => void; launching?: boolean }) {
  const reducedMotion = useReducedMotion();
  const entrance = {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: { duration: reducedMotion ? 0 : 0.3 } },
  };
  const launch = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onLaunch({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  };
  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <nav className="relative z-10 border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-2xl font-bold tracking-tighter text-transition-white">BidBot</span>
          <Button
            variant="outline"
            disabled={launching}
            onClick={launch}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Enter Workspace
          </Button>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-28">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.07 } } }}>
        <motion.span
          variants={entrance}
          className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground"
        >
          ✦ WCC Launchpad 30 - Agentic AI
        </motion.span>
        <motion.h1
          variants={entrance}
          className="mt-6 text-5xl font-semibold tracking-normal sm:text-6xl md:text-8xl"
        >
          Win Bids on Autopilot.
        </motion.h1>
        <motion.p
          variants={entrance}
          className="mt-6 max-w-3xl text-xl leading-relaxed text-muted-foreground"
        >
          Drafting a 300-page RFP response takes 60 hours. Missing one compliance clause gets you
          disqualified. BidBot uses a multi-agent swarm to ingest dense RFPs, search your past data,
          and draft proposals that survive adversarial review.
        </motion.p>
        <motion.div
          variants={entrance}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Button
            disabled={launching}
            onClick={launch}
            className="group inline-flex h-auto items-center gap-2 rounded bg-primary px-5 py-3 text-sm font-medium text-primary-foreground active:scale-[0.96]"
          >
            Launch Workspace
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </motion.div>
        </motion.div>

        <AgentTicker />

        <div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
          <div className="bg-background p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-legacy-warning">The Old Way</p>
            <p className="mt-4 text-lg text-legacy-warning">
              Manual hunting for case studies, 60+ hours per bid, human error in compliance.
            </p>
          </div>
          <div className="bg-background p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">BidBot</p>
            <p className="mt-4 text-lg text-foreground">
              Vector-searched context, drafted in minutes, adversarial AI compliance check.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {bento.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ ...spring, delay: i * 0.05 }}
              className="flex flex-col border border-border bg-card p-6"
            >
              <b.icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <h3 className="mt-8 text-base font-medium">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
              <p className="mt-6 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
                {b.meta}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-24">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={spring}
            className="font-mono text-xs uppercase tracking-widest text-stream-muted"
          >
            How the swarm works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ ...spring, delay: 0.05 }}
            className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            From RFP upload to signed-off proposal.
          </motion.h2>
          <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-4">
            {pipeline.map((p, i) => (
              <motion.div
                key={p.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ ...spring, delay: i * 0.05 }}
                className="bg-background p-6"
              >
                <p className="font-mono text-xs text-accent">{p.step}</p>
                <h3 className="mt-4 text-base font-medium">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={spring}
          className="mt-6 border border-border bg-card p-10 md:p-14"
        >
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Your next bid, drafted by morning.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Upload the RFP, launch the swarm, and review a compliant draft before your coffee cools.
          </p>
          <div className="mt-8">
            <Button
              disabled={launching}
              onClick={launch}
              className="group inline-flex h-auto items-center gap-2 rounded bg-primary px-5 py-3 text-sm font-medium text-primary-foreground active:scale-[0.96]"
            >
              Launch Workspace
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
