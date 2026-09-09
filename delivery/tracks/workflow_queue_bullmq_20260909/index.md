# Workflow Queue (BullMQ)

- **Track ID:** `workflow_queue_bullmq_20260909`
- **Type:** Feature
- **Status:** Planned

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Not started. Replaces the in-process fire-and-forget chain (`runTriage → runBriefExtraction → runDrafting`) with a persistent BullMQ queue backed by Redis so jobs survive restarts and retry on failure.
