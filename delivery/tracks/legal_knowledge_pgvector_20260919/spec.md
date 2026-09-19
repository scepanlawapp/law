# PostgreSQL Legal Knowledge Retrieval Specification

## Goals

- Replace the unused Qdrant direction with PostgreSQL `pgvector` as the only vector store.
- Ingest versioned public legal sources, starting with the Serbian `Zakon o radu` page.
- Support workspace-owned extracted documents with explicit visibility boundaries.
- Normalize Serbian Latin/Cyrillic input to canonical Serbian Latin before chunking and embedding.
- Preserve legal article, paragraph, point, source URL, and version metadata for citation-oriented retrieval.
- Provide a repeatable ingestion command and an authenticated vector-search API.

## Non-goals

- No Angular knowledge UI in the first milestone.
- No immediate assistant or drafting integration.
- No hybrid retrieval, reranking, citation verification, or automatic legal conclusions.
- No redistribution of fetched Paragraf content.

## Decisions

- PostgreSQL `pgvector` replaces Qdrant.
- Initial embedding model: BGE-M3, 1024 dimensions, through OpenRouter.
- Initial retrieval: vector-only cosine similarity.
- Serbian Latin is the canonical indexed/query form; original script is retained as metadata.
- Public and workspace-owned sources are supported, with workspace filtering enforced server-side.
