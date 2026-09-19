# Legal Knowledge Grounding Specification

## Goals

- Ground the `drafting` workflow's tužba output in real, retrieved legal-source text
  (Zakon o radu chunks) instead of relying solely on LLM trained knowledge, so legal
  basis references are traceable to an actual article.
- Ground the `answering` workflow's chat replies the same way when relevant legal text
  is available in the corpus.
- Show the user, in both the draft preview and chat messages, which sources were used:
  inline `[n]` markers in the text plus a dedicated "Izvori" (Sources) panel with the
  article number, source title/publisher, a quoted snippet, and a link to the source URL.
- Never force irrelevant citations onto unrelated drafts/answers — apply a minimum
  similarity threshold so citations only appear when the retrieved text is actually
  relevant to the brief/question.
- Persist citations so a draft's sources remain visible/auditable after the fact, even
  if the underlying corpus changes later (snapshot the citation content).

## Non-goals

- No new legal-source ingestion (ZPP, ZOO, etc.) — this track only wires retrieval
  against the existing Zakon o radu corpus (295 chunks) from the pgvector track.
- No hybrid retrieval, reranking, or citation-accuracy verification against case law.
- No change to the embedding model, chunking strategy, or ingestion pipeline.

## Decisions

- Grounding applies to both `drafting` and `answering` workflows.
- Drafting builds one query per `BriefResult` field (`legalBasis` entries,
  `factualDescription`, `jobType`/`reliefSought`); answering uses a single query built
  from the user's message text (no structured brief exists there).
- Citations for drafts are persisted in a first-class `DraftCitation` table (FK to
  `DraftResult`, denormalized/snapshotted fields for article/source/snippet/score).
  Citations for chat answers are persisted as denormalized JSON on
  `ChatMessage.metadata` (consistent with existing JSON metadata usage, not queried
  elsewhere, so no new table is warranted).
- Sources are displayed as a panel with inline `[n]` markers in the rendered text, not
  footnotes-only.
- A minimum similarity score gates whether any grounding context/citations are added at
  all, so an unrelated draft (e.g. a divorce case) gets zero forced Zakon-o-radu
  citations.
