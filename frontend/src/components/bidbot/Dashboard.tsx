import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ChevronRight, Download, Upload, Check } from "lucide-react";
import { spring } from "./motion";
import ReactMarkdown from "react-markdown";

const NODES = ["Document Parser", "Vector Retriever", "Drafting LLM", "Critic Engine"];

export function Dashboard({ onBack }: { onBack: () => void }) {
  // --- REAL STATE MANAGEMENT ---
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [approved, setApproved] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  
  // Data from Backend
  const [activeNode, setActiveNode] = useState(0);
  const [score, setScore] = useState(0);
  const [draftText, setDraftText] = useState<string>("");
  const [criticFlags, setCriticFlags] = useState<any[]>([]);

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [lines]);

  // --- THE REAL AGENT PIPELINE ---
  const runAgentSwarm = async () => {
    if (!selectedFile) {
      alert("Please upload an RFP Document first.");
      return;
    }

    setRunning(true);
    setLines([]);
    setScore(0);
    setDraftText("");
    setCriticFlags([]);
    setApproved(false);
    
    try {
      // --- AGENT 1: PARSER ---
      setActiveNode(0);
      setLines(prev => [...prev, "✦ [Parser Node] Ingesting PDF and extracting constraints..."]);
      
      const formData = new FormData();
      formData.append("file", selectedFile);

      const parseRes = await fetch("http://127.0.0.1:8000/api/1-parse-rfp", {
        method: "POST",
        body: formData,
      });
      const parsedData = await parseRes.json();
      setLines(prev => [...prev, `✦ [Parser Node] ✓ Extracted ${parsedData.requirements?.length || 0} mandatory rules from "${parsedData.project_title}"`]);

      // --- AGENTS 2 & 3: RETRIEVER AND DRAFTER ---
      setActiveNode(1);
      setLines(prev => [...prev, "✦ [Vector Store] Retrieving company context & past wins..."]);
      
      setActiveNode(2);
      setLines(prev => [...prev, "✦ [Drafting LLM] Writing initial proposal draft..."]);

      const draftRes = await fetch("http://127.0.0.1:8000/api/2-draft-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData.requirements || []),
      });
      const draftData = await draftRes.json();
      
      setDraftText(draftData.draft); 
      setLines(prev => [...prev, "✦ [Drafting LLM] ✓ Draft complete. Initiating review."]);

      // --- AGENT 4: CRITIC ---
      setActiveNode(3);
      setLines(prev => [...prev, "✦ [Critic Engine] Adversarial compliance audit started..."]);

      const criticRes = await fetch("http://127.0.0.1:8000/api/3-critic-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftData),
      });
      const criticData = await criticRes.json();
      
      setCriticFlags(criticData.flags || []);
      setScore(criticData.compliance_score || 0);
      
      if (criticData.flags && criticData.flags.length > 0) {
          setLines(prev => [...prev, `✦ [Critic Engine] ✗ Found ${criticData.flags.length} compliance risks.`]);
      } else {
          setLines(prev => [...prev, "✦ [Critic Engine] ✓ Audit passed cleanly."]);
      }
      
      setLines(prev => [...prev, `✦ [System] Swarm complete. Score: ${criticData.compliance_score}/100. Awaiting human sign-off.`]);
      setActiveNode(4); // Done
      
    } catch (error) {
      console.error("Agent Swarm Failed:", error);
      setLines(prev => [...prev, "✦ [ERROR] Connection failed. Is the Python backend running?"]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="h-4 w-px bg-border" />
          <nav className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Active Bids</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{selectedFile ? selectedFile.name : "New Workspace"}</span>
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Compliance Score</span>
            <div className="h-1.5 w-28 overflow-hidden bg-secondary">
              <motion.div
                className="h-full bg-accent"
                animate={{ width: `${score}%` }}
                transition={spring}
              />
            </div>
            <span className="w-9 font-mono text-sm tabular-nums">{score}%</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={spring}
            disabled={running || !draftText}
            onClick={() => setApproved(true)}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40 cursor-pointer"
          >
            {approved ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {approved ? "Approved — Exported" : "Approve & Export PDF"}
          </motion.button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[25%_30%_45%]">
        {/* Column 1 */}
        <section className="flex flex-col gap-5 border-r border-border p-5">
          <Label>Input</Label>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) setSelectedFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-10 text-center transition-colors ${
              drag ? "border-accent bg-secondary" : "border-input hover:bg-card"
            }`}
          >
            <Upload className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm">Upload RFP (PDF)</span>
            <span className="text-xs text-muted-foreground">Drag & drop or click</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
            />
          </label>
          {selectedFile && (
            <div className="flex items-center justify-between border border-border bg-card px-3 py-2 font-mono text-xs">
              <span className="truncate">{selectedFile.name}</span>
              <span className="text-success">ready</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Knowledge Base (Vector DB)</span>
            <select className="h-9 rounded border border-input bg-card px-2 text-sm text-foreground outline-none focus:border-accent">
              <option>kb://past-proposals (1,204 docs)</option>
              <option>kb://case-studies (318 docs)</option>
              <option>kb://certifications (42 docs)</option>
            </select>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={spring}
            disabled={running}
            onClick={runAgentSwarm}
            className="mt-auto rounded border border-border bg-secondary py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            {running ? "Swarm running…" : "Deploy Agent Swarm"}
          </motion.button>
        </section>

        {/* Column 2 */}
        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="border-b border-border p-5">
            <Label>Agent Graph</Label>
            <div className="mt-5 flex flex-col gap-2">
              {NODES.map((n, i) => {
                const state = running ? (i < activeNode ? "done" : i === activeNode ? "live" : "idle") : (activeNode === 4 ? "done" : "idle");
                return (
                  <div key={n}>
                    <motion.div
                      layout
                      transition={spring}
                      className={`flex items-center justify-between border px-3 py-2 font-mono text-xs ${
                        state === "live"
                          ? "border-accent text-foreground"
                          : state === "done"
                            ? "border-border text-foreground"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      <span>[{n}]</span>
                      <span
                        className={`h-1.5 w-1.5 ${
                          state === "live" ? "animate-pulse bg-accent" : state === "done" ? "bg-success" : "bg-muted"
                        }`}
                      />
                    </motion.div>
                    {i < NODES.length - 1 && (
                      <div className="py-0.5 pl-4 font-mono text-xs text-muted-foreground">
                        {i === 2 ? "↕" : "↓"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col bg-terminal">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">swarm.log</span>
              <span className={`font-mono text-xs ${running ? "text-success" : "text-muted-foreground"}`}>
                {running ? "● live" : "○ idle"}
              </span>
            </div>
            <div ref={termRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-6">
              {lines.map((l, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={spring}
                  className={
                    l.includes("✗") || l.includes("ERROR") ? "text-destructive" : l.includes("✓") || l.includes("Score:") ? "text-success" : "text-muted-foreground"
                  }
                >
                  <span className="text-muted-foreground/50">{String(i + 1).padStart(3, "0")} </span>
                  {l}
                </motion.div>
              ))}
              {running && <span className="animate-pulse text-success">▌</span>}
            </div>
          </div>
        </section>

        {/* Column 3 */}
        <section className="flex min-h-0 flex-col bg-background overflow-hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-2">
            <Label>Draft Workspace</Label>
            <span className="font-mono text-xs text-muted-foreground">
              {draftText ? "Live Edit" : "Awaiting Swarm"}
            </span>
          </div>
          
          <article className="mx-auto w-full max-w-3xl overflow-y-auto px-8 py-8">
            
            {/* 1. COMPACT, SCROLLABLE WARNING BOX */}
            {criticFlags.length > 0 && (
              <div className="mb-10 rounded-lg border border-warning/30 bg-warning/5 p-5">
                <div className="mb-4 flex items-center gap-2 font-medium text-warning">
                  <AlertTriangle className="h-5 w-5" />
                  Critic Engine flagged {criticFlags.length} compliance risks
                </div>
                <div className="flex max-h-52 flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                  {criticFlags.map((flag, idx) => (
                    <div key={idx} className="rounded border border-warning/10 bg-background/60 p-3 text-sm shadow-sm">
                      <span className="font-bold text-warning">{flag.severity.toUpperCase()}: </span> 
                      {flag.issue}
                      <p className="mt-1.5 text-muted-foreground">{flag.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. RENDERED RICH TEXT DRAFT */}
            {draftText ? (
              <div className="text-sm leading-relaxed text-foreground [&>h1]:mb-6 [&>h1]:text-3xl [&>h1]:font-bold [&>h2]:mb-4 [&>h2]:mt-10 [&>h2]:border-b [&>h2]:border-border [&>h2]:pb-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h3]:mb-3 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-medium [&>p]:mb-5 [&>ul]:mb-5 [&>ul]:list-outside [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-2">
                <ReactMarkdown>{draftText}</ReactMarkdown>
              </div>
            ) : (
              <div className="mt-32 text-center font-mono text-sm text-muted-foreground">
                [ Document empty. Deploy swarm to generate draft. ]
              </div>
            )}

            {draftText && (
              <div className="mt-16 border-t border-border pt-6 font-mono text-xs text-muted-foreground">
                Reviewer sign-off: {approved ? "Human-in-the-loop · approved" : "pending"}
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{children}</span>;
}