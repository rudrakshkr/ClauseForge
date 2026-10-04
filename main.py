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
    base_url="https://api.selora.lol/v1" 
)

class RFPRequirement(BaseModel):
    clause_id: str
    description: str
    is_mandatory: bool

class ParserResponse(BaseModel):
    project_title: str
    requirements: list[RFPRequirement]

class CriticFlag(BaseModel):
    severity: str 
    issue: str
    suggestion: str

class CriticResponse(BaseModel):
    compliance_score: int
    flags: list[CriticFlag]
    approved: bool

COMPANY_CONTEXT = """
Northwind Digital Company Profile:
- ISO 27001 Certified (Cert #492-A).
- 15 years experience in GovTech and citizen-data workloads.
- Core technologies: React, Python, AWS GovCloud.
- Past Success: UK NHS Data Migration (2023) completed under budget.
"""

@app.post("/api/1-parse-rfp", response_model=ParserResponse)
async def parse_rfp(file: UploadFile = File(...)):
    # 1. Read the uploaded PDF file bytes
    content = await file.read()
    pdf = PdfReader(io.BytesIO(content))
    
    # 2. Extract text from the first few pages 
    text = ""
    for page in pdf.pages[:5]:
        text += page.extract_text() + "\n"
        
    print("--- EXTRACTED TEXT FROM PDF ---")
    print(text)
    print("-------------------------------")
        
    prompt = f"""Extract the mandatory compliance rules from the following RFP document text:
    {text}
    
    You MUST return ONLY a valid JSON object matching this exact schema:
    {{
      "project_title": "String",
      "requirements": [
        {{"clause_id": "String", "description": "String", "is_mandatory": true}}
      ]
    }}"""
    
    response = client.chat.completions.create(
        model="gpt-6-astra",
        messages=[
            {"role": "system", "content": "You are an expert RFP compliance parser. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)

@app.post("/api/2-draft-proposal")
async def draft_proposal(requirements: list[RFPRequirement]):
    req_text = "\n".join([r.description for r in requirements])
    prompt = f"Write a professional proposal addressing these rules: {req_text}. Use this company context: {COMPANY_CONTEXT}"
    
    response = client.chat.completions.create(
        model="gpt-6-astra", 
        messages=[
            {"role": "system", "content": "You are an expert grant writer."},
            {"role": "user", "content": prompt}
        ]
    )
    return {"draft": response.choices[0].message.content}

@app.post("/api/3-critic-review", response_model=CriticResponse)
async def critic_review(draft: dict):
    prompt = f"""Review this draft against standard enterprise IT requirements. Flag missing proofs. Draft: {draft['draft']}
    You MUST return ONLY a valid JSON object matching this exact schema:
    {{
      "compliance_score": 85,
      "flags": [
        {{"severity": "high", "issue": "Missing ISO cert", "suggestion": "Attach cert"}}
      ],
      "approved": false
    }}"""
    
    response = client.chat.completions.create(
        model="gpt-6-astra",
        messages=[
            {"role": "system", "content": "You are a hostile, strict compliance auditor. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)