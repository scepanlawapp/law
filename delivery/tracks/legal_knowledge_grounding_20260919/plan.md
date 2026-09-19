# Legal Knowledge Grounding Plan

## Phase A — Data model & shared grounding library

- [x] Add `DraftCitation` Prisma model (denormalized snapshot fields) + relations, migrate.
- [x] Refactor `LegalKnowledgeService.search()` to accept an explicit `workspaceId` param.
- [x] New `@law/legal-grounding` lib: query building, retrieval (dedupe/threshold/cap/marker
      assignment), and prompt-block formatting, with focused tests.

## Phase B — Drafting integration

- [x] Add `usedCitations` to `draftResultSchema`.
- [x] Update drafting system prompt to cite via `[n]` only from provided sources.
- [x] Extend `buildDraftingUserPrompt` with the grounding context block.
- [x] Wire retrieval + citation persistence into `runDrafting()` in `workflow.runner.ts`.
- [x] Export `LegalKnowledgeService` from its module; import into `ChatModule`.

## Phase C — Answering integration

- [x] Single-query retrieval from `userText` in `runAnswering()`.
- [x] Append grounding block to the answer system prompt.
- [x] Post-stream, detect used `[n]` markers and persist as `ChatMessage.metadata.citations`.

## Phase D — API/DTO plumbing

- [x] Add `LegalCitationResponse` type; extend `DraftResultResponse`/`ChatMessageResponse`.
- [x] Update mappers/service reads to include citations wherever drafts/messages are fetched.

## Phase E — Frontend sources UI

- [x] New `citation-list` component (badge, snippet, external link, anchor id).
- [x] `[n]` → anchor-link rendering in assistant markdown (chat messages).
- [x] Wire into `draft-review-panel` (collapsible "Izvori" section) and the assistant message
      template (compact "Izvori" list under grounded replies).

## Phase F — Verification

- [x] Focused Jest tests (grounding lib, drafting schema, workflow-runner persistence).
- [x] Prisma migration + `prisma generate`; demo seed data unaffected (no draft/citation
      fixtures in `seed-demo-data.cjs`).
- [x] `npx nx test api`, `legal-grounding`, `drafting`, `web` all pass.
- [x] `npx nx build web` (development) and `npx nx build api`/`drafting`/`legal-grounding`
      succeed; `web:build:production` and `web:lint` fail only on pre-existing,
      unrelated issues (bundle/CSS budgets, unrelated component lint errors) confirmed
      present on `main` before this track.
- [ ] Manual end-to-end check against a running stack: labor-dispute draft shows real
      citations tied to Zakon o radu articles; unrelated draft shows none (deferred to
      manual QA with `npm run api:serve` / `npm run web:serve`).
- [ ] Lint/test/build for touched projects (`chat`, `legal-knowledge`, `drafting`, `web`).

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
