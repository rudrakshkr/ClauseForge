import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Download,
  Upload,
  Check,
} from "lucide-react";
import { spring } from "./motion";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const API_BASE_URL =
  import.meta.env["VITE_API_BASE_URL"] ||
  "http://127.0.0.1:8000";

const NODES = [
  "Document Parser",
  "Evidence Retriever",
  "Drafting LLM",
  "Critic Engine",
];

type CriticFlag = {
  clause_id: string;
  status: "satisfied" | "partial" | "missing";
  severity: "low" | "medium" | "high";
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

type Requirement = {
  clause_id: string;
  description: string;
  is_mandatory: boolean;
};

type WorkspaceTab =
  | "proposal"
  | "compliance"
  | "evidence";

export function Dashboard({
  onBack,
}: {
  onBack: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [approved, setApproved] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<WorkspaceTab>("proposal");

  const termRef =
    useRef<HTMLDivElement>(null);

  const [activeNode, setActiveNode] =
    useState(0);
  const [score, setScore] = useState(0);
  const [initialScore, setInitialScore] =
    useState(0);
  const [draftText, setDraftText] =
    useState("");
  const [criticFlags, setCriticFlags] =
    useState<CriticFlag[]>([]);
  const [evidence, setEvidence] =
    useState<EvidenceRecord[]>([]);
  const [requirements, setRequirements] =
    useState<Requirement[]>([]);

  useEffect(() => {
    termRef.current?.scrollTo({
      top: termRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  // ------------------------------------------------------------
  // RESET WORKSPACE
  // ------------------------------------------------------------

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setScore(0);
    setInitialScore(0);
    setDraftText("");
    setCriticFlags([]);
    setEvidence([]);
    setRequirements([]);
    setApproved(false);
    setLines([]);
    setActiveNode(0);
    setActiveTab("proposal");
  };

  // ------------------------------------------------------------
  // PDF EXPORT
  // ------------------------------------------------------------

  const exportProposal = () => {
    if (!draftText) return;

    type RGB = [number, number, number];

    const doc = new jsPDF({
      unit: "pt",
      format: "a4",
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();
    const pageHeight =
      doc.internal.pageSize.getHeight();

    const margin = 52;
    const contentWidth =
      pageWidth - margin * 2;

    const navy: RGB = [24, 32, 48];
    const muted: RGB = [100, 108, 120];
    const light: RGB = [244, 246, 248];
    const border: RGB = [220, 224, 230];
    const green: RGB = [32, 120, 72];
    const amber: RGB = [180, 120, 20];
    const red: RGB = [180, 55, 55];

    let y = 52;

    const ensureSpace = (
      height: number,
    ) => {
      if (
        y + height >
        pageHeight - 52
      ) {
        doc.addPage();
        y = 58;
      }
    };

    const addWrappedText = (
      text: string,
      fontSize = 10,
      lineGap = 4,
      bold = false,
    ) => {
      doc.setFont(
        "helvetica",
        bold ? "bold" : "normal",
      );

      doc.setFontSize(fontSize);

      doc.setTextColor(
        navy[0],
        navy[1],
        navy[2],
      );

      const wrappedLines =
        doc.splitTextToSize(
          text,
          contentWidth,
        ) as string[];

      const lineHeight =
        fontSize * 1.45;

      for (
        const currentLine of wrappedLines
      ) {
        ensureSpace(lineHeight);

        doc.text(
          currentLine,
          margin,
          y,
        );

        y += lineHeight;
      }

      y += lineGap;
    };

    const addHeading = (
      text: string,
      size: number,
      topSpacing: number,
      bottomSpacing: number,
    ) => {
      y += topSpacing;

      ensureSpace(
        size +
          bottomSpacing +
          10,
      );

      doc.setFont(
        "helvetica",
        "bold",
      );

      doc.setFontSize(size);

      doc.setTextColor(
        navy[0],
        navy[1],
        navy[2],
      );

      doc.text(
        text,
        margin,
        y,
      );

      y += 8;

      doc.setDrawColor(
        border[0],
        border[1],
        border[2],
      );

      doc.setLineWidth(0.7);

      doc.line(
        margin,
        y,
        pageWidth - margin,
        y,
      );

      y += bottomSpacing;
    };

    const addBullet = (
      text: string,
    ) => {
      ensureSpace(24);

      doc.setFont(
        "helvetica",
        "normal",
      );

      doc.setFontSize(10);

      doc.setTextColor(
        navy[0],
        navy[1],
        navy[2],
      );

      const bulletX =
        margin + 4;
      const textX =
        margin + 16;

      doc.text(
        "•",
        bulletX,
        y,
      );

      const wrappedLines =
        doc.splitTextToSize(
          text,
          contentWidth - 16,
        ) as string[];

      const lineHeight =
        10 * 1.45;

      wrappedLines.forEach(
        (
          currentLine: string,
          lineIndex: number,
        ) => {
          if (
            lineIndex > 0
          ) {
            ensureSpace(
              lineHeight,
            );
          }

          doc.text(
            currentLine,
            textX,
            y,
          );

          y += lineHeight;
        },
      );

      y += 4;
    };

    const cleanInlineMarkdown = (
      text: string,
    ): string =>
      text
        .replace(
          /\*\*(.*?)\*\*/g,
          "$1",
        )
        .replace(
          /\*(.*?)\*/g,
          "$1",
        )
        .replace(
          /`(.*?)`/g,
          "$1",
        )
        .replace(
          /\[(.*?)\]\(.*?\)/g,
          "$1",
        )
        .replace(
          /~~(.*?)~~/g,
          "$1",
        )
        .trim();

    const parseTableRow = (
      line: string,
    ): string[] =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(
          (cell) =>
            cleanInlineMarkdown(
              cell,
            ),
        );

    const isTableSeparator = (
      line: string,
    ): boolean => {
      const cells =
        parseTableRow(line);

      return (
        cells.length > 0 &&
        cells.every(
          (cell) =>
            /^:?-{3,}:?$/.test(
              cell,
            ),
        )
      );
    };

    // ============================================================
    // COVER
    // ============================================================

    doc.setFillColor(
      navy[0],
      navy[1],
      navy[2],
    );

    doc.rect(
      0,
      0,
      pageWidth,
      118,
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

    doc.setFontSize(25);

    doc.text(
      "BidBot",
      margin,
      54,
    );

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(11);

    doc.text(
      "AI-Assisted RFP Proposal Workspace",
      margin,
      76,
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(18);

    doc.text(
      "Proposal Response",
      margin,
      101,
    );

    y = 150;

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(9);

    doc.setTextColor(
      muted[0],
      muted[1],
      muted[2],
    );

    doc.text(
      "Prepared for: RFP submission",
      margin,
      y,
    );

    doc.text(
      "Submitted by: Northwind Digital",
      margin,
      y + 16,
    );

    doc.text(
      `Generated: ${new Date().toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        },
      )}`,
      margin,
      y + 32,
    );

    y += 68;

    // ============================================================
    // SCORE CARD
    // ============================================================

    doc.setFillColor(
      light[0],
      light[1],
      light[2],
    );

    doc.setDrawColor(
      border[0],
      border[1],
      border[2],
    );

    doc.roundedRect(
      margin,
      y,
      contentWidth,
      86,
      8,
      8,
      "FD",
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(10);

    doc.setTextColor(
      muted[0],
      muted[1],
      muted[2],
    );

    doc.text(
      "COMPLIANCE ASSESSMENT",
      margin + 16,
      y + 22,
    );

    doc.setFont(
      "helvetica",
      "bold",
    );

    doc.setFontSize(30);

    doc.setTextColor(
      navy[0],
      navy[1],
      navy[2],
    );

    doc.text(
      `${score}/100`,
      margin + 16,
      y + 57,
    );

    const scoreColor: RGB =
      score >= 85
        ? green
        : score >= 70
          ? amber
          : red;

    doc.setFillColor(
      225,
      228,
      232,
    );

    doc.roundedRect(
      margin + 110,
      y + 40,
      contentWidth - 126,
      10,
      5,
      5,
      "F",
    );

    doc.setFillColor(
      scoreColor[0],
      scoreColor[1],
      scoreColor[2],
    );

    doc.roundedRect(
      margin + 110,
      y + 40,
      ((contentWidth - 126) *
        Math.min(
          score,
          100,
        )) /
        100,
      10,
      5,
      5,
      "F",
    );

    doc.setFont(
      "helvetica",
      "normal",
    );

    doc.setFontSize(9);

    doc.setTextColor(
      muted[0],
      muted[1],
      muted[2],
    );

    doc.text(
      criticFlags.length === 0
        ? "No compliance risks flagged"
        : `${criticFlags.length} compliance risk${
            criticFlags.length ===
            1
              ? ""
              : "s"
          } require attention`,
      margin + 110,
      y + 65,
    );

    y += 112;

    // ============================================================
    // COMPLIANCE REVIEW
    // ============================================================

    addHeading(
      "Compliance Review",
      16,
      0,
      16,
    );

    if (
      criticFlags.length === 0
    ) {
      doc.setFillColor(
        236,
        248,
        240,
      );

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        48,
        6,
        6,
        "F",
      );

      doc.setFont(
        "helvetica",
        "bold",
      );

      doc.setFontSize(10);

      doc.setTextColor(
        green[0],
        green[1],
        green[2],
      );

      doc.text(
        "✓ No compliance risks were identified.",
        margin + 14,
        y + 29,
      );

      y += 66;
    } else {
      criticFlags.forEach(
        (flag) => {
          const severityColor: RGB =
            flag.severity ===
            "high"
              ? red
              : flag.severity ===
                  "medium"
                ? amber
                : green;

          const issueLines =
            doc.splitTextToSize(
              cleanInlineMarkdown(
                flag.issue,
              ),
              contentWidth - 28,
            ) as string[];

          const suggestionLines =
            doc.splitTextToSize(
              `Recommendation: ${cleanInlineMarkdown(
                flag.suggestion,
              )}`,
              contentWidth - 28,
            ) as string[];

          const cardHeight =
            50 +
            issueLines.length *
              13 +
            suggestionLines.length *
              13;

          ensureSpace(
            cardHeight + 12,
          );

          doc.setFillColor(
            249,
            249,
            250,
          );

          doc.setDrawColor(
            border[0],
            border[1],
            border[2],
          );

          doc.roundedRect(
            margin,
            y,
            contentWidth,
            cardHeight,
            6,
            6,
            "FD",
          );

          doc.setFillColor(
            severityColor[0],
            severityColor[1],
            severityColor[2],
          );

          doc.roundedRect(
            margin,
            y,
            5,
            cardHeight,
            3,
            3,
            "F",
          );

          doc.setFont(
            "helvetica",
            "bold",
          );

          doc.setFontSize(9);

          doc.setTextColor(
            severityColor[0],
            severityColor[1],
            severityColor[2],
          );

          doc.text(
            `${flag.severity.toUpperCase()}  •  CLAUSE ${flag.clause_id}`,
            margin + 16,
            y + 19,
          );

          let cardY =
            y + 39;

          doc.setFont(
            "helvetica",
            "normal",
          );

          doc.setFontSize(9);

          doc.setTextColor(
            navy[0],
            navy[1],
            navy[2],
          );

          issueLines.forEach(
            (
              currentLine: string,
            ) => {
              doc.text(
                currentLine,
                margin + 16,
                cardY,
              );

              cardY += 13;
            },
          );

          cardY += 4;

          doc.setFont(
            "helvetica",
            "bold",
          );

          doc.setFontSize(
            8.5,
          );

          doc.setTextColor(
            muted[0],
            muted[1],
            muted[2],
          );

          suggestionLines.forEach(
            (
              currentLine: string,
            ) => {
              doc.text(
                currentLine,
                margin + 16,
                cardY,
              );

              cardY += 13;
            },
          );

          y +=
            cardHeight + 12;
        },
      );
    }

    // ============================================================
    // PROPOSAL
    // ============================================================

    doc.addPage();
    y = 64;

    const sourceLines =
      draftText
        .replace(/\r/g, "")
        .split("\n");

    let index = 0;

    while (
      index <
      sourceLines.length
    ) {
      const currentLine =
        sourceLines[index] ??
        "";

      const line =
        currentLine.trim();

      if (!line) {
        y += 7;
        index += 1;
        continue;
      }

      // Horizontal rule
      if (
        /^---+$/.test(
          line,
        )
      ) {
        ensureSpace(12);

        doc.setDrawColor(
          border[0],
          border[1],
          border[2],
        );

        doc.setLineWidth(0.6);

        doc.line(
          margin,
          y,
          pageWidth - margin,
          y,
        );

        y += 14;
        index += 1;
        continue;
      }

      // H1
      if (
        line.startsWith(
          "# ",
        )
      ) {
        addHeading(
          cleanInlineMarkdown(
            line.slice(2),
          ),
          20,
          8,
          18,
        );

        index += 1;
        continue;
      }

      // H2
      if (
        line.startsWith(
          "## ",
        )
      ) {
        addHeading(
          cleanInlineMarkdown(
            line.slice(3),
          ),
          15,
          14,
          14,
        );

        index += 1;
        continue;
      }

      // H3
      if (
        line.startsWith(
          "### ",
        )
      ) {
        ensureSpace(28);

        y += 10;

        doc.setFont(
          "helvetica",
          "bold",
        );

        doc.setFontSize(12);

        doc.setTextColor(
          navy[0],
          navy[1],
          navy[2],
        );

        doc.text(
          cleanInlineMarkdown(
            line.slice(4),
          ),
          margin,
          y,
        );

        y += 20;
        index += 1;
        continue;
      }

      // Markdown table
      const nextLine =
        sourceLines[index + 1]
          ?.trim() ?? "";

      if (
        line.startsWith(
          "|",
        ) &&
        line.endsWith("|") &&
        nextLine.startsWith(
          "|",
        )
      ) {
        const tableLines: string[] =
          [];

        while (
          index <
          sourceLines.length
        ) {
          const tableLine =
            sourceLines[index]
              ?.trim() ?? "";

          if (
            !tableLine.startsWith(
              "|",
            ) ||
            !tableLine.endsWith(
              "|",
            )
          ) {
            break;
          }

          tableLines.push(
            tableLine,
          );

          index += 1;
        }

        const headerLine =
          tableLines[0];

        if (
          headerLine !==
            undefined &&
          tableLines.length >=
            2
        ) {
          const headers =
            parseTableRow(
              headerLine,
            );

          const body =
            tableLines
              .slice(1)
              .filter(
                (
                  tableLine,
                ) =>
                  !isTableSeparator(
                    tableLine,
                  ),
              )
              .map(
                parseTableRow,
              );

          ensureSpace(80);

          autoTable(doc, {
            startY: y,

            margin: {
              left: margin,
              right: margin,
            },

            tableWidth:
              contentWidth,

            head: [headers],

            body,

            theme: "grid",

            styles: {
              font: "helvetica",
              fontSize: 7.5,
              cellPadding: 5,
              textColor:
                navy as RGB,
              lineColor:
                border as RGB,
              lineWidth: 0.5,
              overflow:
                "linebreak",
              valign:
                "top",
            },

            headStyles: {
              fillColor:
                navy as RGB,
              textColor:
                [255, 255, 255] as RGB,
              fontStyle: "bold",
              fontSize: 7.5,
            },

            alternateRowStyles: {
              fillColor:
                [249, 250, 251] as RGB,
            },
          });

          const autoTableDocument =
            doc as jsPDF & {
              lastAutoTable?: {
                finalY?: number;
              };
            };

          const finalY =
            autoTableDocument
              .lastAutoTable
              ?.finalY;

          y =
            typeof finalY ===
            "number"
              ? finalY + 18
              : y + 18;
        }

        continue;
      }

      // Bullets
      if (
        /^[-*]\s+/.test(
          line,
        )
      ) {
        addBullet(
          cleanInlineMarkdown(
            line.replace(
              /^[-*]\s+/,
              "",
            ),
          ),
        );

        index += 1;
        continue;
      }

      // Numbered list
      if (
        /^\d+\.\s+/.test(
          line,
        )
      ) {
        const match =
          line.match(
            /^(\d+)\.\s+(.*)$/,
          );

        const number =
          match?.[1];

        const numberedText =
          match?.[2];

        if (
          number !==
            undefined &&
          numberedText !==
            undefined
        ) {
          ensureSpace(24);

          doc.setFont(
            "helvetica",
            "bold",
          );

          doc.setFontSize(10);

          doc.setTextColor(
            navy[0],
            navy[1],
            navy[2],
          );

          doc.text(
            `${number}.`,
            margin + 2,
            y,
          );

          const numberedLines =
            doc.splitTextToSize(
              cleanInlineMarkdown(
                numberedText,
              ),
              contentWidth - 18,
            ) as string[];

          const lineHeight =
            14;

          numberedLines.forEach(
            (
              numberedLine: string,
              numberedIndex: number,
            ) => {
              if (
                numberedIndex > 0
              ) {
                ensureSpace(
                  lineHeight,
                );
              }

              doc.setFont(
                "helvetica",
                "normal",
              );

              doc.text(
                numberedLine,
                margin + 16,
                y,
              );

              y += lineHeight;
            },
          );

          y += 4;
        }

        index += 1;
        continue;
      }

      // Normal paragraph
      addWrappedText(
        cleanInlineMarkdown(line),
        10,
        6,
      );

      index += 1;
    }

    // ============================================================
    // HEADERS / FOOTERS
    // ============================================================

    const pageCount =
      doc.getNumberOfPages();

    for (
      let page = 1;
      page <= pageCount;
      page += 1
    ) {
      doc.setPage(page);

      if (page > 1) {
        doc.setDrawColor(
          border[0],
          border[1],
          border[2],
        );

        doc.setLineWidth(0.5);

        doc.line(
          margin,
          34,
          pageWidth - margin,
          34,
        );

        doc.setFont(
          "helvetica",
          "normal",
        );

        doc.setFontSize(8);

        doc.setTextColor(
          muted[0],
          muted[1],
          muted[2],
        );

        doc.text(
          "BidBot • Proposal Response",
          margin,
          26,
        );
      }

      doc.setDrawColor(
        border[0],
        border[1],
        border[2],
      );

      doc.line(
        margin,
        pageHeight - 38,
        pageWidth - margin,
        pageHeight - 38,
      );

      doc.setFont(
        "helvetica",
        "normal",
      );

      doc.setFontSize(8);

      doc.setTextColor(
        muted[0],
        muted[1],
        muted[2],
      );

      doc.text(
        "Northwind Digital",
        margin,
        pageHeight - 22,
      );

      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 22,
        {
          align: "right",
        },
      );
    }

    doc.save(
      "BidBot-Proposal.pdf",
    );

    setApproved(true);
  };

  // ------------------------------------------------------------
  // AGENT PIPELINE
  // ------------------------------------------------------------

  const runAgentSwarm = async () => {
    if (!selectedFile) {
      alert(
        "Please upload an RFP Document first.",
      );
      return;
    }

    setRunning(true);
    setLines([]);
    setScore(0);
    setInitialScore(0);
    setDraftText("");
    setCriticFlags([]);
    setEvidence([]);
    setRequirements([]);
    setApproved(false);
    setActiveTab("proposal");

    try {
      // ==========================================================
      // AGENT 1 — PARSER
      // ==========================================================

      setActiveNode(0);

      setLines((prev) => [
        ...prev,
        "✦ [Parser Node] Ingesting PDF and extracting constraints...",
      ]);

      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile,
      );

      const parseRes =
        await fetch(
          `${API_BASE_URL}/api/1-parse-rfp`,
          {
            method: "POST",
            body: formData,
          },
        );

      if (!parseRes.ok) {
        let errorMessage =
          `RFP parsing failed: ${parseRes.status}`;

        try {
          const errorData =
            await parseRes.json();

          if (
            typeof errorData.detail ===
            "string"
          ) {
            errorMessage =
              errorData.detail;
          }
        } catch {
          // Keep fallback.
        }

        throw new Error(
          errorMessage,
        );
      }

      const parsedData =
        await parseRes.json();

      const parsedRequirements: Requirement[] =
        parsedData.requirements ||
        [];

      setRequirements(
        parsedRequirements,
      );

      setLines((prev) => [
        ...prev,
        `✦ [Parser Node] ✓ Extracted ${parsedRequirements.length} mandatory rules from "${parsedData.project_title}"`,
      ]);

      // ==========================================================
      // AGENT 2 — RETRIEVER
      // ==========================================================

      setActiveNode(1);

      setLines((prev) => [
        ...prev,
        "✦ [Evidence Retriever] Searching verified company evidence...",
      ]);

      const retrievalRes =
        await fetch(
          `${API_BASE_URL}/api/2-retrieve-context`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              requirements:
                parsedRequirements,
            }),
          },
        );

      if (!retrievalRes.ok) {
        throw new Error(
          `Evidence retrieval failed: ${retrievalRes.status}`,
        );
      }

      const retrievalData =
        await retrievalRes.json();

      const retrievedEvidence: EvidenceRecord[] =
        retrievalData.evidence ||
        [];

      setEvidence(
        retrievedEvidence,
      );

      setLines((prev) => [
        ...prev,
        `✦ [Evidence Retriever] ✓ Found ${retrievedEvidence.length} relevant verified evidence records.`,
      ]);

      // ==========================================================
      // AGENT 3 — DRAFT
      // ==========================================================

      setActiveNode(2);

      setLines((prev) => [
        ...prev,
        "✦ [Drafting LLM] Writing evidence-grounded proposal draft...",
      ]);

      const draftRes =
        await fetch(
          `${API_BASE_URL}/api/2-draft-proposal`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              requirements:
                parsedRequirements,
              evidence:
                retrievedEvidence,
            }),
          },
        );

      if (!draftRes.ok) {
        throw new Error(
          `Proposal drafting failed: ${draftRes.status}`,
        );
      }

      const draftData =
        await draftRes.json();

      setDraftText(
        draftData.draft,
      );

      setLines((prev) => [
        ...prev,
        "✦ [Drafting LLM] ✓ Draft complete. Initiating adversarial review.",
      ]);

      // ==========================================================
      // AGENT 4 — FIRST CRITIC
      // ==========================================================

      setActiveNode(3);

      setLines((prev) => [
        ...prev,
        "✦ [Critic Engine] Adversarial compliance audit started...",
      ]);

      const criticRes =
        await fetch(
          `${API_BASE_URL}/api/3-critic-review`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              requirements:
                parsedRequirements,
              draft:
                draftData.draft,
            }),
          },
        );

      if (!criticRes.ok) {
        throw new Error(
          `Compliance review failed: ${criticRes.status}`,
        );
      }

      let criticData =
        await criticRes.json();

      const firstScore =
        criticData.compliance_score ||
        0;

      setInitialScore(
        firstScore,
      );

      setLines((prev) => [
        ...prev,
        `✦ [Critic Engine] ${criticData.flags?.length || 0} compliance risks identified.`,
      ]);

      // ==========================================================
      // ONE REVISION CYCLE
      // ==========================================================

      if (
        criticData.flags &&
        criticData.flags.length > 0
      ) {
        setActiveNode(2);

        setLines((prev) => [
          ...prev,
          "✦ [Drafting LLM] Critic feedback received. Revising proposal...",
        ]);

        const revisionRes =
          await fetch(
            `${API_BASE_URL}/api/2-draft-proposal`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                requirements:
                  parsedRequirements,
                evidence:
                  retrievedEvidence,
                previous_draft:
                  draftData.draft,
                critic_feedback:
                  criticData.flags,
              }),
            },
          );

        if (!revisionRes.ok) {
          throw new Error(
            `Proposal revision failed: ${revisionRes.status}`,
          );
        }

        const revisionData =
          await revisionRes.json();

        setDraftText(
          revisionData.draft,
        );

        setLines((prev) => [
          ...prev,
          "✦ [Drafting LLM] ✓ Revision complete. Re-running compliance audit...",
        ]);

        // ========================================================
        // SECOND CRITIC
        // ========================================================

        setActiveNode(3);

        const secondCriticRes =
          await fetch(
            `${API_BASE_URL}/api/3-critic-review`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                requirements:
                  parsedRequirements,
                draft:
                  revisionData.draft,
              }),
            },
          );

        if (!secondCriticRes.ok) {
          throw new Error(
            `Re-review failed: ${secondCriticRes.status}`,
          );
        }

        criticData =
          await secondCriticRes.json();

        setLines((prev) => [
          ...prev,
          `✦ [Critic Engine] ✓ Re-audit complete. ${
            criticData.flags?.length ||
            0
          } risks remain.`,
        ]);
      }

      // ==========================================================
      // FINAL RESULT
      // ==========================================================

      const finalScore =
        criticData.compliance_score ||
        0;

      const improvement =
        finalScore - firstScore;

      setCriticFlags(
        criticData.flags || [],
      );

      setScore(finalScore);

      if (
        criticData.flags &&
        criticData.flags.length > 0
      ) {
        setLines((prev) => [
          ...prev,
          `✦ [Critic Engine] ✗ ${criticData.flags.length} compliance risks remain after revision.`,
        ]);
      } else {
        setLines((prev) => [
          ...prev,
          "✦ [Critic Engine] ✓ Audit passed cleanly.",
        ]);
      }

      setLines((prev) => [
        ...prev,
        `✦ [System] Swarm complete. Score: ${finalScore}/100.` +
          (improvement !== 0
            ? ` Improvement: ${
                improvement > 0
                  ? "+"
                  : ""
              }${improvement} points.`
            : "") +
          " Awaiting human sign-off.",
      ]);

      setActiveNode(4);
    } catch (error) {
      console.error(
        "Agent Swarm Failed:",
        error,
      );

      setLines((prev) => [
        ...prev,
        `✦ [ERROR] ${
          error instanceof Error
            ? error.message
            : "Agent pipeline failed."
        }`,
      ]);
    } finally {
      setRunning(false);
    }
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="flex h-screen flex-col">
      {/* ========================================================
          HEADER
      ======================================================== */}

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <span className="h-4 w-px bg-border" />

          <nav className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">
              Active Bids
            </span>

            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />

            <span className="font-medium">
              {selectedFile
                ? selectedFile.name
                : "New Workspace"}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">
                Compliance Score
              </span>

              {initialScore > 0 &&
                score > 0 &&
                initialScore !==
                  score && (
                  <span
                    className={`font-mono text-[10px] ${
                      score >
                      initialScore
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    Initial{" "}
                    {initialScore}{" "}
                    → Final{" "}
                    {score}
                  </span>
                )}
            </div>

            <div className="h-1.5 w-28 overflow-hidden bg-secondary">
              <motion.div
                className="h-full bg-accent"
                animate={{
                  width: `${score}%`,
                }}
                transition={spring}
              />
            </div>

            <span className="w-9 font-mono text-sm tabular-nums">
              {score}%
            </span>
          </div>

          <motion.button
            whileTap={{
              scale: 0.96,
            }}
            transition={spring}
            disabled={
              running || !draftText
            }
            onClick={
              exportProposal
            }
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {approved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}

            {approved
              ? "Approved — Exported"
              : "Approve & Export PDF"}
          </motion.button>
        </div>
      </header>

      {/* ========================================================
          THREE COLUMN WORKSPACE
      ======================================================== */}

      <div className="grid min-h-0 flex-1 grid-cols-[25%_30%_45%]">
        {/* ======================================================
            COLUMN 1 — INPUT
        ====================================================== */}

        <section className="flex flex-col gap-5 border-r border-border p-5">
          <Label>Input</Label>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() =>
              setDrag(false)
            }
            onDrop={(event) => {
              event.preventDefault();
              setDrag(false);

              const file =
                event.dataTransfer
                  .files[0];

              if (file) {
                handleFileSelected(
                  file,
                );
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-10 text-center transition-colors ${
              drag
                ? "border-accent bg-secondary"
                : "border-input hover:bg-card"
            }`}
          >
            <Upload
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
            />

            <span className="text-sm">
              Upload RFP (PDF)
            </span>

            <span className="text-xs text-muted-foreground">
              Drag & drop or click
            </span>

            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(
                event,
              ) => {
                const file =
                  event.target
                    .files?.[0];

                if (file) {
                  handleFileSelected(
                    file,
                  );
                }
              }}
            />
          </label>

          {selectedFile && (
            <div className="flex items-center justify-between border border-border bg-card px-3 py-2 font-mono text-xs">
              <span className="truncate">
                {selectedFile.name}
              </span>

              <span className="text-success">
                ready
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">
              Evidence Knowledge Base
            </span>

            <select className="h-9 rounded border border-input bg-card px-2 text-sm text-foreground outline-none focus:border-accent">
              <option>
                local://verified-evidence
                {" "}
                (10 records)
              </option>
            </select>
          </div>

          <motion.button
            whileTap={{
              scale: 0.97,
            }}
            transition={spring}
            disabled={running}
            onClick={
              runAgentSwarm
            }
            className="mt-auto cursor-pointer rounded border border-border bg-secondary py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {running
              ? "Swarm running…"
              : "Deploy Agent Swarm"}
          </motion.button>
        </section>

        {/* ======================================================
            COLUMN 2 — AGENT GRAPH + LOG
        ====================================================== */}

        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="border-b border-border p-5">
            <Label>Agent Graph</Label>

            <div className="mt-5 flex flex-col gap-2">
              {NODES.map(
                (node, index) => {
                  const state =
                    running
                      ? index <
                        activeNode
                        ? "done"
                        : index ===
                            activeNode
                          ? "live"
                          : "idle"
                      : activeNode ===
                          4
                        ? "done"
                        : "idle";

                  return (
                    <div
                      key={node}
                    >
                      <motion.div
                        layout
                        transition={
                          spring
                        }
                        className={`flex items-center justify-between border px-3 py-2 font-mono text-xs ${
                          state === "live"
                            ? "border-accent text-foreground"
                            : state ===
                                "done"
                              ? "border-border text-foreground"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        <span>
                          [{node}]
                        </span>

                        <span
                          className={`h-1.5 w-1.5 ${
                            state ===
                            "live"
                              ? "animate-pulse bg-accent"
                              : state ===
                                  "done"
                                ? "bg-success"
                                : "bg-muted"
                          }`}
                        />
                      </motion.div>

                      {index <
                        NODES.length -
                          1 && (
                        <div className="py-0.5 pl-4 font-mono text-xs text-muted-foreground">
                          {index ===
                          2
                            ? "↕"
                            : "↓"}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-terminal">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">
                swarm.log
              </span>

              <span
                className={`font-mono text-xs ${
                  running
                    ? "text-success"
                    : "text-muted-foreground"
                }`}
              >
                {running
                  ? "● live"
                  : "○ idle"}
              </span>
            </div>

            <div
              ref={termRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-6"
            >
              {lines.map(
                (line, index) => (
                  <motion.div
                    key={index}
                    initial={{
                      opacity: 0,
                      x: -6,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    transition={
                      spring
                    }
                    className={
                      line.includes(
                        "✗",
                      ) ||
                      line.includes(
                        "ERROR",
                      )
                        ? "text-destructive"
                        : line.includes(
                              "✓",
                            ) ||
                            line.includes(
                              "Score:",
                            ) ||
                            line.includes(
                              "Improvement:",
                            )
                          ? "text-success"
                          : "text-muted-foreground"
                    }
                  >
                    <span className="text-muted-foreground/50">
                      {String(
                        index + 1,
                      ).padStart(
                        3,
                        "0",
                      )}{" "}
                    </span>

                    {line}
                  </motion.div>
                ),
              )}

              {running && (
                <span className="animate-pulse text-success">
                  ▌
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ======================================================
            COLUMN 3 — WORKSPACE
        ====================================================== */}

        <section className="flex min-h-0 flex-col overflow-hidden bg-background">
          {/* Workspace Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-1">
              <WorkspaceTabButton
                active={
                  activeTab ===
                  "proposal"
                }
                onClick={() =>
                  setActiveTab(
                    "proposal",
                  )
                }
              >
                Proposal
              </WorkspaceTabButton>

              <WorkspaceTabButton
                active={
                  activeTab ===
                  "compliance"
                }
                onClick={() =>
                  setActiveTab(
                    "compliance",
                  )
                }
              >
                Compliance
              </WorkspaceTabButton>

              <WorkspaceTabButton
                active={
                  activeTab ===
                  "evidence"
                }
                onClick={() =>
                  setActiveTab(
                    "evidence",
                  )
                }
              >
                Evidence
              </WorkspaceTabButton>
            </div>

            <span className="font-mono text-xs text-muted-foreground">
              {activeTab ===
              "proposal"
                ? draftText
                  ? "Live Edit"
                  : "Awaiting Swarm"
                : activeTab ===
                    "compliance"
                  ? `${requirements.length} clauses`
                  : `${evidence.length} records`}
            </span>
          </div>

          {/* ====================================================
              PROPOSAL TAB
          ==================================================== */}

          {activeTab ===
            "proposal" && (
            <article className="mx-auto w-full max-w-3xl overflow-y-auto px-8 py-8">
              {draftText ? (
                <div className="text-sm leading-relaxed text-foreground [&>h1]:mb-6 [&>h1]:text-3xl [&>h1]:font-bold [&>h2]:mb-4 [&>h2]:mt-10 [&>h2]:border-b [&>h2]:border-border [&>h2]:pb-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h3]:mb-3 [&>h3]:mt-6 [&>h3]:text-lg [&>h3]:font-medium [&>p]:mb-5 [&>ul]:mb-5 [&>ul]:list-outside [&>ul]:list-disc [&>ul]:pl-5 [&>li]:mb-2">
                  <ReactMarkdown>
                    {draftText}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="mt-32 text-center font-mono text-sm text-muted-foreground">
                  [ Document empty. Deploy swarm to generate draft. ]
                </div>
              )}

              {draftText && (
                <div className="mt-16 border-t border-border pt-6 font-mono text-xs text-muted-foreground">
                  Reviewer sign-off:{" "}
                  {approved
                    ? "Human-in-the-loop · approved"
                    : "pending"}
                </div>
              )}
            </article>
          )}

          {/* ====================================================
              COMPLIANCE TAB
          ==================================================== */}

          {activeTab ===
            "compliance" && (
            <article className="flex-1 overflow-y-auto px-6 py-6">
              {/* Score summary */}
              <div className="mb-6 grid grid-cols-3 gap-3">
                <MetricCard
                  label="Final Score"
                  value={`${score}/100`}
                />

                <MetricCard
                  label="Initial Score"
                  value={
                    initialScore > 0
                      ? `${initialScore}/100`
                      : "—"
                  }
                />

                <MetricCard
                  label="Improvement"
                  value={
                    initialScore > 0 &&
                    score !== 0
                      ? `${
                          score -
                          initialScore >
                          0
                            ? "+"
                            : ""
                        }${
                          score -
                          initialScore
                        }`
                      : "—"
                  }
                />
              </div>

              {/* Compliance Matrix */}
              <div className="rounded-lg border border-border bg-card/30 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">
                      Compliance Matrix
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      Requirement-level audit status
                    </div>
                  </div>

                  <span className="font-mono text-xs text-muted-foreground">
                    {
                      requirements.length
                    }{" "}
                    clauses
                  </span>
                </div>

                {requirements.length >
                0 ? (
                  <div className="overflow-hidden rounded border border-border">
                    <div className="grid grid-cols-[70px_1fr_100px_1.2fr] border-b border-border bg-secondary/50 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>
                        Clause
                      </span>

                      <span>
                        Requirement
                      </span>

                      <span>
                        Status
                      </span>

                      <span>
                        Evidence
                      </span>
                    </div>

                    {requirements.map(
                      (requirement) => {
                        const flag =
                          criticFlags.find(
                            (item) =>
                              item.clause_id ===
                              requirement.clause_id,
                          );

                        const status =
                          !draftText
                            ? "pending"
                            : flag?.status ||
                              "satisfied";

                        const topEvidence =
                          evidence.find(
                            (item) =>
                              item.requirement_id ===
                              requirement.clause_id,
                          );

                        return (
                          <div
                            key={
                              requirement.clause_id
                            }
                            className="grid grid-cols-[70px_1fr_100px_1.2fr] items-start border-b border-border px-3 py-3 text-xs last:border-b-0"
                          >
                            <span className="font-mono font-medium text-accent">
                              {
                                requirement.clause_id
                              }
                            </span>

                            <span className="pr-3 text-foreground">
                              {
                                requirement.description
                              }
                            </span>

                            <span
                              className={`font-mono text-[10px] uppercase ${
                                status ===
                                "satisfied"
                                  ? "text-success"
                                  : status ===
                                      "partial"
                                    ? "text-warning"
                                    : status ===
                                        "missing"
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                              }`}
                            >
                              {
                                status
                              }
                            </span>

                            <span className="pr-1 text-muted-foreground">
                              {topEvidence
                                ? topEvidence.title
                                : "No matching evidence"}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <EmptyState text="Run the agent swarm to generate the compliance matrix." />
                )}
              </div>

              {/* Critic Findings */}
              {criticFlags.length >
                0 && (
                <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-5">
                  <div className="mb-4 flex items-center gap-2 font-medium text-warning">
                    <AlertTriangle className="h-5 w-5" />

                    Critic Engine flagged{" "}
                    {
                      criticFlags.length
                    }{" "}
                    compliance risk
                    {criticFlags.length ===
                    1
                      ? ""
                      : "s"}
                  </div>

                  <div className="flex flex-col gap-3">
                    {criticFlags.map(
                      (
                        flag,
                        index,
                      ) => (
                        <div
                          key={`${flag.clause_id}-${index}`}
                          className="rounded border border-warning/10 bg-background/60 p-3 text-sm"
                        >
                          <div className="mb-1">
                            <span className="font-bold text-warning">
                              {flag.severity.toUpperCase()}
                            </span>

                            <span className="ml-2 font-mono text-xs text-accent">
                              {
                                flag.clause_id
                              }
                            </span>
                          </div>

                          <p className="text-foreground">
                            {
                              flag.issue
                            }
                          </p>

                          <p className="mt-1.5 text-muted-foreground">
                            {
                              flag.suggestion
                            }
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
            </article>
          )}

          {/* ====================================================
              EVIDENCE TAB
          ==================================================== */}

          {activeTab ===
            "evidence" && (
            <article className="flex-1 overflow-y-auto px-6 py-6">
              <div className="rounded-lg border border-border bg-card/30 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">
                      Evidence Trace
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      Verified sources retrieved for this RFP
                    </div>
                  </div>

                  <span className="font-mono text-xs text-muted-foreground">
                    {
                      evidence.length
                    }{" "}
                    records
                  </span>
                </div>

                {evidence.length >
                0 ? (
                  <div className="flex flex-col gap-3">
                    {evidence.map(
                      (item) => (
                        <div
                          key={`${item.requirement_id}-${item.source_id}`}
                          className="rounded border border-border bg-background/60 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs text-accent">
                              {
                                item.requirement_id
                              }
                            </span>

                            <span className="font-mono text-xs text-muted-foreground">
                              relevance{" "}
                              {item.relevance_score.toFixed(
                                3,
                              )}
                            </span>
                          </div>

                          <div className="mt-2 text-sm font-medium text-foreground">
                            {
                              item.title
                            }
                          </div>

                          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {
                              item.source_type
                            }
                          </div>

                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {
                              item.content
                            }
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState text="Run the agent swarm to retrieve verified evidence." />
                )}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkspaceTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-4 font-mono text-[10px] uppercase tracking-wider transition-colors ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}

      {active && (
        <motion.div
          layoutId="workspace-tab"
          className="absolute bottom-0 left-2 right-2 h-px bg-accent"
          transition={spring}
        />
      )}
    </button>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="rounded border border-dashed border-border px-5 py-10 text-center font-mono text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}