# Brief LLM Context

- **Track ID:** `brief_llm_context_20260908`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Completed (commit `7e5aef2`). The `brief-extraction` `WorkflowJob` now runs a two-phase flow: raw attachment extraction, then a structured-output OpenRouter call (`@law/brief-extraction`) that turns `userText` + extracted texts into a tužba-ready `BriefResult`, bounded by a per-document/total character budget. Successful briefs persist to the new `BriefExtractionResult` table; empty context is skipped; LLM/zod failures are recorded as `output.briefError` without failing the job.
