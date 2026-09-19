# Legal Knowledge Grounding for Drafting & Answering

- **Track ID:** `legal_knowledge_grounding_20260919`
- **Type:** Feature
- **Status:** Completed
- **Parent track:** [PostgreSQL Legal Knowledge Retrieval](../legal_knowledge_pgvector_20260919/index.md)

## Documents

- [Specification](spec.md)
- [Implementation plan](plan.md)
- [Metadata](metadata.json)

## Current checkpoint

Completed. `DraftCitation` model + migration, `@law/legal-grounding` retrieval/formatting
library, drafting and answering workflows both retrieve and cite Zakon o radu chunks
(score-thresholded, marker-numbered), citations are persisted and returned via the API,
and the assistant UI renders `[n]` markers plus an "Izvori" sources panel in both chat
messages and the draft review panel. Automated tests, lint, and builds pass for all
touched projects, and the user manually verified the end-to-end flow against a running
stack (grounded labor-dispute draft with real citations; unrelated drafts show none).
