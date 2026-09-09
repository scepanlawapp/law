# Chat Session Auto-Title

- **Track ID:** `chat_session_title_20260909`
- **Type:** Feature
- **Status:** Planned

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

The `ChatSession.title` field already exists in the DB schema, DTOs, and frontend sidebar display, defaulting to `"New chat"`. No logic currently generates meaningful titles. This track adds an LLM-powered title generation workflow that fires asynchronously after the first user message, plus a PATCH endpoint and UI for manual rename.
