from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from pypdf import PdfReader

import io
import os
import json
import re


# ============================================================
# APP CONFIG
# ============================================================

app = FastAPI()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PAGES = 300

FRONTEND_ORIGIN = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:8080",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class EvidenceItem(BaseModel):
    requirement_id: str
    source_id: str
    source_type: str
    title: str
    content: str
    relevance_score: float


class CriticFlag(BaseModel):
    clause_id: str
    status: str
    severity: str
    issue: str
    suggestion: str


class CriticResponse(BaseModel):
    compliance_score: int
    flags: list[CriticFlag]
    approved: bool


class RetrieveRequest(BaseModel):
    requirements: list[RFPRequirement]


class CriticRequest(BaseModel):
    requirements: list[RFPRequirement]
    evidence: list[EvidenceItem]
    draft: str


class DraftRequest(BaseModel):
    requirements: list[RFPRequirement]
    evidence: list[EvidenceItem]
    previous_draft: str | None = None
    critic_feedback: list[CriticFlag] | None = None


# ============================================================
# EVIDENCE KNOWLEDGE BASE
# ============================================================

KNOWLEDGE_BASE_PATH = os.path.join(
    os.path.dirname(__file__),
    "knowledge_base",
    "evidence.json",
)


def load_evidence() -> list[dict]:
    try:
        with open(
            KNOWLEDGE_BASE_PATH,
            "r",
            encoding="utf-8",
        ) as file:
            data = json.load(file)

        if not isinstance(data, list):
            raise ValueError(
                "Evidence knowledge base must contain a list."
            )

        return data

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Evidence knowledge base file not found.",
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Evidence knowledge base contains invalid JSON.",
        )


def tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(
            r"[a-zA-Z0-9]+",
            text.lower(),
        )
        if len(token) > 2
    }


def score_evidence(
    requirement: RFPRequirement,
    evidence: dict,
) -> float:
    requirement_tokens = tokenize(
        requirement.description
    )

    evidence_text = " ".join(
        [
            str(evidence.get("title", "")),
            str(evidence.get("content", "")),
        ]
    )

    evidence_tokens = tokenize(evidence_text)

    if not requirement_tokens:
        return 0.0

    overlap = (
        requirement_tokens
        & evidence_tokens
    )

    return round(
        len(overlap)
        / len(requirement_tokens),
        3,
    )


def retrieve_evidence(
    requirements: list[RFPRequirement],
    max_results_per_requirement: int = 2,
    threshold: float = 0.08,
) -> list[EvidenceItem]:

    knowledge_base = load_evidence()

    results: list[EvidenceItem] = []

    for requirement in requirements:
        ranked: list[tuple[float, dict]] = []

        for evidence in knowledge_base:
            score = score_evidence(
                requirement,
                evidence,
            )

            if score >= threshold:
                ranked.append(
                    (
                        score,
                        evidence,
                    )
                )

        ranked.sort(
            key=lambda item: item[0],
            reverse=True,
        )

        for score, evidence in ranked[
            :max_results_per_requirement
        ]:
            results.append(
                EvidenceItem(
                    requirement_id=requirement.clause_id,
                    source_id=str(
                        evidence.get(
                            "source_id",
                            "",
                        )
                    ),
                    source_type=str(
                        evidence.get(
                            "source_type",
                            "unknown",
                        )
                    ),
                    title=str(
                        evidence.get(
                            "title",
                            "",
                        )
                    ),
                    content=str(
                        evidence.get(
                            "content",
                            "",
                        )
                    ),
                    relevance_score=score,
                )
            )

    return results


# ============================================================
# PARSER CONTEXT COMPRESSION
# ============================================================

def build_parser_context(
    page_texts: list[str],
    max_chars: int = 30000,
) -> str:

    if not page_texts:
        return ""

    signal_pattern = re.compile(
        r"\b("
        r"mandatory|must|shall|required|"
        r"requirement|compliance|qualification|"
        r"minimum|eligibility|"
        r"section\s+l|section\s+m"
        r")\b",
        re.IGNORECASE,
    )

    selected_indices: list[int] = []

    # Always keep the first two pages.
    for index in range(
        min(2, len(page_texts))
    ):
        selected_indices.append(index)

    # Add pages containing requirement-like signals.
    for index, page_text in enumerate(
        page_texts
    ):
        if (
            index not in selected_indices
            and signal_pattern.search(
                page_text
            )
        ):
            selected_indices.append(index)

    selected_indices.sort()

    chunks: list[str] = []
    total_chars = 0

    for index in selected_indices:
        page_text = page_texts[index].strip()

        if not page_text:
            continue

        chunk = (
            f"\n--- PAGE {index + 1} ---\n"
            f"{page_text}\n"
        )

        remaining = (
            max_chars
            - total_chars
        )

        if remaining <= 0:
            break

        if len(chunk) > remaining:
            chunk = chunk[:remaining]

        chunks.append(chunk)
        total_chars += len(chunk)

        if total_chars >= max_chars:
            break

    return "".join(chunks)


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

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=(
                "File is too large. "
                "Maximum allowed size is 10 MB."
            ),
        )

    try:
        pdf = PdfReader(
            io.BytesIO(content)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid PDF file: {exc}",
        )

    if len(pdf.pages) > MAX_PAGES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"PDF contains {len(pdf.pages)} pages. "
                f"Maximum allowed is {MAX_PAGES} pages."
            ),
        )

    # Scan every page locally.
    page_texts: list[str] = []

    for page in pdf.pages:
        extracted = page.extract_text()

        page_texts.append(
            extracted or ""
        )

    text = build_parser_context(
        page_texts,
        max_chars=30000,
    )

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract readable text "
                "from the uploaded PDF."
            ),
        )

    prompt = f"""
You are an expert RFP compliance parser.

Extract the mandatory and explicitly required compliance
requirements from the supplied RFP excerpts.

Rules:
- Extract only requirements actually present in the RFP.
- Do not invent requirements.
- Preserve clause IDs when present.
- Mark mandatory requirements as true.
- Requirements expressed with words such as must, shall,
  required, minimum, mandatory, eligibility, or compliance
  are typically mandatory.
- Ignore ordinary background information.
- Keep each requirement description concise.
- Return all requirements in a single compact JSON object.
- Do not add commentary or markdown.

RFP EXCERPTS:
{text}

Return exactly this structure:

{{
  "project_title": "String",
  "requirements": [
    {{
      "clause_id": "L.1",
      "description": "String",
      "is_mandatory": true
    }}
  ]
}}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-5-6-luna",
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
            response
            .choices[0]
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

        cleaned_content = raw_content.strip()

        # Remove accidental markdown fences.
        if cleaned_content.startswith("```"):
            cleaned_content = re.sub(
                r"^```(?:json)?\s*",
                "",
                cleaned_content,
            )
            cleaned_content = re.sub(
                r"\s*```$",
                "",
                cleaned_content,
            )

        try:
            raw = json.loads(cleaned_content)

        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Parser returned invalid JSON: "
                    f"{exc}. "
                    f"Response preview: {repr(cleaned_content[:1000])}"
                ),
            )

        requirements = raw.get(
            "requirements",
            [],
        )

        if not isinstance(requirements, list):
            raise HTTPException(
                status_code=502,
                detail=(
                    "Parser returned an invalid "
                    "requirements list."
                ),
            )

        for index, requirement in enumerate(
            requirements,
            start=1,
        ):
            if not isinstance(
                requirement,
                dict,
            ):
                continue

            clause_id = requirement.get(
                "clause_id"
            )

            if (
                not isinstance(clause_id, str)
                or not clause_id.strip()
            ):
                requirement["clause_id"] = (
                    f"REQ-{index:02d}"
                )

        raw["requirements"] = requirements

        parsed = ParserResponse(
            **raw
        )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Parser failed: {exc}",
        )

    if not parsed.requirements:
        raise HTTPException(
            status_code=422,
            detail=(
                "No mandatory RFP requirements "
                "were detected in this document."
            ),
        )

    return parsed


# ============================================================
# AGENT 2 — EVIDENCE RETRIEVER
# ============================================================

@app.post(
    "/api/2-retrieve-context",
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
    "/api/3-draft-proposal",
)
async def draft_proposal(
    request: DraftRequest,
):
    requirements_text = "\n".join(
        [
            (
                f"- {requirement.clause_id}: "
                f"{requirement.description} "
                f"(mandatory={requirement.is_mandatory})"
            )
            for requirement
            in request.requirements
        ]
    )

    # --------------------------------------------------------
    # COMPACT EVIDENCE CONTEXT
    # --------------------------------------------------------
    # The retriever may return the same source for multiple
    # requirements. Group those records so Agent 3 does not
    # receive the same evidence repeatedly.

    evidence_by_source: dict[str, dict] = {}

    for item in request.evidence:
        source_id = item.source_id or item.title

        if source_id not in evidence_by_source:
            evidence_by_source[source_id] = {
                "title": item.title,
                "source_type": item.source_type,
                "content": item.content,
                "requirements": [],
            }

        evidence_by_source[source_id][
            "requirements"
        ].append(item.requirement_id)

    evidence_blocks: list[str] = []

    for item in evidence_by_source.values():
        requirement_ids = ", ".join(
            dict.fromkeys(
                item["requirements"]
            )
        )

        evidence_blocks.append(
            (
                f"Evidence supports clauses: {requirement_ids}\n"
                f"Source: {item['title']}\n"
                f"Type: {item['source_type']}\n"
                f"Content: {item['content']}"
            )
        )

    evidence_text = "\n\n".join(
        evidence_blocks
    )

    revision_context = ""

    if (
        request.previous_draft
        and request.critic_feedback
    ):
        feedback_text = "\n".join(
            [
                (
                    f"- {flag.clause_id}: "
                    f"{flag.status} | "
                    f"{flag.issue} | "
                    f"{flag.suggestion}"
                )
                for flag
                in request.critic_feedback
            ]
        )

        revision_context = f"""
This is a REVISION pass.

PREVIOUS DRAFT:
{request.previous_draft}

CRITIC FEEDBACK:
{feedback_text}

Revise the previous draft to address every critic finding.

Important:
- Preserve all verified evidence.
- Do not invent missing evidence.
- Do not fabricate names, certifications,
  customers, metrics, dates, platforms, or outcomes.
- Keep transparently disclosed evidence gaps.
"""

    prompt = f"""
You are Agent 3, an enterprise RFP proposal drafting agent.

Write a professional proposal response using ONLY:
1. the supplied RFP requirements
2. the supplied verified company evidence

RFP REQUIREMENTS:
{requirements_text}

VERIFIED COMPANY EVIDENCE:
{evidence_text}

{revision_context}

Rules:
- Address every mandatory requirement explicitly.
- Use clause IDs where appropriate.
- Every company-specific claim must be traceable
  to supplied evidence.
- Never invent company credentials.
- Never treat the RFP itself as company evidence.
- When evidence is insufficient, disclose the gap clearly.
- Do not pretend missing information exists.
- Avoid repeating the same evidence unnecessarily.
- Produce a polished business proposal.
- Target approximately 700–1000 words.
- Use clear headings and a compliance-oriented structure.
- Begin writing immediately.
"""

    def generate_stream():
        try:
            response = client.chat.completions.create(
                model="gpt-5-6-luna",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert enterprise "
                            "RFP proposal writer. "
                            "Write concise, professional "
                            "evidence-backed proposals."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                stream=True,
            )

            for chunk in response:
                if (
                    not chunk.choices
                    or not chunk.choices[0].delta
                ):
                    continue

                text = (
                    chunk.choices[0]
                    .delta
                    .content
                )

                if not text:
                    continue

                yield (
                    "data: "
                    + json.dumps(
                        {
                            "text": text
                        }
                    )
                    + "\n\n"
                )

            yield "data: [DONE]\n\n"

        except Exception as exc:
            yield (
                "data: "
                + json.dumps(
                    {
                        "error": (
                            f"Drafting failed: {exc}"
                        )
                    }
                )
                + "\n\n"
            )

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================
# AGENT 4 — EVIDENCE-AWARE ADVERSARIAL CRITIC
# ============================================================

@app.post(
    "/api/4-critic-review",
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
                f"(mandatory={requirement.is_mandatory})"
            )
            for requirement
            in request.requirements
        ]
    )

    evidence_text = "\n".join(
        [
            (
                f"[{item.requirement_id}] "
                f"{item.title}: "
                f"{item.content}"
            )
            for item
            in request.evidence
        ]
    )

    prompt = f"""
You are Agent 4, a strict adversarial RFP compliance auditor.

Audit the proposal against ONLY:
1. the supplied RFP requirements
2. the supplied verified company evidence

You MUST return exactly one check for every supplied clause.

Rules:

- satisfied = requirement is explicitly addressed and supported by supplied evidence
- partial = requirement is addressed but evidence is incomplete
- missing = requirement is absent or unsupported
- Never invent evidence.
- Never treat RFP wording as company evidence.
- Flag unsupported company-specific claims.
- Be strict about mandatory requirements.
- Keep "issue" under 20 words.
- Keep "suggestion" under 25 words.
- Return JSON only.
- Do not include explanations outside the JSON.
- For satisfied clauses, keep "issue" and "suggestion" empty.
- Keep every check extremely concise so all clauses fit in the response.

RFP REQUIREMENTS:
{requirements_text}

VERIFIED COMPANY EVIDENCE:
{evidence_text}

PROPOSAL:
{request.draft}

Return exactly:

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

    try:
        response = client.chat.completions.create(
            model="gpt-5-6-luna",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict RFP compliance auditor. "
                        "Return one concise JSON object only."
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
            response
            .choices[0]
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

        cleaned_content = (
            raw_content.strip()
        )

        # Remove accidental markdown fences.
        if cleaned_content.startswith(
            "```"
        ):
            cleaned_content = re.sub(
                r"^```(?:json)?\s*",
                "",
                cleaned_content,
            )

            cleaned_content = re.sub(
                r"\s*```$",
                "",
                cleaned_content,
            )

        try:
            raw = json.loads(
                cleaned_content
            )

        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Critic returned invalid JSON: "
                    f"{exc}. "
                    f"Response preview: "
                    f"{cleaned_content[:500]}"
                ),
            )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Critic failed: {exc}",
        )

    # ========================================================
    # VALIDATE MODEL CHECKS
    # ========================================================

    checks: list[CriticFlag] = []

    for item in raw.get(
        "checks",
        [],
    ):
        try:
            checks.append(
                CriticFlag(
                    **item
                )
            )
        except Exception:
            continue

    # ========================================================
    # MAKE SURE EVERY CLAUSE HAS A RESULT
    # ========================================================

    expected_ids = {
        requirement.clause_id
        for requirement
        in request.requirements
    }

    returned_ids = {
        check.clause_id
        for check
        in checks
    }

    missing_ids = (
        expected_ids
        - returned_ids
    )

    for clause_id in missing_ids:
        checks.append(
            CriticFlag(
                clause_id=clause_id,
                status="missing",
                severity="high",
                issue=(
                    "No valid audit result was returned."
                ),
                suggestion=(
                    "Review this clause manually."
                ),
            )
        )

    # ========================================================
    # DETERMINISTIC SCORE
    # ========================================================

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
                for check
                in checks
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

    # ========================================================
    # BLOCKING FLAGS
    # ========================================================

    mandatory_ids = {
        requirement.clause_id
        for requirement
        in mandatory_requirements
    }

    blocking_flags = [
        check
        for check
        in checks
        if (
            check.clause_id
            in mandatory_ids
            and check.status
            in {
                "missing",
                "partial",
            }
        )
    ]

    return CriticResponse(
        compliance_score=compliance_score,
        flags=blocking_flags,
        approved=(
            len(blocking_flags)
            == 0
        ),
    )