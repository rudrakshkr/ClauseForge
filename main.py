from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from pypdf import PdfReader
import io
import os
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(
    api_key=os.getenv("SELORA_API_KEY"),
    base_url="https://api.selora.lol/v1",
)


# -----------------------------
# Data models
# -----------------------------

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


# Temporary company context.
# We will replace this in Step 2 with the real evidence retriever.
COMPANY_CONTEXT = """
Northwind Digital Company Profile:
- ISO 27001 Certified (Cert #492-A).
- 15 years experience in GovTech and citizen-data workloads.
- Core technologies: React, Python, AWS GovCloud.
- Past Success: UK NHS Data Migration (2023) completed under budget.
"""


# -----------------------------
# 1. Parse RFP
# -----------------------------

@app.post("/api/1-parse-rfp", response_model=ParserResponse)
async def parse_rfp(file: UploadFile = File(...)):
    content = await file.read()

    pdf = PdfReader(io.BytesIO(content))

    text = ""

    # Keep the current 5-page limit for now.
    # We can improve this later.
    for page in pdf.pages[:5]:
        text += (page.extract_text() or "") + "\n"

    prompt = f"""
Extract the mandatory compliance rules from the following RFP document text.

For every requirement, provide:
- clause_id
- description
- whether it is mandatory

Do not invent requirements.

RFP TEXT:
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
        model="gpt-6-astra",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert RFP compliance parser. "
                    "Return valid JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={"type": "json_object"},
    )

    raw = json.loads(response.choices[0].message.content)

    return ParserResponse(**raw)


# -----------------------------
# 2. Draft proposal
# -----------------------------

@app.post("/api/2-draft-proposal")
async def draft_proposal(requirements: list[RFPRequirement]):
    req_text = "\n".join(
        [
            f"{r.clause_id}: {r.description} "
            f"(mandatory={r.is_mandatory})"
            for r in requirements
        ]
    )

    prompt = f"""
Write a professional proposal addressing the following RFP requirements.

RFP REQUIREMENTS:
{req_text}

COMPANY CONTEXT:
{COMPANY_CONTEXT}

Important:
- Do not invent certifications.
- Do not invent previous projects.
- Do not invent metrics.
- Use only the supplied company context for company-specific claims.
- Address the requirements explicitly.
"""

    response = client.chat.completions.create(
        model="gpt-6-astra",
        messages=[
            {
                "role": "system",
                "content": "You are an expert grant writer.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    return {
        "draft": response.choices[0].message.content
    }


# -----------------------------
# 3. Clause-level compliance critic
# -----------------------------

@app.post("/api/3-critic-review", response_model=CriticResponse)
async def critic_review(request: CriticRequest):

    requirements_text = "\n".join(
        [
            f"- {r.clause_id}: {r.description} "
            f"(mandatory={r.is_mandatory})"
            for r in request.requirements
        ]
    )

    prompt = f"""
You are a strict RFP compliance auditor.

Evaluate the proposal AGAINST ONLY the supplied RFP requirements.

For every requirement, return exactly one result.

Status definitions:
- satisfied = clearly addressed by the proposal
- partial = partially addressed or required evidence is incomplete
- missing = absent from the proposal

Do not invent additional requirements.

Clause IDs MUST exactly match the supplied clause IDs.

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
        model="gpt-6-astra",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a strict RFP compliance auditor. "
                    "Return valid JSON only."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={"type": "json_object"},
    )

    raw = json.loads(response.choices[0].message.content)

    checks = [
        CriticFlag(**item)
        for item in raw.get("checks", [])
    ]

    # Ensure every requirement gets a result.
    expected_ids = {
        r.clause_id for r in request.requirements
    }

    returned_ids = {
        c.clause_id for c in checks
    }

    missing_ids = expected_ids - returned_ids

    for clause_id in missing_ids:
        checks.append(
            CriticFlag(
                clause_id=clause_id,
                status="missing",
                severity="high",
                issue="No compliance result was returned for this clause.",
                suggestion="Review this requirement manually.",
            )
        )

    # -----------------------------
    # Deterministic score
    # -----------------------------

    mandatory_requirements = [
        r
        for r in request.requirements
        if r.is_mandatory
    ]

    satisfied_count = 0

    for requirement in mandatory_requirements:
        matching_check = next(
            (
                check
                for check in checks
                if check.clause_id == requirement.clause_id
            ),
            None,
        )

        if matching_check and matching_check.status == "satisfied":
            satisfied_count += 1

    total_mandatory = len(mandatory_requirements)

    compliance_score = (
        round((satisfied_count / total_mandatory) * 100)
        if total_mandatory
        else 100
    )

    blocking_flags = [
        check
        for check in checks
        if check.status in {"missing", "partial"}
        and any(
            requirement.clause_id == check.clause_id
            and requirement.is_mandatory
            for requirement in mandatory_requirements
        )
    ]

    return CriticResponse(
        compliance_score=compliance_score,
        flags=blocking_flags,
        approved=len(blocking_flags) == 0,
    )