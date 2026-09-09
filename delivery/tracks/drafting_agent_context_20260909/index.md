# Drafting Agent (Context-Only)

- **Track ID:** `drafting_agent_context_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Completed (commit `e4e6a39`). The `drafting` workflow chain (`@law/drafting`) turns a `lawsuit`-typed `BriefResult` directly into a draft tužba (plain Serbian Latin text), auto-chained after `brief-extraction` completes. Successful drafts persist to the new `DraftResult` table; LLM/zod failures are recorded as `output.draftError` without failing the job. Retrievable via `GET chat/jobs/:jobId/draft`.
