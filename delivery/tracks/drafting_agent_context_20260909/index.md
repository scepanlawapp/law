# Drafting Agent (Context-Only)

- **Track ID:** `drafting_agent_context_20260909`
- **Type:** Feature
- **Status:** Not started

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Not started. This track adds the `drafting` workflow chain (Phase 4): a completed `lawsuit`-typed `BriefResult` is turned directly into a draft tužba (plain Serbian Latin text/Markdown), auto-chained after `brief-extraction`, with no template retrieval (Phase 3, deferred) or docx/PDF generation. Persists to a new `DraftResult` table and exposes a minimal `GET` endpoint for retrieval.
