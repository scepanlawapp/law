# Project Context: Law Firm AI Automation (Stojković)

## 1. Project Overview
We are building a highly secure, automated AI workflow for the "Stojković" law firm in Serbia. The system handles client intake, triage, document analysis, and automated legal document drafting (e.g., lawsuits, contracts). Due to strict attorney-client privilege and the Serbian legal framework, the system must guarantee **Zero Data Leakage** by utilizing a 100% On-Premise/Local AI architecture.

## 2. Tech Stack
*   **Frontend**: Angular (with Tailwind CSS) - Web Chat / Client Intake UI.
*   **Backend**: NestJS (Node.js) - Handles authentication, secure file processing (Multipart form-data), and SSE (Server-Sent Events) to maintain loading states for long-running AI tasks.
*   **Workflow Orchestrator**: Self-hosted n8n.
*   **AI Engine**: Local LLMs via Ollama (e.g., Llama 3, Qwen) for local processing without exposing data to external APIs.
*   **Vector Database**: Qdrant (Self-hosted) - Stores standard legal templates and past case metadata.
*   **Relational Database**: PostgreSQL - For CRM, user sessions, and business logic.
*   **Infrastructure**: Docker, Caddy (Reverse Proxy with automatic SSL).

## 3. Core Workflow Architecture (n8n Multi-Agent System)
The n8n workflow follows a strict multi-agent pipeline designed for reliability and security:

### Phase 1: Triage & Guardrail ("Portir")
*   **Input**: Text message + attached files sent via NestJS backend to an n8n Webhook.
*   **Action**: A fast, small local LLM acts as a "Gatekeeper". It checks if the query is a legitimate legal request.
*   **Output**: Rejects non-legal queries (e.g., "What's the weather?") to save resources. If valid, proceeds to Phase 2.

### Phase 2: Fact Extraction ("Brief Agent")
*   **Action**: OCR / Document Loaders extract text from user-uploaded PDFs/Images.
*   **LLM Task**: A structured output LLM call extracts key entities.
*   **Output**: Strict JSON containing: `job_type` (e.g., lawsuit, contract), `plaintiff`, `defendant`, `claim_value`, `legal_basis`.

### Phase 3: Routing & Template Retrieval
*   **Switch Node**: Routes the flow based on the `job_type` from the JSON.
*   **Database Query**: Instead of generic RAG, the system queries Qdrant/PostgreSQL for the **exact standard legal template** (e.g., template for damage compensation lawsuit) according to Serbian law.

### Phase 4: Drafting Agent ("Tužba Agent")
*   **Action**: A capable local LLM maps the facts from the Brief Agent's JSON into the blank standard template retrieved from the database.
*   **Output**: A draft legal document (e.g., lawsuit with correct court jurisdiction, values, and evidentiary proposals).

### Phase 5: Evaluation Loop ("Critic / Gotovo?")
*   **Action**: A separate Evaluator LLM reviews the draft against the original JSON facts. It checks if all template fields were properly filled and if the values match.
*   **Loop**: If it fails, the flow returns to Phase 4 with critique notes (Self-Reflection). If it passes, the document is generated (Word/PDF) and sent back to the lawyer for final review.

## 4. Current Development Goals
*   Implement the n8n workflows according to this schema.
*   Set up NestJS endpoints to handle file uploads and trigger n8n webhooks.
*   Configure Ollama nodes in n8n for the "Portir" (JSON output) and "Brief Agent" (JSON output).
*   Ensure strict alignment with the Serbian legal framework (ZPP, ZOO).
