# Workflow Queue (BullMQ)

- **Track ID:** `workflow_queue_bullmq_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Done. `triage`, `brief-extraction` and `drafting` all run as BullMQ jobs on a single Redis-backed `workflow` queue (`WorkflowRunner` + `WorkflowProcessor`); `WorkflowJob` stays the source of truth and the BullMQ job id equals `WorkflowJob.id`. Chaining (triage → brief-extraction → drafting) happens inside the runner via the injected queue port. Infra errors propagate and get retried with exponential backoff (default 3 attempts); LLM/zod failures are caught and recorded as terminal `FAILED`/`COMPLETED` outcomes. `ChatService` falls back to an in-process inline queue when no BullMQ queue is injected (used by existing unit tests), so no behavior changed for callers.

## Current checkpoint

Not started. Replaces the in-process fire-and-forget chain (`runTriage → runBriefExtraction → runDrafting`) with a persistent BullMQ queue backed by Redis so jobs survive restarts and retry on failure.
