import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Database,
  Download,
  FileText,
  History,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { spring } from "./motion";

const API_BASE_URL =
  import.meta.env["VITE_API_BASE_URL"] ||
  "http://127.0.0.1:8000";

const NODES = [
  "Document Parser",
  "Evidence Retriever",
  "Proposal Drafter",
  "Adversarial Critic",
];

type WorkspaceTab =
  | "proposal"
  | "compliance"
  | "evidence";

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

type ParserResponse = {
  project_title: string;
  requirements: Requirement[];
};

type CriticResponse = {
  compliance_score: number;
  flags: CriticFlag[];
  approved: boolean;
};

type EvidenceResponse = {
  evidence: EvidenceRecord[];
};

type ActivityTone =
  | "default"
  | "success"
  | "warning"
  | "error";

type ActivityLine = {
  text: string;
  tone: ActivityTone;
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

type DashboardView =
  | "workspace"
  | "history";

const BID_HISTORY_KEY = "clauseforge-active-bids";

function getErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

async function fetchJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response =
    await fetch(
      url,
      options,
    );

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Request failed with status ${response.status}`,
      ),
    );
  }

  return data as T;
}

async function streamDraft(
  url: string,
  options: RequestInit,
  onText: (text: string) => void,
): Promise<string> {
  const response = await fetch(
    url,
    options,
  );

  if (!response.ok) {
    const data: unknown = await response
      .json()
      .catch(() => null);

    throw new Error(
      getErrorMessage(
        data,
        `Request failed with status ${response.status}`,
      ),
    );
  }

  if (!response.body) {
    throw new Error(
      "Draft stream is unavailable.",
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } =
      await reader.read();

    buffer += decoder.decode(
      value ?? new Uint8Array(),
      {
        stream: !done,
      },
    );

    while (true) {
      const separator =
        buffer.indexOf("\n\n");

      if (separator === -1) {
        break;
      }

      const event =
        buffer.slice(
          0,
          separator,
        );

      buffer =
        buffer.slice(
          separator + 2,
        );

      const dataLine =
        event
          .split("\n")
          .find(
            (line) =>
              line.startsWith(
                "data: ",
              ),
          );

      if (!dataLine) {
        continue;
      }

      const payload =
        dataLine.slice(6);

      if (
        payload === "[DONE]"
      ) {
        return fullText;
      }

      let parsed: {
        text?: string;
        error?: string;
      };

      try {
        parsed =
          JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(
          parsed.error,
        );
      }

      const text =
        parsed.text ?? "";

      if (!text) {
        continue;
      }

      fullText += text;

      onText(fullText);
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const dataLine =
      buffer
        .split("\n")
        .find(
          (line) =>
            line.startsWith(
              "data: ",
            ),
        );

    if (dataLine) {
      const payload =
        dataLine.slice(6);

      if (
        payload !== "[DONE]"
      ) {
        try {
          const parsed =
            JSON.parse(payload);

          if (parsed.error) {
            throw new Error(
              parsed.error,
            );
          }

          const text =
            parsed.text ?? "";

          if (text) {
            fullText += text;
            onText(fullText);
          }
        } catch (error) {
          if (
            error instanceof Error
            && error.message !==
              "Unexpected end of JSON input"
          ) {
            throw error;
          }
        }
      }
    }
  }

  return fullText;
}

export function Dashboard({
  onBack,
  onHistory,
}: {
  onBack: () => void;
  onHistory: () => void;
}) {
  const [running, setRunning] =
    useState(false);

  const [lines, setLines] =
    useState<ActivityLine[]>(
      [],
    );

  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState<File | null>(null);

  const [drag, setDrag] =
    useState(false);

  const [approved, setApproved] =
    useState(false);

  const [activeNode, setActiveNode] =
    useState(0);

  const [score, setScore] =
    useState(0);

  const [
    initialScore,
    setInitialScore,
  ] =
    useState<number | null>(
      null,
    );

  const [
    draftText,
    setDraftText,
  ] = useState("");

  const [
    displayedDraftText,
    setDisplayedDraftText,
  ] = useState("");

  const [
    draftingStage,
    setDraftingStage,
  ] = useState<"idle" | "writing" | "complete">("idle");

  const [
    criticFlags,
    setCriticFlags,
  ] =
    useState<CriticFlag[]>(
      [],
    );

  const [
    evidence,
    setEvidence,
  ] =
    useState<EvidenceRecord[]>(
      [],
    );

  const [
    requirements,
    setRequirements,
  ] =
    useState<Requirement[]>(
      [],
    );

  const [
    projectTitle,
    setProjectTitle,
  ] = useState("");

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<WorkspaceTab>(
      "proposal",
    );

  const [
    dashboardView,
    setDashboardView,
  ] = useState<DashboardView>(
    "workspace",
  );

  const [
    bidHistory,
    setBidHistory,
  ] = useState<BidHistoryItem[]>(
    [],
  );

  const [
    historyBidId,
    setHistoryBidId,
  ] = useState<string | null>(
    null,
  );

  const termRef =
    useRef<HTMLDivElement>(
      null,
    );

  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  useEffect(() => {
    termRef.current?.scrollTo({
      top:
        termRef.current
          .scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(
        BID_HISTORY_KEY,
      );

      if (!stored) {
        return;
      }

      const parsed: unknown =
        JSON.parse(stored);

      if (Array.isArray(parsed)) {
        setBidHistory(
          parsed as BidHistoryItem[],
        );
      }
    } catch (error) {
      console.error(
        "Failed to load bid history:",
        error,
      );
    }
  }, []);

  const persistBidHistory = (
    bids: BidHistoryItem[],
  ) => {
    try {
      localStorage.setItem(
        BID_HISTORY_KEY,
        JSON.stringify(bids),
      );
    } catch (error) {
      console.error(
        "Failed to save bid history:",
        error,
      );
    }
  };

  const saveBidToHistory = ({
    fileName,
    bidProjectTitle,
    bidRequirements,
    bidEvidence,
    finalDraft,
    finalCritic,
    firstScore,
  }: {
    fileName: string;
    bidProjectTitle: string;
    bidRequirements: Requirement[];
    bidEvidence: EvidenceRecord[];
    finalDraft: string;
    finalCritic: CriticResponse;
    firstScore: number;
  }) => {
    if (!finalDraft) {
      return;
    }

    const now =
      new Date().toISOString();

    const bid: BidHistoryItem = {
      id: crypto.randomUUID(),
      fileName,
      projectTitle:
        bidProjectTitle ||
        "Untitled RFP",
      createdAt: now,
      updatedAt: now,
      initialScore:
        firstScore,
      finalScore:
        finalCritic.compliance_score ??
        0,
      requirements:
        bidRequirements,
      evidence:
        bidEvidence,
      criticFlags:
        finalCritic.flags ??
        [],
      draftText:
        finalDraft,
    };

    setBidHistory((previous) => {
      const updated = [
        bid,
        ...previous,
      ].slice(0, 25);

      persistBidHistory(updated);

      return updated;
    });

    setHistoryBidId(bid.id);
  };

  const openBidFromHistory = (
    bid: BidHistoryItem,
  ) => {
    setRunning(false);
    setSelectedFile(null);
    setHistoryBidId(bid.id);
    setDashboardView(
      "workspace",
    );
    setActiveTab(
      "proposal",
    );
    setScore(bid.finalScore);
    setInitialScore(
      bid.initialScore,
    );
    setDraftText(
      bid.draftText,
    );
    setDisplayedDraftText(
      bid.draftText,
    );
    setDraftingStage(
      "complete",
    );
    setCriticFlags(
      bid.criticFlags,
    );
    setEvidence(
      bid.evidence,
    );
    setRequirements(
      bid.requirements,
    );
    setProjectTitle(
      bid.projectTitle,
    );
    setApproved(false);
    setLines([]);
    setActiveNode(4);
  };

  const deleteBidFromHistory = (
    bidId: string,
  ) => {
    setBidHistory((previous) => {
      const updated =
        previous.filter(
          (bid) => bid.id !== bidId,
        );

      persistBidHistory(updated);

      return updated;
    });

    if (historyBidId === bidId) {
      setHistoryBidId(null);
    }
  };

  const openHistory = () => {
    if (running) {
      return;
    }

    onHistory();
  };

  const backToWorkspace = () => {
    setDashboardView("workspace");
  };

  useEffect(() => {
    const pendingBidId = sessionStorage.getItem(
      "clauseforge-open-bid-id",
    );

    if (!pendingBidId || bidHistory.length === 0) {
      return;
    }

    const bid = bidHistory.find(
      (item) => item.id === pendingBidId,
    );

    sessionStorage.removeItem(
      "clauseforge-open-bid-id",
    );

    if (bid) {
      openBidFromHistory(bid);
    }
  }, [bidHistory]);

  const mandatoryCount =
    requirements.filter(
      (item) =>
        item.is_mandatory,
    ).length;

  const needsReviewCount =
    criticFlags.length;

  const satisfiedCount =
    Math.max(
      0,
      mandatoryCount -
        needsReviewCount,
    );

  const improvement =
    initialScore !== null
      ? score -
        initialScore
      : 0;

  const swarmComplete =
    !running &&
    activeNode >= 4 &&
    Boolean(draftText);

  const addLine = (
    text: string,
    tone: ActivityTone = "default",
  ) => {
    setLines(
      (previous) => [
        ...previous,
        {
          text,
          tone,
        },
      ],
    );
  };

  const handleFileSelected = (
    file: File | null,
  ) => {
    if (!file) {
      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      alert(
        "Please select a PDF RFP document.",
      );
      return;
    }

    if (
      file.size >
      10 * 1024 * 1024
    ) {
      alert(
        "File is too large. Maximum allowed size is 10 MB.",
      );
      return;
    }

    setSelectedFile(file);
    setScore(0);
    setInitialScore(null);
    setDraftText("");
    setDisplayedDraftText("");
    setDraftingStage("idle");
    setCriticFlags([]);
    setEvidence([]);
    setRequirements([]);
    setProjectTitle("");
    setApproved(false);
    setLines([]);
    setActiveNode(0);
    setActiveTab(
      "proposal",
    );
  };

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    handleFileSelected(
      event.target.files?.[0] ??
        null,
    );
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setDrag(false);

    handleFileSelected(
      event.dataTransfer.files?.[0] ??
        null,
    );
  };

  // ==========================================================
  // DRAFT ANIMATION
  // ==========================================================

  const streamProposal = async (
    requestBody: {
      requirements: Requirement[];
      evidence: EvidenceRecord[];
      previous_draft?: string;
      critic_feedback?: CriticFlag[];
    },
    label: "initial" | "revision",
  ) => {
    setDraftingStage(
      "writing",
    );

    setDisplayedDraftText("");

    setActiveTab(
      "proposal",
    );

    addLine(
      label === "revision"
        ? "↻ [Agent 3 • Proposal Drafter] Streaming revised proposal..."
        : "✦ [Agent 3 • Proposal Drafter] Streaming proposal...",
    );

    const completedDraft =
      await streamDraft(
        `${API_BASE_URL}/api/3-draft-proposal`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            requestBody,
          ),
        },
        (partialText) => {
          setDisplayedDraftText(
            partialText,
          );
        },
      );

    setDisplayedDraftText(
      completedDraft,
    );

    setDraftingStage(
      "complete",
    );

    addLine(
      label === "revision"
        ? "✓ [Agent 3 • Proposal Drafter] Revised proposal streamed. Returning to critic."
        : "✓ [Agent 3 • Proposal Drafter] Proposal streamed. Returning to critic.",
      "success",
    );

    return completedDraft;
  };

  // ==========================================================
  // AGENT PIPELINE
  // ==========================================================

  const runAgentSwarm =
    async () => {
      if (!selectedFile) {
        alert(
          "Please upload an RFP document first.",
        );
        return;
      }

      setRunning(true);
      setLines([]);
      setScore(0);
      setInitialScore(null);
      setDraftText("");
      setDisplayedDraftText("");
      setDraftingStage("idle");
      setCriticFlags([]);
      setEvidence([]);
      setRequirements([]);
      setProjectTitle("");
      setApproved(false);
      setHistoryBidId(null);
      setDashboardView("workspace");
      setActiveTab(
        "proposal",
      );

      try {
        // ------------------------------------------------------
        // AGENT 1
        // ------------------------------------------------------

        setActiveNode(0);

        addLine(
          "✦ [Agent 1 • Parser] Ingesting PDF and extracting constraints...",
        );

        const formData =
          new FormData();

        formData.append(
          "file",
          selectedFile,
        );

        const parsedData =
          await fetchJson<ParserResponse>(
            `${API_BASE_URL}/api/1-parse-rfp`,
            {
              method: "POST",
              body: formData,
            },
          );

        const parsedRequirements =
          parsedData.requirements ??
          [];

        setProjectTitle(
          parsedData.project_title ??
            "",
        );

        setRequirements(
          parsedRequirements,
        );

        addLine(
          `✓ [Agent 1 • Parser] Extracted ${parsedRequirements.length} mandatory rule${
            parsedRequirements.length ===
            1
              ? ""
              : "s"
          }.`,
          "success",
        );

        // ------------------------------------------------------
        // AGENT 2
        // ------------------------------------------------------

        setActiveNode(1);

        addLine(
          "✦ [Agent 2 • Evidence Retriever] Searching verified company evidence...",
        );

        const evidenceData =
          await fetchJson<EvidenceResponse>(
            `${API_BASE_URL}/api/2-retrieve-context`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                {
                  requirements:
                    parsedRequirements,
                },
              ),
            },
          );

        const retrievedEvidence =
          evidenceData.evidence ??
          [];

        setEvidence(
          retrievedEvidence,
        );

        addLine(
          `✓ [Agent 2 • Evidence Retriever] Retrieved ${retrievedEvidence.length} verified evidence records.`,
          "success",
        );

        // ------------------------------------------------------
        // AGENT 3
        // ------------------------------------------------------

        setActiveNode(2);

        addLine(
          "✦ [Agent 3 • Proposal Drafter] Writing evidence-backed proposal...",
        );

        const initialDraft =
          await streamProposal(
            {
              requirements:
                parsedRequirements,
              evidence:
                retrievedEvidence,
            },
            "initial",
          );

        setDraftText(
          initialDraft,
        );

        // ------------------------------------------------------
        // AGENT 4
        // ------------------------------------------------------

        setActiveNode(3);

        addLine(
          "✦ [Agent 4 • Adversarial Critic] Auditing every mandatory clause...",
        );

        const firstCritic =
          await fetchJson<CriticResponse>(
            `${API_BASE_URL}/api/4-critic-review`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                {
                  requirements:
                    parsedRequirements,
                  evidence:
                    retrievedEvidence,
                  draft: initialDraft,
                },
              ),
            },
          );

        const firstScore =
          firstCritic.compliance_score ??
          0;

        setInitialScore(
          firstScore,
        );

        setScore(
          firstScore,
        );

        addLine(
          `✓ [Agent 4 • Adversarial Critic] Initial compliance score: ${firstScore}/100.`,
          "success",
        );

        let finalCritic =
          firstCritic;

        let finalDraft =
          initialDraft;

        // ------------------------------------------------------
        // REVISION
        // ------------------------------------------------------

        if (
          firstCritic.flags.length >
          0
        ) {
          addLine(
            `⚠ [Agent 4 • Adversarial Critic] Found ${firstCritic.flags.length} blocking compliance risk${
              firstCritic.flags.length ===
              1
                ? ""
                : "s"
            }.`,
            "warning",
          );

          setActiveNode(2);

          addLine(
            "✦ [Agent 3 • Proposal Drafter] Revising draft against critic findings...",
          );

          const revisedDraft =
            await streamProposal(
              {
                requirements:
                  parsedRequirements,
                evidence:
                  retrievedEvidence,
                previous_draft:
                  initialDraft,
                critic_feedback:
                  firstCritic.flags,
              },
              "revision",
            );

          finalDraft =
            revisedDraft;

          setDraftText(
            revisedDraft,
          );

          // ----------------------------------------------------
          // RE-CRITIC
          // ----------------------------------------------------

          setActiveNode(3);

          addLine(
            "✦ [Agent 4 • Adversarial Critic] Re-auditing revised proposal...",
          );

          finalCritic =
            await fetchJson<CriticResponse>(
              `${API_BASE_URL}/api/4-critic-review`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    requirements:
                      parsedRequirements,
                    evidence:
                      retrievedEvidence,
                    draft: revisedDraft,
                  },
                ),
              },
            );

          setScore(
            finalCritic.compliance_score ??
              0,
          );

          addLine(
            `✓ [Agent 4 • Adversarial Critic] Final compliance score: ${finalCritic.compliance_score}/100.`,
            "success",
          );
        } else {
          addLine(
            "✓ [Agent 4 • Adversarial Critic] No mandatory compliance risks found.",
            "success",
          );
        }

        setCriticFlags(
          finalCritic.flags ??
            [],
        );

        const finalScore =
          finalCritic.compliance_score ??
          0;

        const finalImprovement =
          finalScore -
          firstScore;

        if (
          finalImprovement >
          0
        ) {
          addLine(
            `✓ [System] Swarm complete. Score improved by +${finalImprovement} points.`,
            "success",
          );
        } else {
          addLine(
            `✓ [System] Swarm complete. Final score: ${finalScore}/100.`,
            "success",
          );
        }

        if (
          finalCritic.flags
            ?.length
        ) {
          addLine(
            `⚠ [System] ${finalCritic.flags.length} issue${
              finalCritic.flags.length ===
              1
                ? ""
                : "s"
            } remain. Human review required.`,
            "warning",
          );
        } else {
          addLine(
            "✓ [System] Automated audit passed. Human sign-off required before export.",
            "success",
          );
        }

        saveBidToHistory({
          fileName: selectedFile.name,
          bidProjectTitle:
            parsedData.project_title ??
            "",
          bidRequirements:
            parsedRequirements,
          bidEvidence:
            retrievedEvidence,
          finalDraft,
          finalCritic,
          firstScore,
        });

        setActiveNode(4);
        setActiveTab(
          "proposal",
        );
      } catch (error) {
        console.error(
          "Agent Swarm Failed:",
          error,
        );

        const message =
          error instanceof Error
            ? error.message
            : "Unexpected pipeline error.";

        setDraftingStage("idle");
        addLine(
          `✕ [ERROR] ${message}`,
          "error",
        );
      } finally {
        setRunning(false);
      }
    };

  // ==========================================================
  // PDF EXPORT
  // ==========================================================

  const exportProposal = () => {
    if (
      !draftText ||
      !approved
    ) {
      return;
    }

    const doc = new jsPDF({
      unit: "pt",
      format: "a4",
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const margin = 48;

    type RGB = [
      number,
      number,
      number,
    ];

    const ink: RGB = [
      20, 24, 30,
    ];

    const muted: RGB = [
      100, 108, 118,
    ];

    const accent: RGB = [
      20, 120, 100,
    ];

    const light: RGB = [
      240, 243, 246,
    ];

    let y = 48;

    const addFooter = () => {
      const pageNumber =
        doc.getCurrentPageInfo()
          .pageNumber;

      doc.setFont(
        "helvetica",
        "normal",
      );

      doc.setFontSize(8);

      doc.setTextColor(
        ...muted,
      );

      doc.text(
        `ClauseForge • ${
          projectTitle ||
          "Proposal Response"
        }`,
        margin,
        pageHeight - 24,
      );

      doc.text(
        `Page ${pageNumber}`,
        pageWidth - margin,
        pageHeight - 24,
        {
          align: "right",
        },
      );
    };

    const ensureSpace = (
      required: number,
    ) => {
      if (
        y + required >
        pageHeight - 58
      ) {
        addFooter();
        doc.addPage();
        y = 52;
      }
    };

    const writeWrapped = (
      text: string,
      fontSize = 10,
      lineHeight = 15,
    ) => {
      doc.setFontSize(
        fontSize,
      );

      const wrapped =
        doc.splitTextToSize(
          text,
          pageWidth -
            margin * 2,
        ) as string[];

      for (
        const line of wrapped
      ) {
        ensureSpace(
          lineHeight,
        );

        doc.text(
          line,
          margin,
          y,
        );

        y +=
          lineHeight;
      }
    };

    const flushTable = (
      rows: string[][],
    ) => {
      if (
        rows.length <
        2
      ) {
        return;
      }

      const header =
        rows[0] ?? [];

      const body =
        rows
          .slice(2)
          .map((row) =>
            row.map(
              (cell) =>
                cell.trim(),
            ),
          );

      ensureSpace(
        100,
      );

      autoTable(
        doc,
        {
          startY: y,
          head: [
            header.map(
              (cell) =>
                cell
                  .replace(
                    /^\|/,
                    "",
                  )
                  .replace(
                    /\|$/,
                    "",
                  )
                  .trim(),
            ),
          ],
          body,
          margin: {
            left: margin,
            right: margin,
          },
          styles: {
            font:
              "helvetica",
            fontSize: 8,
            cellPadding: 5,
            textColor:
              ink,
            overflow:
              "linebreak",
          },
          headStyles: {
            fontStyle:
              "bold",
          },
          alternateRowStyles:
            {
              fillColor:
                light,
            },
        },
      );

      const finalY =
        (
          doc as unknown as {
            lastAutoTable?: {
              finalY?: number;
            };
          }
        )
          .lastAutoTable
          ?.finalY;

      y =
        (finalY ?? y) +
        18;
    };

    // ========================================================
    // COVER
    // ========================================================

    doc.setFillColor(
      ...ink,
    );

    doc.rect(
      0,
      0,
      pageWidth,
      150,
      "F",
    );

    doc.setTextColor(
      255,
      255,
      255,
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(
      24,
    );

    doc.text(
      "ClauseForge",
      margin,
      58,
    );

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(
      11,
    );

    doc.text(
      "Evidence-backed RFP Proposal Response",
      margin,
      80,
    );

    doc.setFontSize(
      9,
    );

    doc.setTextColor(
      210,
      216,
      223,
    );

    doc.text(
      projectTitle ||
        "RFP Proposal",
      margin,
      110,
    );

    y = 190;

    // ========================================================
    // SCORE CARD
    // ========================================================

    ensureSpace(
      92,
    );

    doc.setFillColor(
      ...light,
    );

    doc.roundedRect(
      margin,
      y,
      pageWidth -
        margin * 2,
      76,
      8,
      8,
      "F",
    );

    doc.setTextColor(
      ...muted,
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(
      9,
    );

    doc.text(
      "FINAL COMPLIANCE SCORE",
      margin + 16,
      y + 22,
    );

    doc.setTextColor(
      ...accent,
    );

    doc.setFontSize(
      24,
    );

    doc.text(
      `${score}/100`,
      margin + 16,
      y + 52,
    );

    doc.setTextColor(
      ...ink,
    );

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(
      9,
    );

    doc.text(
      criticFlags.length ===
      0
        ? "Automated audit passed"
        : `${criticFlags.length} compliance risk${
            criticFlags.length ===
            1
              ? ""
              : "s"
          } flagged`,
      pageWidth -
        margin -
        16,
      y + 38,
      {
        align: "right",
      },
    );

    y += 108;

    // ========================================================
    // COMPLIANCE REVIEW
    // ========================================================

    if (
      criticFlags.length >
      0
    ) {
      ensureSpace(
        60,
      );

      doc.setTextColor(
        ...ink,
      );

      doc.setFont(
        "helvetica",
        "bold",
      );

      doc.setFontSize(
        15,
      );

      doc.text(
        "Compliance Review",
        margin,
        y,
      );

      y += 22;

      for (
        const flag of criticFlags
      ) {
        ensureSpace(
          88,
        );

        const cardTop =
          y;

        doc.setFillColor(
          ...light,
        );

        doc.roundedRect(
          margin,
          cardTop,
          pageWidth -
            margin * 2,
          72,
          6,
          6,
          "F",
        );

        doc.setTextColor(
          ...ink,
        );

        doc.setFont(
          "helvetica",
          "bold",
        );

        doc.setFontSize(
          9,
        );

        doc.text(
          `${flag.severity.toUpperCase()} — Clause ${flag.clause_id}`,
          margin + 12,
          cardTop + 17,
        );

        doc.setFont(
          "helvetica",
          "normal",
        );

        doc.setFontSize(
          8.5,
        );

        const issueLines =
          doc.splitTextToSize(
            flag.issue,
            pageWidth -
              margin * 2 -
              24,
          ) as string[];

        doc.text(
          issueLines.slice(
            0,
            2,
          ),
          margin + 12,
          cardTop + 33,
        );

        const suggestionLines =
          doc.splitTextToSize(
            `Recommendation: ${flag.suggestion}`,
            pageWidth -
              margin * 2 -
              24,
          ) as string[];

        doc.setTextColor(
          ...muted,
        );

        doc.text(
          suggestionLines.slice(
            0,
            2,
          ),
          margin + 12,
          cardTop + 54,
        );

        y =
          cardTop + 86;
      }
    }

    // ========================================================
    // PROPOSAL
    // ========================================================

    ensureSpace(
      70,
    );

    doc.setTextColor(
      ...ink,
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(
      18,
    );

    doc.text(
      "Proposal Response",
      margin,
      y,
    );

    y += 28;

    const rawLines =
      draftText.split(
        "\n",
      );

    let tableBuffer:
      string[][] = [];

    for (
      let index = 0;
      index < rawLines.length;
      index++
    ) {
      const originalLine =
        rawLines[index] ??
        "";

      const trimmed =
        originalLine.trim();

      if (
        trimmed.startsWith(
          "|",
        )
      ) {
        tableBuffer.push(
          trimmed
            .split("|")
            .filter(
              (_, i, arr) =>
                i !== 0 &&
                i !==
                  arr.length -
                    1,
            ),
        );

        continue;
      }

      if (
        tableBuffer.length >
        0
      ) {
        flushTable(
          tableBuffer,
        );

        tableBuffer = [];
      }

      if (!trimmed) {
        y += 6;
        continue;
      }

      if (
        trimmed.startsWith(
          "### ",
        )
      ) {
        ensureSpace(
          30,
        );

        doc.setTextColor(
          ...ink,
        );

        doc.setFont(
          "helvetica",
          "bold",
        );

        writeWrapped(
          trimmed.slice(
            4,
          ),
          11,
          15,
        );

        y += 3;
        continue;
      }

      if (
        trimmed.startsWith(
          "## ",
        )
      ) {
        ensureSpace(
          32,
        );

        doc.setTextColor(
          ...ink,
        );

        doc.setFont(
          "helvetica",
          "bold",
        );

        writeWrapped(
          trimmed.slice(
            3,
          ),
          13,
          17,
        );

        y += 4;
        continue;
      }

      if (
        trimmed.startsWith(
          "# ",
        )
      ) {
        ensureSpace(
          36,
        );

        doc.setTextColor(
          ...ink,
        );

        doc.setFont(
          "helvetica",
          "bold",
        );

        writeWrapped(
          trimmed.slice(
            2,
          ),
          17,
          21,
        );

        y += 5;
        continue;
      }

      if (
        /^[-*]\s/.test(
          trimmed,
        )
      ) {
        writeWrapped(
          trimmed.replace(
            /^[-*]\s+/,
            "• ",
          ),
          9.5,
          14,
        );

        continue;
      }

      if (
        /^\d+\.\s/.test(
          trimmed,
        )
      ) {
        writeWrapped(
          trimmed,
          9.5,
          14,
        );

        continue;
      }

      const cleaned =
        trimmed
          .replace(
            /\*\*(.*?)\*\*/g,
            "$1",
          )
          .replace(
            /\*(.*?)\*/g,
            "$1",
          )
          .replace(
            /`([^`]+)`/g,
            "$1",
          );

      writeWrapped(
        cleaned,
        9.5,
        14,
      );
    }

    if (
      tableBuffer.length >
      0
    ) {
      flushTable(
        tableBuffer,
      );
    }

    addFooter();

    doc.save(
      "ClauseForge-Proposal.pdf",
    );
  };

  if (dashboardView === "history") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={backToWorkspace}
              className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Workspace
            </button>

            <span className="h-4 w-px shrink-0 bg-border" />

            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-accent" />
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Bid History
              </span>
            </div>
          </div>

          <span className="font-mono text-xs text-muted-foreground">
            {bidHistory.length} saved bid{
              bidHistory.length === 1
                ? ""
                : "s"
            }
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
                  <History className="mx-auto h-7 w-7 text-muted-foreground" />
                  <h2 className="mt-4 text-base font-semibold">
                    No saved bids yet
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Run an RFP through the complete swarm and the finished bid will appear here automatically.
                  </p>
                  <button
                    type="button"
                    onClick={backToWorkspace}
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
                  const reviewCount =
                    bid.criticFlags.length;
                  const scoreImprovement =
                    bid.finalScore -
                    bid.initialScore;

                  return (
                    <motion.article
                      key={bid.id}
                      initial={{
                        opacity: 0,
                        y: 8,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        ...spring,
                        delay: index * 0.03,
                      }}
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

                            <h2 className="mt-3 truncate text-xl font-semibold tracking-tight">
                              {bid.projectTitle}
                            </h2>

                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {bid.fileName}
                            </p>
                          </div>

                          <div className="shrink-0 rounded-lg border border-border bg-card px-4 py-3 lg:min-w-[120px] lg:text-right">
                            <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-muted-foreground">
                              Final Score
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-accent">
                              {bid.finalScore}
                              <span className="text-sm text-muted-foreground">
                                /100
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
                        <div className="bg-card p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                            Initial Score
                          </p>
                          <p className="mt-2 text-lg font-semibold">
                            {bid.initialScore}/100
                          </p>
                        </div>

                        <div className="bg-card p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                            Revision Impact
                          </p>
                          <p className={[
                            "mt-2 text-lg font-semibold",
                            scoreImprovement > 0
                              ? "text-accent"
                              : "text-foreground",
                          ].join(" ")}>
                            {scoreImprovement > 0 ? "+" : ""}
                            {scoreImprovement}
                          </p>
                        </div>

                        <div className="bg-card p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                            Clauses
                          </p>
                          <p className="mt-2 text-lg font-semibold">
                            {bid.requirements.length}
                          </p>
                        </div>

                        <div className="bg-card p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                            Evidence
                          </p>
                          <p className="mt-2 text-lg font-semibold">
                            {bid.evidence.length}
                          </p>
                        </div>

                        <div className="bg-card p-4">
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                            Saved
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {new Date(
                              bid.updatedAt,
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          {reviewCount > 0 ? (
                            <p className="truncate text-xs text-yellow-400">
                              Outstanding: {""}
                              {bid.criticFlags[0]?.clause_id ?? "Clause"}
                              {" — "}
                              {bid.criticFlags[0]?.issue ?? "Human review required."}
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
                            onClick={() =>
                              deleteBidFromHistory(
                                bid.id,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-[10px] font-medium text-muted-foreground transition hover:border-red-400/30 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openBidFromHistory(
                                bid,
                              )
                            }
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ======================================================
          SCROLLBAR + PROPOSAL STYLES
      ====================================================== */}

      <style>
        {`
          .clauseforge-scroll {
            scrollbar-width: auto;
            scrollbar-color: #454b54 #090a0c;
          }

          .clauseforge-scroll::-webkit-scrollbar {
            width: 11px;
            height: 11px;
          }

          .clauseforge-scroll::-webkit-scrollbar-track {
            background: #090a0c;
          }

          .clauseforge-scroll::-webkit-scrollbar-thumb {
            background: #454b54;
            border: 3px solid #090a0c;
            border-radius: 999px;
            min-height: 42px;
          }

          .clauseforge-scroll::-webkit-scrollbar-thumb:hover {
            background: #626a75;
          }

          .clauseforge-scroll::-webkit-scrollbar-corner {
            background: #090a0c;
          }

          .clauseforge-activity-scroll {
            scrollbar-width: auto;
            scrollbar-color: #3c434c #090a0c;
          }

          .clauseforge-activity-scroll::-webkit-scrollbar {
            width: 9px;
          }

          .clauseforge-activity-scroll::-webkit-scrollbar-track {
            background: #090a0c;
          }

          .clauseforge-activity-scroll::-webkit-scrollbar-thumb {
            background: #3c434c;
            border: 2px solid #090a0c;
            border-radius: 999px;
          }

          .clauseforge-activity-scroll::-webkit-scrollbar-thumb:hover {
            background: #5c6570;
          }

          .proposal-content h1 {
            margin-top: 2.25rem;
            margin-bottom: 0.9rem;
            font-size: 1.65rem;
            line-height: 1.25;
            font-weight: 700;
            letter-spacing: -0.025em;
          }

          .proposal-content h2 {
            margin-top: 2.25rem;
            margin-bottom: 0.8rem;
            padding-bottom: 0.55rem;
            border-bottom: 1px solid hsl(var(--border));
            font-size: 1.25rem;
            line-height: 1.35;
            font-weight: 650;
            letter-spacing: -0.015em;
          }

          .proposal-content h3 {
            margin-top: 1.65rem;
            margin-bottom: 0.6rem;
            font-size: 1.02rem;
            line-height: 1.4;
            font-weight: 650;
          }

          .proposal-content p {
            margin-top: 0.7rem;
            margin-bottom: 0.7rem;
            font-size: 0.9rem;
            line-height: 1.85;
          }

          .proposal-content ul {
            margin-top: 0.75rem;
            margin-bottom: 1rem;
            padding-left: 1.4rem;
          }

          .proposal-content ol {
            margin-top: 0.75rem;
            margin-bottom: 1rem;
            padding-left: 1.45rem;
          }

          .proposal-content li {
            margin-top: 0.35rem;
            margin-bottom: 0.35rem;
            padding-left: 0.25rem;
            font-size: 0.88rem;
            line-height: 1.7;
          }

          .proposal-content strong {
            font-weight: 650;
            color: hsl(var(--foreground));
          }

          .proposal-content table {
            width: 100%;
            margin-top: 1.25rem;
            margin-bottom: 1.5rem;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
            border: 1px solid hsl(var(--border));
            border-radius: 8px;
            font-size: 0.78rem;
          }

          .proposal-content thead {
            background: hsl(var(--muted) / 0.45);
          }

          .proposal-content th {
            border-bottom: 1px solid hsl(var(--border));
            padding: 0.7rem 0.75rem;
            text-align: left;
            font-weight: 600;
            color: hsl(var(--foreground));
          }

          .proposal-content td {
            border-bottom: 1px solid hsl(var(--border) / 0.65);
            padding: 0.72rem 0.75rem;
            vertical-align: top;
            color: hsl(var(--muted-foreground));
            line-height: 1.6;
          }

          .proposal-content tbody tr:last-child td {
            border-bottom: none;
          }

          .proposal-content tbody tr:nth-child(even) {
            background: hsl(var(--muted) / 0.16);
          }

          .proposal-content hr {
            margin: 1.75rem 0;
            border: 0;
            border-top: 1px solid hsl(var(--border));
          }

          .proposal-content code {
            border-radius: 4px;
            background: hsl(var(--muted) / 0.45);
            padding: 0.12rem 0.3rem;
            font-size: 0.82em;
          }
        `}
      </style>

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <span className="h-4 w-px shrink-0 bg-border" />

          <nav className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="shrink-0 text-muted-foreground">
              Active Bids
            </span>

            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

            <span className="truncate font-medium">
              {selectedFile
                ? selectedFile.name
                : "New Bid"}
            </span>
          </nav>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={openHistory}
            disabled={running}
            className="inline-flex items-center gap-2 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>

          <div className="flex shrink-0 items-center gap-4">
          {initialScore !==
            null && (
            <div className="hidden font-mono text-xs text-muted-foreground sm:block">
              Initial{" "}
              <span className="text-foreground">
                {initialScore}
              </span>

              <span className="mx-1.5">
                →
              </span>

              Final{" "}
              <span className="text-foreground">
                {score}
              </span>

              {improvement >
                0 && (
                <span className="ml-2 text-accent">
                  +{improvement}
                </span>
              )}
            </div>
          )}

          <div className="font-mono text-xs text-muted-foreground">
            <span className="text-foreground">
              {score}
            </span>
            /100
          </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          BODY
      ====================================================== */}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ====================================================
            SIDEBAR
        ==================================================== */}

        <aside className="flex min-h-0 flex-col border-r border-border bg-background">
          <div className="shrink-0 border-b border-border p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />

              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                ClauseForge Swarm
              </span>
            </div>

            <h1 className="mt-3 text-xl font-semibold tracking-tight">
              RFP Workspace
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Evidence-backed proposal generation with adversarial compliance review.
            </p>
          </div>

          <div className="clauseforge-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Upload */}

            <div className="border-b border-border p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={
                  handleInputChange
                }
              />

              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDrag(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDrag(false);
                }}
                onDrop={
                  handleDrop
                }
                className={[
                  "rounded border border-dashed p-5 transition",
                  drag
                    ? "border-accent bg-accent/5"
                    : "border-border",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <Upload className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Upload RFP
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      PDF only • maximum 10 MB
                    </p>

                    <button
                      disabled={
                        running
                      }
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="mt-4 inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Choose PDF
                    </button>
                  </div>
                </div>
              </div>

              {selectedFile && (
                <div className="mt-3 flex items-center gap-2 rounded border border-border bg-card p-3">
                  <FileText className="h-4 w-4 shrink-0 text-accent" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {
                        selectedFile.name
                      }
                    </p>

                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {(
                        selectedFile.size /
                        1024 /
                        1024
                      ).toFixed(
                        2,
                      )}{" "}
                      MB
                    </p>
                  </div>

                  <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                </div>
              )}
            </div>

            {/* Agents */}

            <div className="border-b border-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Agent Pipeline
                </span>

                <span className="font-mono text-[10px] text-muted-foreground">
                  {activeNode >=
                  4
                    ? "DONE"
                    : running
                      ? "RUNNING"
                      : "READY"}
                </span>
              </div>

              <div className="space-y-3">
                {NODES.map(
                  (
                    node,
                    index,
                  ) => {
                    const completed =
                      activeNode >
                        index ||
                      activeNode >=
                        4;

                    const active =
                      activeNode ===
                        index &&
                      running;

                    return (
                      <div
                        key={node}
                        className="flex items-center gap-3"
                      >
                        <div
                          className={[
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                            completed
                              ? "border-accent bg-accent/10 text-accent"
                              : active
                                ? "border-accent text-accent"
                                : "border-border text-muted-foreground",
                          ].join(
                            " ",
                          )}
                        >
                          {completed ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : active ? (
                            <Circle className="h-3.5 w-3.5 animate-pulse fill-current" />
                          ) : (
                            <span className="font-mono text-[10px]">
                              {index +
                                1}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p
                            className={[
                              "text-xs font-medium",
                              active ||
                              completed
                                ? "text-foreground"
                                : "text-muted-foreground",
                            ].join(
                              " ",
                            )}
                          >
                            Agent{" "}
                            {index +
                              1}
                          </p>

                          <p className="truncate text-[11px] text-muted-foreground">
                            {node}
                          </p>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* Evidence KB */}

            <div className="border-b border-border p-5">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-accent" />

                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Evidence Knowledge Base
                </span>
              </div>

              <p className="mt-3 text-xs text-foreground">
                local://verified-evidence
              </p>

              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                10 verified records
              </p>

              {evidence.length >
                0 && (
                <p className="mt-3 text-xs text-accent">
                  {
                    evidence.length
                  }{" "}
                  retrieved for this RFP
                </p>
              )}
            </div>
          </div>

          {/* Sidebar controls */}

          <div className="shrink-0 border-t border-border bg-background p-5">
            <button
              disabled={
                running ||
                !selectedFile
              }
              onClick={
                runAgentSwarm
              }
              className="w-full rounded bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running
                ? "Swarm Running..."
                : "Launch Agent Swarm"}
            </button>

            {!running &&
              draftText && (
                <button
                  disabled={
                    approved
                  }
                  onClick={() =>
                    setApproved(
                      true,
                    )
                  }
                  className={[
                    "mt-3 w-full rounded border px-4 py-3 text-sm font-medium transition",
                    approved
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border hover:bg-secondary",
                  ].join(
                    " ",
                  )}
                >
                  {approved ? (
                    <span className="inline-flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Human Sign-off Recorded
                    </span>
                  ) : (
                    "Approve for Export"
                  )}
                </button>
              )}
          </div>
        </aside>

        {/* ====================================================
            RIGHT WORKSPACE
        ==================================================== */}

        <main className="flex min-h-0 min-w-0 flex-col bg-background">
          {/* Tabs */}

          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex h-full items-center">
              {(
                [
                  "proposal",
                  "compliance",
                  "evidence",
                ] as WorkspaceTab[]
              ).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() =>
                      setActiveTab(
                        tab,
                      )
                    }
                    className={[
                      "h-full border-b-2 px-4 text-xs font-medium capitalize transition",
                      activeTab ===
                      tab
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    ].join(
                      " ",
                    )}
                  >
                    {tab ===
                    "proposal"
                      ? "Proposal"
                      : tab ===
                          "compliance"
                        ? "Compliance"
                        : "Evidence"}
                  </button>
                ),
              )}
            </div>

            {activeTab ===
              "proposal" &&
              draftText && (
              <button
                disabled={
                  !approved
                }
                onClick={
                  exportProposal
                }
                className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-35"
                title={
                  approved
                    ? "Export proposal"
                    : "Human sign-off required before export"
                }
              >
                <Download className="h-3.5 w-3.5" />
                Export PDF
              </button>
            )}
          </div>

          {/* ==================================================
              PROPOSAL TAB
          ================================================== */}

          {activeTab ===
            "proposal" && (
            <div className="clauseforge-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto w-full max-w-5xl px-7 py-9 lg:px-12 lg:py-12">
                {!draftText ? (
                  <div className="flex min-h-117.5 items-center justify-center">
                    <div className="max-w-md text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>

                      <h2 className="mt-5 text-xl font-semibold tracking-tight">
                        Proposal workspace
                      </h2>

                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Upload an RFP and launch the agent swarm to generate an evidence-backed proposal.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ==================================================
                        FINAL SWARM SUMMARY
                    ================================================== */}

                    {swarmComplete && (
                      <section className="mb-6">
                        <div className="mb-3 flex items-end justify-between gap-4">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                              Swarm complete
                            </p>

                            <h2 className="mt-1 text-lg font-semibold">
                              Final review summary
                            </h2>
                          </div>

                          {needsReviewCount >
                            0 && (
                            <button
                              onClick={() =>
                                setActiveTab(
                                  "compliance",
                                )
                              }
                              className="font-mono text-[10px] uppercase tracking-[0.16em] text-yellow-400 hover:underline"
                            >
                              Review remaining issue
                              {needsReviewCount ===
                              1
                                ? ""
                                : "s"}
                              →
                            </button>
                          )}
                        </div>

                        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">
                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Final score
                            </p>

                            <p className="mt-2 text-2xl font-semibold">
                              {score}
                              <span className="text-sm text-muted-foreground">
                                /100
                              </span>
                            </p>
                          </div>

                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Mandatory clauses
                            </p>

                            <p className="mt-2 text-2xl font-semibold">
                              {mandatoryCount}
                            </p>
                          </div>

                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Satisfied
                            </p>

                            <p className="mt-2 text-2xl font-semibold text-accent">
                              {satisfiedCount}
                            </p>
                          </div>

                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Needs review
                            </p>

                            <p
                              className={[
                                "mt-2 text-2xl font-semibold",
                                needsReviewCount >
                                0
                                  ? "text-yellow-400"
                                  : "text-accent",
                              ].join(
                                " ",
                              )}
                            >
                              {
                                needsReviewCount
                              }
                            </p>
                          </div>

                          <div className="bg-card p-4">
                            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                              Evidence records
                            </p>

                            <p className="mt-2 text-2xl font-semibold">
                              {
                                evidence.length
                              }
                            </p>
                          </div>
                        </div>

                        {/* Remaining issue */}

                        {needsReviewCount >
                          0 && (
                          <div className="mt-3 flex flex-col gap-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 gap-3">
                              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />

                              <div className="min-w-0">
                                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-yellow-400">
                                  Action required
                                </p>

                                <p className="mt-1 text-sm font-medium">
                                  {
                                    criticFlags[0]
                                      ?.clause_id
                                  }{" "}
                                  still needs review
                                </p>

                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  {
                                    criticFlags[0]
                                      ?.issue
                                  }
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() =>
                                setActiveTab(
                                  "compliance",
                                )
                              }
                              className="shrink-0 rounded border border-yellow-500/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-yellow-400 transition hover:bg-yellow-500/10"
                            >
                              Open compliance review
                            </button>
                          </div>
                        )}

                        {needsReviewCount ===
                          0 && (
                          <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 p-4">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />

                            <div>
                              <p className="text-sm font-medium">
                                All mandatory clauses passed the automated audit.
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                Human sign-off is still required before PDF export.
                              </p>
                            </div>
                          </div>
                        )}
                      </section>
                    )}

                    {/* ==================================================
                        PROPOSAL CARD
                    ================================================== */}

                    <article className="rounded-xl border border-border bg-card/40 shadow-sm">
                      <div className="border-b border-border px-7 py-7 lg:px-9">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                              Proposal Response
                            </p>

                            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
                              {projectTitle ||
                                "RFP Proposal"}
                            </h1>

                            <p className="mt-2 text-sm text-muted-foreground">
                              {draftingStage === "writing"
                                ? "Agent 3 is writing the evidence-backed response into the workspace."
                                : "Evidence-backed submission generated through the ClauseForge agent swarm."}
                            </p>
                          </div>

                          <div className="shrink-0 rounded-lg border border-border bg-background px-4 py-3 sm:min-w-28 sm:text-right">
                            <p className="font-mono text-[9px] uppercase tracking-[0.17em] text-muted-foreground">
                              Compliance
                            </p>

                            <p className="mt-1 text-2xl font-semibold">
                              {score}
                              <span className="text-sm text-muted-foreground">
                                /100
                              </span>
                            </p>

                            {improvement >
                              0 && (
                              <p className="mt-1 font-mono text-[10px] text-accent">
                                +{improvement} after revision
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="px-7 py-8 lg:px-9 lg:py-10">
                        <div className="proposal-content max-w-none text-foreground">
                          <ReactMarkdown
                            remarkPlugins={[
                              remarkGfm,
                            ]}
                            components={{
                              a: ({
                                children,
                                ...props
                              }) => (
                                <a
                                  {...props}
                                  className="text-accent underline underline-offset-2"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {
                                    children
                                  }
                                </a>
                              ),
                            }}
                          >
                            {
                              displayedDraftText
                            }
                          </ReactMarkdown>

                          {draftingStage ===
                            "writing" && (
                            <motion.div
                              initial={{
                                opacity: 0,
                              }}
                              animate={{
                                opacity: 1,
                              }}
                              className="mt-5 inline-flex items-center gap-2 rounded border border-accent/20 bg-accent/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-accent"
                            >
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                              Agent 3 is writing
                              <span className="animate-pulse">
                                ▌
                              </span>
                            </motion.div>
                          )}

                          {draftingStage ===
                            "complete" && (
                            <div className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-400">
                              <Check className="h-3 w-3" />
                              Draft written
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-border px-7 py-4 lg:px-9">
                        <div className="flex flex-col gap-2 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-mono uppercase tracking-widest">
                            Generated by ClauseForge
                          </span>

                          <span>
                            Human sign-off required before export
                          </span>
                        </div>
                      </div>
                    </article>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ==================================================
              COMPLIANCE TAB
          ================================================== */}

          {activeTab ===
            "compliance" && (
            <div className="clauseforge-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto max-w-5xl p-6 lg:p-10">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Final Score
                    </p>

                    <p className="mt-2 text-3xl font-semibold">
                      {score}
                      <span className="text-base text-muted-foreground">
                        /100
                      </span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Initial Score
                    </p>

                    <p className="mt-2 text-3xl font-semibold">
                      {initialScore ??
                        "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Revision Impact
                    </p>

                    <p className="mt-2 text-3xl font-semibold">
                      {initialScore !==
                      null
                        ? `${
                            improvement >
                            0
                              ? "+"
                              : ""
                          }${improvement}`
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Needs Review
                    </p>

                    <p
                      className={[
                        "mt-2 text-3xl font-semibold",
                        needsReviewCount >
                        0
                          ? "text-yellow-400"
                          : "text-accent",
                      ].join(
                        " ",
                      )}
                    >
                      {
                        needsReviewCount
                      }
                    </p>
                  </div>
                </div>

                <section className="mt-8">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Mandatory Clause Audit
                      </p>

                      <h2 className="mt-1 text-lg font-semibold">
                        Compliance Matrix
                      </h2>
                    </div>

                    <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {
                        mandatoryCount
                      }{" "}
                      mandatory clauses
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="grid grid-cols-[90px_minmax(0,1fr)_120px] border-b border-border bg-card px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>
                        Clause
                      </span>

                      <span>
                        Requirement
                      </span>

                      <span className="text-right">
                        Status
                      </span>
                    </div>

                    {requirements
                      .filter(
                        (
                          requirement,
                        ) =>
                          requirement.is_mandatory,
                      )
                      .map(
                        (
                          requirement,
                        ) => {
                          const flag =
                            criticFlags.find(
                              (
                                item,
                              ) =>
                                item.clause_id ===
                                requirement.clause_id,
                            );

                          const status =
                            !draftText
                              ? "pending"
                              : flag?.status ||
                                "satisfied";

                          return (
                            <div
                              key={
                                requirement.clause_id
                              }
                              className="grid grid-cols-[90px_minmax(0,1fr)_120px] items-start border-b border-border px-4 py-4 last:border-b-0"
                            >
                              <span className="font-mono text-xs font-medium">
                                {
                                  requirement.clause_id
                                }
                              </span>

                              <span className="pr-5 text-sm leading-relaxed text-muted-foreground">
                                {
                                  requirement.description
                                }
                              </span>

                              <div className="flex justify-end">
                                <span
                                  className={[
                                    "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] uppercase",
                                    status ===
                                      "satisfied"
                                      ? "border-accent/30 bg-accent/10 text-accent"
                                      : status ===
                                          "partial"
                                        ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                                        : status ===
                                            "missing"
                                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                                          : "border-border text-muted-foreground",
                                  ].join(
                                    " ",
                                  )}
                                >
                                  {status ===
                                  "satisfied" ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <AlertTriangle className="h-3 w-3" />
                                  )}

                                  {status}
                                </span>
                              </div>
                            </div>
                          );
                        },
                      )}

                    {mandatoryCount ===
                      0 && (
                      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No mandatory requirements were parsed.
                      </div>
                    )}
                  </div>
                </section>

                {/* Findings */}

                <section className="mt-8">
                  <div className="mb-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Adversarial Review
                    </p>

                    <h2 className="mt-1 text-lg font-semibold">
                      Critic Findings
                    </h2>
                  </div>

                  {criticFlags.length ===
                  0 ? (
                    <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 p-5">
                      <CheckCircle2 className="h-5 w-5 text-accent" />

                      <div>
                        <p className="text-sm font-medium">
                          No blocking mandatory risks detected.
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          The final proposal passed the automated compliance audit.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {criticFlags.map(
                        (
                          flag,
                        ) => (
                          <div
                            key={`${flag.clause_id}-${flag.issue}`}
                            className="rounded-lg border border-border bg-card p-5"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-400" />

                                <span className="font-mono text-xs font-medium">
                                  {
                                    flag.clause_id
                                  }
                                </span>
                              </div>

                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                {
                                  flag.severity
                                }
                              </span>
                            </div>

                            <p className="mt-4 text-sm leading-relaxed">
                              {flag.issue}
                            </p>

                            <div className="mt-4 border-l-2 border-border pl-4">
                              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                Recommendation
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {
                                  flag.suggestion
                                }
                              </p>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* ==================================================
              EVIDENCE TAB
          ================================================== */}

          {activeTab ===
            "evidence" && (
            <div className="clauseforge-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className="mx-auto max-w-5xl p-6 lg:p-10">
                <div className="mb-7">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Provenance Layer
                  </p>

                  <h2 className="mt-1 text-xl font-semibold">
                    Evidence Trace
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Every retrieved company claim shown here originates from the local verified evidence knowledge base.
                  </p>
                </div>

                {evidence.length ===
                0 ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-border">
                    <div className="text-center">
                      <Database className="mx-auto h-7 w-7 text-muted-foreground" />

                      <p className="mt-4 text-sm font-medium">
                        No evidence retrieved yet.
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Run the agent swarm to populate the evidence trace.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {evidence.map(
                      (
                        item,
                        index,
                      ) => (
                        <motion.div
                          key={`${item.source_id}-${item.requirement_id}-${index}`}
                          initial={{
                            opacity: 0,
                            y: 8,
                          }}
                          animate={{
                            opacity: 1,
                            y: 0,
                          }}
                          transition={{
                            ...spring,
                            delay:
                              index *
                              0.02,
                          }}
                          className="rounded-lg border border-border bg-card p-5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded border border-border px-2 py-1 font-mono text-[10px] text-accent">
                                {
                                  item.requirement_id
                                }
                              </span>

                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                {
                                  item.source_type
                                }
                              </span>
                            </div>

                            <span className="font-mono text-[10px] text-muted-foreground">
                              Relevance{" "}
                              {(
                                item.relevance_score *
                                100
                              ).toFixed(
                                0,
                              )}
                              %
                            </span>
                          </div>

                          <h3 className="mt-4 text-sm font-semibold">
                            {
                              item.title
                            }
                          </h3>

                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {
                              item.content
                            }
                          </p>

                          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              Source ID
                            </span>

                            <span className="font-mono text-[10px] text-foreground">
                              {
                                item.source_id
                              }
                            </span>
                          </div>
                        </motion.div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================
              ACTIVITY TERMINAL
          ================================================== */}

          <div className="shrink-0 border-t border-border bg-[#090a0c]">
            <div className="flex h-10 items-center justify-between border-b border-border px-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Agent Activity
              </span>

              <span
                className={[
                  "shrink-0 font-mono text-[10px] uppercase tracking-widest",
                  running
                    ? "text-accent"
                    : "text-muted-foreground",
                ].join(
                  " ",
                )}
              >
                {running
                  ? "LIVE"
                  : "READY"}
              </span>
            </div>

            <div
              ref={termRef}
              className="clauseforge-activity-scroll h-44 overflow-y-auto overflow-x-hidden px-5 py-3"
            >
              {lines.length ===
              0 ? (
                <p className="font-mono text-[11px] leading-5 text-muted-foreground">
                  Waiting for swarm execution...
                </p>
              ) : (
                <div className="space-y-1">
                  {lines.map(
                    (
                      line,
                      index,
                    ) => (
                      <p
                        key={`${line.text}-${index}`}
                        className={[
                          "break-words font-mono text-[11px] leading-5",
                          line.tone ===
                          "success"
                            ? "text-emerald-400"
                            : line.tone ===
                                "warning"
                              ? "text-yellow-400"
                              : line.tone ===
                                  "error"
                                ? "text-red-400"
                                : "text-muted-foreground",
                        ].join(
                          " ",
                        )}
                      >
                        {line.text}
                      </p>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}