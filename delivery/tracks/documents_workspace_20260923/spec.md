# Documents workspace specification

## Scope

Replace the placeholder Documents screen with a production-style workspace that follows the existing Angular patterns, shared UI primitives, and backend document APIs.

## What

- Header + status cards + tabs for active/recent/needs-linking/archived documents.
- Search and filter controls using the document API and existing case/client reference data.
- List and grid presentation with a shared data model and actions.
- Right-side document detail sheet with metadata, edit form, version history, and archive/restore flows.
- Reuse the existing upload modal and refresh behaviors after new uploads and version uploads.

## Why

The backend already supports paged document listing, versioning, archive/restore, metadata patching, and download. The Angular feature is still a placeholder and needs to be completed with the same conventions as the rest of the application.

## Non-goals

- Permanent deletion
- OCR processing or AI summaries
- Folder hierarchy or deep document taxonomy
- Reworking backend document storage logic
- Introducing a separate design system

## Decisions

- Use the existing API client and contracts as the source of truth.
- Use temporary hard-coded values only when a backend value is genuinely unavailable, and mark them with a TODO comment.
- Keep list/grid states in one document facade and use the same action logic for both presentations.
- Prefer shared app patterns: localization keys, toast messages, confirm dialog, and HlmSheet/HlmTable as needed.
