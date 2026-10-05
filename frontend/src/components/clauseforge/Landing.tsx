import { motion, useReducedMotion } from "framer-motion";
import type { MouseEvent } from "react";
import {
  ArrowRight,
  Database,
  FileCheck2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentTicker } from "./AgentTicker";
import type { CoinOrigin } from "./TransitionCoin";
import { spring } from "./motion";

const bento = [
  {
    icon: Database,
    title: "Requirement Extraction",
    body: "Scans the uploaded RFP, extracts mandatory clauses, and turns them into structured requirements for the downstream agents.",
    meta: "Up to 300 pages • 10 MB limit",
  },
  {
    icon: ShieldAlert,
    title: "Evidence-Backed Critic",
    body: "A dedicated critic checks every mandatory clause against the proposal and the verified company evidence available to the swarm.",
    meta: "Clause-level adversarial audit",
  },
  {
    icon: FileCheck2,
    title: "Human-Gated Export",
    body: "Risks remain visible until a human reviewer approves the final response. Only then does ClauseForge unlock the PDF export.",
    meta: "Human sign-off required",
  },
];

const pipeline = [
  {
    step: "01",
    title: "Parse",
    body: "Upload the RFP. Agent 1 scans the document and extracts the mandatory requirements that drive the rest of the workflow.",
  },
  {
    step: "02",
    title: "Retrieve",
    body: "Agent 2 searches the local verified evidence knowledge base for company credentials, case studies, and supporting proof.",
  },
  {
    step: "03",
    title: "Draft",
    body: "Agent 3 writes the proposal using the RFP requirements and retrieved evidence, while explicitly disclosing evidence gaps.",
  },
  {
    step: "04",
    title: "Critic → Revise",
    body: "Agent 4 attacks the draft clause by clause. When mandatory risks are found, Agent 3 revises and Agent 4 audits again.",
  },
];

export function Landing({
  onLaunch,
  launching = false,
}: {
  onLaunch: (
    origin: CoinOrigin,
  ) => void;
  launching?: boolean;
}) {
  const reducedMotion =
    useReducedMotion();

  const entrance = {
    hidden: {
      opacity: 0,
      y: reducedMotion ? 0 : 10,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reducedMotion ? 0 : 0.3,
      },
    },
  };

  const launch = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const bounds =
      event.currentTarget.getBoundingClientRect();

    onLaunch({
      x:
        bounds.left +
        bounds.width / 2,
      y:
        bounds.top +
        bounds.height / 2,
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

      {/* ======================================================
          NAV
      ====================================================== */}

      <nav className="relative z-10 border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            ClauseForge
          </span>

          <Button
            variant="outline"
            disabled={launching}
            onClick={launch}
            className="rounded border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Enter Workspace
          </Button>
        </div>
      </nav>

      {/* ======================================================
          HERO
      ====================================================== */}

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-28">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: {
                staggerChildren:
                  reducedMotion
                    ? 0
                    : 0.07,
              },
            },
          }}
        >
          <motion.span
            variants={entrance}
            className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground"
          >
            ✦ WCC Launchpad 30 · Agentic AI
          </motion.span>

          <motion.h1
            variants={entrance}
            className="mt-6 max-w-5xl text-5xl font-semibold tracking-tight sm:text-6xl md:text-8xl"
          >
            RFP proposals that
            <span className="text-accent">
              {" "}
              defend themselves.
            </span>
          </motion.h1>

          <motion.p
            variants={entrance}
            className="mt-6 max-w-3xl text-xl leading-relaxed text-muted-foreground"
          >
            ClauseForge turns a dense RFP into a structured,
            evidence-backed proposal, then sends the
            draft through an adversarial compliance pass
            before a human reviewer can export it.
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

            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Parse → Retrieve → Draft → Critic → Human Gate
            </span>
          </motion.div>
        </motion.div>

        <AgentTicker />

        {/* ====================================================
            OLD WAY / CLAUSEFORGE
        ==================================================== */}

        <div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
          <div className="bg-background p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              The old workflow
            </p>

            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Manually locate prior evidence, draft responses,
              check every mandatory clause, then repeat the
              review when something changes.
            </p>
          </div>

          <div className="bg-background p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              ClauseForge
            </p>

            <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground">
              One agent extracts the requirements, another
              retrieves evidence, another drafts, and a dedicated
              critic attacks the result before human approval.
            </p>
          </div>
        </div>

        {/* ====================================================
            FEATURES
        ==================================================== */}

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {bento.map(
            (feature, index) => (
              <motion.div
                key={feature.title}
                initial={{
                  opacity: 0,
                  y: 32,
                }}
                whileInView={{
                  opacity: 1,
                  y: 0,
                }}
                viewport={{
                  once: true,
                  margin: "-60px",
                }}
                transition={{
                  ...spring,
                  delay:
                    index * 0.05,
                }}
                className="flex flex-col border border-border bg-card p-6"
              >
                <feature.icon
                  className="h-5 w-5 text-accent"
                  strokeWidth={1.5}
                />

                <h3 className="mt-8 text-base font-medium">
                  {feature.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>

                <p className="mt-6 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {feature.meta}
                </p>
              </motion.div>
            ),
          )}
        </div>

        {/* ====================================================
            PIPELINE
        ==================================================== */}

        <div className="mt-24">
          <motion.p
            initial={{
              opacity: 0,
              y: 16,
            }}
            whileInView={{
              opacity: 1,
              y: 0,
            }}
            viewport={{
              once: true,
              margin: "-60px",
            }}
            transition={spring}
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            How the swarm works
          </motion.p>

          <motion.h2
            initial={{
              opacity: 0,
              y: 16,
            }}
            whileInView={{
              opacity: 1,
              y: 0,
            }}
            viewport={{
              once: true,
              margin: "-60px",
            }}
            transition={{
              ...spring,
              delay: 0.05,
            }}
            className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Generation is only the first half.
            The critic loop is what makes the workflow useful.
          </motion.h2>

          <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-4">
            {pipeline.map(
              (item, index) => (
                <motion.div
                  key={item.step}
                  initial={{
                    opacity: 0,
                    y: 24,
                  }}
                  whileInView={{
                    opacity: 1,
                    y: 0,
                  }}
                  viewport={{
                    once: true,
                    margin: "-60px",
                  }}
                  transition={{
                    ...spring,
                    delay:
                      index * 0.05,
                  }}
                  className="bg-background p-6"
                >
                  <p className="font-mono text-xs text-accent">
                    {item.step}
                  </p>

                  <h3 className="mt-4 text-base font-medium">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </motion.div>
              ),
            )}
          </div>
        </div>

        {/* ====================================================
            FINAL CTA
        ==================================================== */}

        <motion.div
          initial={{
            opacity: 0,
            y: 24,
          }}
          whileInView={{
            opacity: 1,
            y: 0,
          }}
          viewport={{
            once: true,
            margin: "-60px",
          }}
          transition={spring}
          className="mt-6 border border-border bg-card p-10 md:p-14"
        >
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Ready for review
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Upload the RFP. Let the swarm challenge the draft.
            </h2>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              ClauseForge keeps the evidence trace visible, exposes
              unresolved requirements, and keeps export locked
              until a human reviewer signs off.
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
          </div>
        </motion.div>
      </section>
    </div>
  );
}