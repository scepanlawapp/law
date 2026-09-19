-- Enable pgvector for later embedding / similarity search.
-- Requires a Postgres image that ships the extension (local: pgvector/pgvector:pg17).
CREATE EXTENSION IF NOT EXISTS vector;
