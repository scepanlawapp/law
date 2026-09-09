# Workflow Queue Specification

## Goals

- Run every `WorkflowName` (`triage`, `brief-extraction`, `drafting`, later `evaluation`, `template-retrieval`) as a BullMQ job on a single `workflow` queue backed by Redis, instead of `void this.runX().catch()` inside the HTTP request process.
- `WorkflowJob` remains the source of truth for status (`QUEUED → RUNNING → COMPLETED | FAILED`); the BullMQ job id equals `WorkflowJob.id` so the two can never diverge and re-enqueueing is idempotent.
- Retries with exponential backoff (default 3 attempts) for infra errors; LLM/zod failures keep the existing "COMPLETED with `errorCode`" semantics and are not retried.
- Chaining stays in the processors: triage `LEGAL` enqueues brief-extraction; brief `lawsuit` enqueues drafting. The `ChatService` only creates the `WorkflowJob` row and enqueues.
- Enable the `redis` service in `infra/docker/compose.yml`; `REDIS_URL` already exists in `.env.example`.
- SSE events keep flowing through `ChatEventBus`; add an optional Redis pub/sub adapter so a worker process can emit to API instances.

## Non-goals

- Moving LLM logic to n8n.
- Separate worker deployment topology (processors run inside the API process for now; the design must not prevent splitting later).
- Job dashboards/UI.

## Context model

- Job payload = `{ workspaceId, sessionId, jobId, messageId?, correlationId }` plus the minimal workflow input already stored in `WorkflowJob.input`. Processors reload what they need from the DB — no large text in Redis.

## Users

No UI change. Reliability improvement for every workspace member.
