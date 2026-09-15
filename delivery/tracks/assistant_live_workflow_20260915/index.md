# Assistant Live Workflow Experience

- **Track ID:** `assistant_live_workflow_20260915`
- **Type:** Feature
- **Status:** Completed
- **Branch:** `feature/assistant-live-workflow`

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

All planned implementation phases are complete. Portir routes legal turns between drafting and streamed answering, workflow jobs emit persisted running/stage/terminal snapshots, attachment extraction emits per-file state, successful drafting emits the persisted draft and a durable review-ready message, and unsupported or unreadable draft requests receive explicit next steps. The old legal acceptance boilerplate is no longer persisted.

`/assistant` now reconstructs correlated activity from persisted session jobs, subscribes once to workspace-wide SSE, isolates selected and background conversations, renders each activity after its correlated user turn, shows elapsed time and expandable persisted agent steps, assembles streamed answer deltas, and keeps the composer available for overlapping turns. It also provides background sidebar state/toasts, reconnect resynchronization, Retry, Regenerate, Copy, feedback, sanitized Markdown, desktop draft auto-open, and a mobile Open draft action.

Automated implementation verification is complete. The authenticated `/assistant` experience was manually verified by the user against the running application and works as expected.

## Verification

- Focused assistant API tests: 4 suites, 42 tests passed.
- API client tests: 2 passed.
- LLM provider tests: 5 passed.
- Portir tests: 5 passed.
- Full web tests: 6 suites, 28 tests passed.
- API lint: passed with four unrelated existing warnings.
- Web lint: passed with two unrelated existing warnings.
- Uncached API development build: passed.
- Uncached web development build: passed.
- Full API tests: 11 suites passed; existing unrelated failures remain in configuration validation and `user-settings.controller.spec.ts`.
- Authenticated manual `/assistant` verification: passed.

## Product decisions

- Show one updating activity block per correlated user turn.
- Use friendly action labels as the primary copy and agent names as secondary detail.
- Keep completed activity as an outcome-focused collapsed summary that can be expanded.
- Allow concurrent turns in one conversation, isolated by `correlationId`.
- Stream conversational assistant replies; keep structured Portir, brief, and draft outputs private and atomic.
- Match assistant output to the user's message language.
- Auto-open completed drafts on desktop and provide an explicit Open draft action on mobile.
- Allow general legal guidance with an explicit limitation; never present unverified article numbers or source links as citations.
- Include Retry, Regenerate, Copy, and feedback actions.

## Intended outcome

The transcript remains visibly active from message submission through Portir routing, attachment reading, fact extraction, drafting, and review readiness. Refreshes, reconnects, overlapping turns, and background conversations recover from persisted state rather than depending on an uninterrupted browser SSE connection.
