# Drafting Agent (Context-Only) Specification

## Goals

- Add a real `drafting` workflow chain (mirroring `@law/brief-extraction`'s architecture) that turns a completed `BriefResult` directly into a full draft tužba document, with no template retrieval involved.
- Auto-chain drafting immediately after a `brief-extraction` job persists a `BriefExtractionResult` with `brief.jobType === "lawsuit"`, the same way `brief-extraction` is auto-chained after `triage`'s `LEGAL` decision.
- Produce the draft as plain Serbian Latin Markdown/text covering the standard ZPP tužba structure: court header, plaintiff/defendant (with addresses), claim value, legal basis paragraph, factual description ("obrazloženje"), evidence list ("dokazi"), relief sought ("tužbeni zahtev"), and a signature block placeholder.
- Never block on incomplete facts: any `null`/missing field or entry listed in `BriefResult.missingFields` is rendered as an explicit bracketed placeholder (e.g. `[UNOS POTREBAN: adresa tuženog]`) rather than invented or omitted, and surfaced via a `warnings` list on the result.
- Persist the draft as a first-class `DraftResult` record (new Prisma model, FK to the originating `WorkflowJob` and `BriefExtractionResult`), and add a minimal `GET` endpoint to fetch it by job id for testing/verification — no chat UI changes.
- Bound the drafting LLM prompt with its own character budget (`DRAFTING_PROMPT_MAX_CHARS`), separate from the existing brief/extraction budgets, and record when truncation happened.

## Non-goals

- Template retrieval (Phase 3, deferred) — the drafting prompt is built purely from `BriefResult` fields, no Qdrant/template lookup.
- Evaluation/critic loop (Phase 5) and the final review gate — this track only produces a first draft, it does not validate or grade it.
- docx/PDF generation or any binary document export — output is plain text/Markdown stored as a DB column; export formats are a later track.
- Any chat UI change. The draft is retrievable via a backend API for verification only; surfacing it in the composer/transcript is a later track.
- Drafting for non-`lawsuit` job types (`contract`, `other`, `null`) — these are silently skipped (no `drafting` `WorkflowJob` created) in this track.
- Moving the LLM call to n8n/local Ollama — this track reuses the existing OpenRouter prototype provider, same as `brief-extraction`.

## Context model

- Input context is exactly the persisted `BriefResult` from the originating `BriefExtractionResult` row — no raw attachment text is re-read, no template content is fetched.
- Drafting only runs when the brief-extraction phase completed without `briefError`/`errorCode` and `brief.jobType === "lawsuit"`. Any other outcome (non-lawsuit jobType, `empty` brief, LLM/zod failure) results in no `drafting` `WorkflowJob` being created at all.
- Low `confidence` or non-empty `missingFields` on the `BriefResult` never block drafting; they only influence which fields get bracketed placeholders and what ends up in the draft's `warnings`.

## Users

No user-facing change. Any ACTIVE workspace member whose legal message already produces a `lawsuit`-typed brief gets a draft generated transparently in the background; the draft is consumed via API for now and by a future chat UI / drafting-agent track later.
