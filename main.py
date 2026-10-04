from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from pypdf import PdfReader

import io
import os
import json
import re


app = FastAPI()


# ============================================================
# CONFIG
# ============================================================

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PAGES = 300

FRONTEND_ORIGIN = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:8080",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# LLM CLIENT
# ============================================================

client = OpenAI(
    api_key=os.getenv("SELORA_API_KEY"),
    base_url="https://api.selora.lol/v1",
)


# ============================================================
# DATA MODELS
# ============================================================

class RFPRequirement(BaseModel):
    clause_id: str
    description: str
    is_mandatory: bool


class ParserResponse(BaseModel):
    project_title: str
    requirements: list[RFPRequirement]


class CriticFlag(BaseModel):
    clause_id: str
    status: str  # satisfied | partial | missing
    severity: str  # low | medium | high
    issue: str
    suggestion: str


class CriticResponse(BaseModel):
    compliance_score: int
    flags: list[CriticFlag]
    approved: bool


class CriticRequest(BaseModel):
    requirements: list[RFPRequirement]
    draft: str


class EvidenceItem(BaseModel):
    requirement_id: str
    source_id: str
    source_type: str
    title: str
    content: str
    relevance_score: float


class DraftRequest(BaseModel):
    requirements: list[RFPRequirement]
    evidence: list[EvidenceItem]
    previous_draft: str | None = None
    critic_feedback: list[CriticFlag] | None = None


class RetrieveRequest(BaseModel):
    requirements: list[RFPRequirement]


# ============================================================
# KNOWLEDGE BASE
# ============================================================

KNOWLEDGE_BASE_PATH = "knowledge_base/evidence.json"


def load_evidence() -> list[dict]:
    try:
        with open(
            KNOWLEDGE_BASE_PATH,
            "r",
            encoding="utf-8",
        ) as f:
            data = json.load(f)

        if not isinstance(data, list):
            raise ValueError(
                "Knowledge base must contain a JSON array."
            )

        return data

    except FileNotFoundError:
        raise RuntimeError(
            f"Knowledge base not found: {KNOWLEDGE_BASE_PATH}"
        )

    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Knowledge base contains invalid JSON: {exc}"
        )


def tokenize(text: str) -> set[str]:
    stop_words = {
        "the",
        "a",
        "an",
        "and",
        "or",
        "of",
        "to",
        "in",
        "for",
        "with",
        "on",
        "at",
        "by",
        "is",
        "are",
        "be",
        "must",
        "this",
        "that",
        "from",
    }

    words = re.findall(
        r"[a-z0-9]+",
        text.lower(),
    )

    return {
        word
        for word in words
        if word not in stop_words
        and len(word) > 2
    }


def score_evidence(
    requirement: RFPRequirement,
    evidence: dict,
) -> float:
    requirement_tokens = tokenize(
        requirement.description
    )

    title_tokens = tokenize(
        evidence.get("title", "")
    )

    content_tokens = tokenize(
        evidence.get("content", "")
    )

    tag_tokens = tokenize(
        " ".join(
            evidence.get("tags", [])
        )
    )

    if not requirement_tokens:
        return 0.0

    title_matches = len(
        requirement_tokens & title_tokens
    )

    content_matches = len(
        requirement_tokens & content_tokens
    )

    tag_matches = len(
        requirement_tokens & tag_tokens
    )

    weighted_matches = (
        title_matches * 3
        + content_matches
        + tag_matches * 2
    )

    max_possible = (
        len(requirement_tokens) * 6
    )

    return round(
        min(
            weighted_matches / max_possible,
            1.0,
        ),
        3,
    )


def retrieve_evidence(
    requirements: list[RFPRequirement],
    max_results_per_requirement: int = 2,
    threshold: float = 0.08,
) -> list[dict]:
    evidence_records = load_evidence()

    results = []

    for requirement in requirements:
        ranked = []

        for evidence in evidence_records:
            score = score_evidence(
                requirement,
                evidence,
            )

            if score >= threshold:
                ranked.append(
                    {
                        "requirement_id": (
                            requirement.clause_id
                        ),
                        "source_id": evidence["id"],
                        "source_type": evidence["type"],
                        "title": evidence["title"],
                        "content": evidence["content"],
                        "relevance_score": score,
                    }
                )

        ranked.sort(
            key=lambda item: item[
                "relevance_score"
            ],
            reverse=True,
        )

        results.extend(
            ranked[
                :max_results_per_requirement
            ]
        )

    return results


# ============================================================
# LOCAL RFP CONTEXT COMPRESSION
# ============================================================

def build_parser_context(
    page_texts: list[str],
    max_chars: int = 30000,
) -> str:
    """
    Scan the entire PDF locally, but send only pages
    that are likely to contain compliance requirements
    to the parser model.
    """

    requirement_terms = (
        "mandatory",
        "must",
        "shall",
        "required",
        "requirement",
        "compliance",
        "qualification",
        "minimum",
        "eligibility",
        "section l",
        "section m",
    )

    selected_pages: list[str] = []

    for page_index, page_text in enumerate(
        page_texts
    ):
        normalized = page_text.lower()

        if (
            page_index < 2
            or any(
                term in normalized
                for term in requirement_terms
            )
        ):
            selected_pages.append(
                f"[PAGE {page_index + 1}]\n{page_text}"
            )

    context = "\n\n".join(
        selected_pages
    )

    if len(context) > max_chars:
        context = context[:max_chars]

    return context


# ============================================================
# AGENT 1 — RFP PARSER
# ============================================================

@app.post(
    "/api/1-parse-rfp",
    response_model=ParserResponse,
)
async def parse_rfp(
    file: UploadFile = File(...),
):
    # --------------------------------------------------------
    # Read uploaded file
    # --------------------------------------------------------

    content = await file.read()

    # --------------------------------------------------------
    # File size protection
    # --------------------------------------------------------

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=(
                "RFP file is too large. "
                "Maximum size is 10 MB."
            ),
        )

    # --------------------------------------------------------
    # Parse PDF
    # --------------------------------------------------------

    try:
        pdf = PdfReader(
            io.BytesIO(content)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid PDF file: {exc}",
        )

    # --------------------------------------------------------
    # Page limit protection
    # --------------------------------------------------------

    if len(pdf.pages) > MAX_PAGES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"RFP has too many pages. "
                f"Maximum is {MAX_PAGES} pages."
            ),
        )

    # --------------------------------------------------------
    # Scan every page locally
    # --------------------------------------------------------

    page_texts: list[str] = []

    for page in pdf.pages:
        page_text = page.extract_text() or ""
        page_texts.append(page_text)

    # --------------------------------------------------------
    # Compress parser input before sending it to the LLM
    # --------------------------------------------------------

    text = build_parser_context(
        page_texts
    )

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text was found "
                "in the PDF."
            ),
        )

    # --------------------------------------------------------
    # Parser prompt
    # --------------------------------------------------------

    prompt = f"""
Extract the mandatory compliance rules from
the following relevant excerpts of an RFP.

For every requirement, provide:
- clause_id
- description
- whether it is mandatory

Rules:
- Extract requirements from the source text only.
- Do not invent requirements.
- Preserve clause IDs exactly when present.
- Include every mandatory requirement you can identify.
- Ignore general marketing or background information.

RFP RELEVANT EXCERPTS:
{text}

Return ONLY valid JSON:

{{
  "project_title": "String",
  "requirements": [
    {{
      "clause_id": "String",
      "description": "String",
      "is_mandatory": true
    }}
  ]
}}
"""

    response = client.chat.completions.create(
        model="gpt-5-6-luna",
        max_tokens=1200,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert RFP "
                    "compliance parser. "
                    "Return valid JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={
            "type": "json_object"
        },
    )

    raw_content = (
        response.choices[0]
        .message
        .content
    )

    if not raw_content:
        raise HTTPException(
            status_code=502,
            detail=(
                "Parser model returned "
                "an empty response."
            ),
        )

    try:
        raw = json.loads(
            raw_content
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Parser returned invalid JSON: {exc}"
            ),
        )

    # --------------------------------------------------------
    # Validate parser result
    # --------------------------------------------------------

    parsed = ParserResponse(
        **raw
    )

    # --------------------------------------------------------
    # Reject non-RFP / irrelevant documents
    # --------------------------------------------------------

    if not parsed.requirements:
        raise HTTPException(
            status_code=422,
            detail=(
                "No mandatory RFP requirements "
                "were found. Please upload a valid "
                "RFP or procurement document."
            ),
        )

    return parsed


# ============================================================
# AGENT 2 — EVIDENCE RETRIEVER
# ============================================================

@app.post(
    "/api/2-retrieve-context"
)
async def retrieve_context(
    request: RetrieveRequest,
):
    evidence = retrieve_evidence(
        request.requirements
    )

    return {
        "evidence": evidence
    }


# ============================================================
# AGENT 3 — PROPOSAL DRAFTER
# ============================================================

@app.post(
    "/api/2-draft-proposal"
)
async def draft_proposal(
    request: DraftRequest,
):
    requirements_text = "\n".join(
        [
            (
                f"{requirement.clause_id}: "
                f"{requirement.description} "
                f"(mandatory="
                f"{requirement.is_mandatory})"
            )
            for requirement
            in request.requirements
        ]
    )

    evidence_text = "\n".join(
        [
            (
                f"[Evidence for "
                f"{item.requirement_id}]\n"
                f"Source: {item.title}\n"
                f"Type: {item.source_type}\n"
                f"Relevance: "
                f"{item.relevance_score}\n"
                f"Content: {item.content}"
            )
            for item in request.evidence
        ]
    )

    revision_context = ""

    if (
        request.previous_draft
        and request.critic_feedback
    ):
        feedback_text = "\n".join(
            [
                (
                    f"Clause {flag.clause_id} "
                    f"({flag.severity}): "
                    f"{flag.issue}\n"
                    f"Recommendation: "
                    f"{flag.suggestion}"
                )
                for flag
                in request.critic_feedback
            ]
        )

        revision_context = f"""

PREVIOUS DRAFT:
{request.previous_draft}

CRITIC FEEDBACK:
{feedback_text}

REVISION INSTRUCTIONS:
- Revise the previous draft to address every
  supplied critic issue.
- Preserve correct content and verified evidence.
- Do not introduce unsupported claims while
  fixing the issues.
- Return the complete revised proposal,
  not a patch or explanation.
"""

    prompt = f"""
Write a professional proposal addressing
the following RFP requirements.

RFP REQUIREMENTS:
{requirements_text}

VERIFIED COMPANY EVIDENCE:
{evidence_text}

STRICT RULES:
- Use ONLY the supplied company evidence
  for company-specific claims.
- Never invent certifications, clients,
  projects, metrics, technologies,
  capabilities, dates, or outcomes.
- Do not treat an RFP requirement itself
  as evidence.
- Address every mandatory requirement
  explicitly.
- Where sufficient evidence does not exist,
  state that evidence is unavailable
  instead of fabricating a claim.
- Preserve the RFP clause IDs when
  mapping requirements in the proposal.
- Prefer precise, evidence-backed statements
  over generic marketing language.
- Clearly disclose evidence gaps.
- Keep the proposal concise:
  target 900–1400 words.
- Do not repeat the same evidence across
  multiple sections unless necessary.

{revision_context}
"""

    response = client.chat.completions.create(
        model="gpt-5-6-luna",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert government "
                    "proposal writer."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    draft = (
        response.choices[0]
        .message
        .content
    )

    if not draft:
        raise HTTPException(
            status_code=502,
            detail=(
                "Drafting model returned "
                "an empty response."
            ),
        )

    return {
        "draft": draft
    }


# ============================================================
# AGENT 4 — ADVERSARIAL CRITIC
# ============================================================

@app.post(
    "/api/3-critic-review",
    response_model=CriticResponse,
)
async def critic_review(
    request: CriticRequest,
):
    requirements_text = "\n".join(
        [
            (
                f"- {requirement.clause_id}: "
                f"{requirement.description} "
                f"(mandatory="
                f"{requirement.is_mandatory})"
            )
            for requirement
            in request.requirements
        ]
    )

    prompt = f"""
You are a strict RFP compliance auditor.

Evaluate the proposal AGAINST ONLY the
supplied RFP requirements.

For every requirement, determine:

- satisfied =
  clearly addressed by the proposal

- partial =
  partially addressed or required evidence
  is incomplete

- missing =
  absent from the proposal

Do not invent additional requirements.

Clause IDs MUST exactly match the supplied
clause IDs.

RFP REQUIREMENTS:
{requirements_text}

PROPOSAL:
{request.draft}

Return ONLY valid JSON:

{{
  "checks": [
    {{
      "clause_id": "L.1",
      "status": "satisfied",
      "severity": "low",
      "issue": "",
      "suggestion": ""
    }}
  ]
}}
"""

    response = client.chat.completions.create(
        model="gpt-5-6-luna",
        max_tokens=1000,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a strict RFP "
                    "compliance auditor. "
                    "Return valid JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={
            "type": "json_object"
        },
    )

    raw_content = (
        response.choices[0]
        .message
        .content
    )

    if not raw_content:
        raise HTTPException(
            status_code=502,
            detail=(
                "Critic model returned "
                "an empty response."
            ),
        )

    try:
        raw = json.loads(
            raw_content
        )
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Critic returned invalid JSON: {exc}"
            ),
        )

    checks = [
        CriticFlag(**item)
        for item in raw.get(
            "checks",
            [],
        )
    ]

    expected_ids = {
        requirement.clause_id
        for requirement
        in request.requirements
    }

    returned_ids = {
        check.clause_id
        for check in checks
    }

    missing_ids = (
        expected_ids -
        returned_ids
    )

    for clause_id in missing_ids:
        checks.append(
            CriticFlag(
                clause_id=clause_id,
                status="missing",
                severity="high",
                issue=(
                    "No compliance result "
                    "was returned for "
                    "this clause."
                ),
                suggestion=(
                    "Review this requirement "
                    "manually."
                ),
            )
        )

    mandatory_requirements = [
        requirement
        for requirement
        in request.requirements
        if requirement.is_mandatory
    ]

    satisfied_count = 0

    for requirement in mandatory_requirements:
        matching_check = next(
            (
                check
                for check in checks
                if check.clause_id
                == requirement.clause_id
            ),
            None,
        )

        if (
            matching_check
            and matching_check.status
            == "satisfied"
        ):
            satisfied_count += 1

    total_mandatory = len(
        mandatory_requirements
    )

    compliance_score = (
        round(
            (
                satisfied_count
                / total_mandatory
            )
            * 100
        )
        if total_mandatory
        else 0
    )

    blocking_flags = [
        check
        for check in checks
        if (
            check.status
            in {"missing", "partial"}
            and any(
                requirement.clause_id
                == check.clause_id
                and requirement.is_mandatory
                for requirement
                in mandatory_requirements
            )
        )
    ]

    return CriticResponse(
        compliance_score=compliance_score,
        flags=blocking_flags,
        approved=(
            len(blocking_flags) == 0
        ),
    )