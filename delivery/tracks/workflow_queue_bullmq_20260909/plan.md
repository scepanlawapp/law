# Workflow Queue Plan

- [x] Add `@nestjs/bullmq` + `bullmq`; `WorkflowQueueModule` in `libs/api/features/chat` (or `libs/api/core`) registering queue `workflow` with `REDIS_URL`; uncomment `redis` in `infra/docker/compose.yml`.
- [x] Extract `runTriage`, `runBriefExtraction`, `runDrafting` bodies from `ChatService` into `WorkflowProcessor` (`@Processor("workflow")`) methods keyed by `WorkflowName`; `ChatService` creates `WorkflowJob` + `queue.add(name, payload, { jobId: workflowJob.id, attempts: 3, backoff: { type: "exponential", delay: 2000 } })`.
- [x] Distinguish retryable (network/DB) vs terminal (LLM/zod) errors; terminal → `COMPLETED` + `errorCode` (current behaviour); retryable → throw so BullMQ retries; on final failure → `FAILED` + `error` SSE event.
- [x] Idempotency: processor checks `WorkflowJob.status` and skips if already `COMPLETED`.
- [ ] Optional `RedisChatEventBus` adapter behind `CHAT_EVENTS_TRANSPORT=memory|redis`. (Deferred: `ChatEventBus` stays in-process; revisit once the API runs more than one instance.)
- [x] Tests: processor state transitions with `FakeChatModelProvider`; retry classification; `ChatService.sendMessage` enqueues exactly one triage job.
- [x] Update `.env.example` (`WORKFLOW_QUEUE_ATTEMPTS`) and `README.md` run instructions (Redis required).

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
