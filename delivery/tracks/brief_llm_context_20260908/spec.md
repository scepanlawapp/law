# Brief LLM Context Specification

## Goals

- Give the `brief-extraction` step enough context to prepare required data for a Serbian tužba by combining the user's chat message with the extracted attachment texts.
- Add a structured-output LLM call after raw text extraction that turns the combined context into tužba-ready brief facts.
- Produce an expanded tužba schema (superset of Phase 2 `job_type`, `plaintiff`, `defendant`, `claim_value`, `legal_basis`, renamed to camelCase): `jobType`, `plaintiff`/`defendant` (now objects with address details), `competentCourt`, `claimValue`, `legalBasis` (ZPP/ZOO references), `factualDescription`, `evidence` list, `reliefSought`, plus `missingFields` (fields the lawyer must supply), `confidence`, and `warnings`.
- All schema keys are English camelCase ASCII; prompt text and field values (e.g. names, court, factual description) are Serbian Latin. `jobType` enum values also stay ASCII.
- Persist the structured brief as a first-class record (new persistence, not only inside `WorkflowJob.output` JSON) so the future drafting agent can query it.
- Bound the LLM prompt with a new per-document + total character budget, separate from the existing extraction storage cap, and record when truncation happened.

## Non-goals

- Template retrieval (Phase 3), drafting agent / Tužba Agent (Phase 4), and evaluation loop (Phase 5).
- Moving extraction or the LLM step to n8n, background queue/worker infrastructure (BullMQ, Redis), or local Ollama migration — this track reuses the existing OpenRouter prototype provider, carrying over the Phase 1 prototype exception (prompt context leaves the premises).
- OCR fallback for scanned/image-only PDFs; PDFs stay text-layer only.
- Any UI changes. Brief status lives on the backend only; surfacing it in the composer/transcript is a later track.
- Virus scanning, MinIO/S3, public unauthenticated intake.

## Context model

- Input context is exactly: the `brief-extraction` `WorkflowJob`'s `userText` plus, per attachment, its id, name, MIME type, extraction status, and extracted text (possibly truncated per budget).
- Attachments with `FAILED`/`UNSUPPORTED` extraction are included as status-only lines so the LLM knows evidence is missing; they contribute no text.
- A message with no attachments, or with zero successfully extracted texts and empty user text, skips the LLM call and records an `empty` brief outcome instead of hallucinating.

## Users

No user-facing change. Any ACTIVE workspace member whose legal message queues a `brief-extraction` job benefits transparently; the structured brief is consumed by a future Brief/Drafting track.
