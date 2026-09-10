# Chat Session Soft-Delete

- **Track ID:** `chat_session_soft_delete_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Completed on `main`. Added an `isDeleted` flag and migration, changed bulk history clearing to soft-delete, added per-session deletion, filtered deleted sessions from all chat access paths, emitted `session.deleted`, added API client and assistant sidebar support, and covered the behavior with focused tests.
