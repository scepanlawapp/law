# Chat Portir Phase 1 Specification

## Goals

- Give authenticated workspace members a chat UI for legal intake.
- Classify each user message with Portir (legal / non-legal / unclear) before any later workflow runs.
- Persist sessions, messages, attachments, and a queued Phase 2 stub when Portir accepts.
- Stream classification status over SSE so the UI can show loading and results.
- Keep OpenRouter keys on the NestJS server. The browser never calls a model provider.

## Non-goals

Phase 2 OCR / Brief Agent, template retrieval, drafting, evaluation, n8n orchestration, MinIO/S3, public unauthenticated intake, token-by-token assistant streaming, Redis SSE fan-out, and a multi-workspace switcher are outside this track.

## Prototype exception

This slice uses OpenRouter as the LLM provider. That is an explicit, temporary exception to the on-premise zero-leakage target. Production still intends local Ollama. Prompts and attachment metadata (filename, MIME, size — not file bytes) leave the premises when OpenRouter is configured.

## Security invariants

- Chat rows are always filtered by the caller's workspace.
- Foreign session and attachment IDs return 404, not 403.
- Uploaded files stay on local disk under a workspace-scoped path and are served only after membership checks.
- LLM calls happen only from the API process.

## Users

Any ACTIVE workspace member may create sessions, send messages, and download attachments in that workspace.
