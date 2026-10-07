# Assistant Conversation Organizer — Plan

- [x] Track files and `delivery/index.md` link.
- [x] Schema: `ChatSession.pinnedAt`, list index; migration; demo seed pins/archives.
- [x] Contracts: `ChatSessionListQuery`, `ChatSessionSummary.pinnedAt` + activity counts, `ChatSessionUpdateRequest.pinned/archived`, `ChatSessionFacetsResponse`.
- [x] API: list filters (scope, state, archived, case, client, author, kind), search across case/client/messages, pinned-first ordering, matter ordering.
- [x] API: `GET chat/sessions/facets` (counts + client/case/author suggestions).
- [x] API: `PATCH chat/sessions/:id` accepts `pinned` / `archived`.
- [x] API client: new query params, `sessionFacets()`, update payload.
- [x] Web: `ConversationNavigator` component (token search, chips, group toggle, pinned section, row menu, URL sync) replacing the inline sidebar.
- [x] i18n (sr Latin + en).
- [x] Tests: chat service list/facets/update; navigator grouping and filter state.
- [x] Docs: `.github/bussiness-logic-done-so-far.md`; metadata status.

## Notes

- Moving the sidebar styles also dropped the rule `.conversation-heading-icon` shared with `.message-avatar` and the empty-state icon; it is restored in `assistant.component.scss` for the chat avatars.

- Sidebar layout: "Grupiši po" is a caption above a full-width Datum | Predmet toggle (side by side it clipped the Predmet icon at the 17rem rail); segmented buttons keep icons and truncate labels.

- The case page's `?caseId=` link keeps its meaning (start a chat for that case); organizer filters use their own params (`case`, `client`, …) so the two do not collide.
- Demo seed adds nine conversations (case-linked, unlinked, several authors, two pinned, two archived). It does not seed drafts or analyses; those chips are exercised by the API tests.

## Verification results

- `npx jest src/app/chat.service.spec.ts` (apps/api) — 41 passed, including 7 organizer tests (filters, scope, Latin search, archived + pinned/matter ordering, activity counts, facets, pin/archive update).
- `npx jest src/app/features/assistant` (apps/web) — 96 passed, including `conversation-filters.spec.ts` (query/URL round-trip, grouping) and 5 organizer tests in `assistant.component.spec.ts`.
- `nx run-many -t test -p api web` — only failures are pre-existing on the base commit (`config.validation.spec.ts`, `sef-invoice-validator.spec.ts`, `finance-statement-create.component.spec.ts`).
- `nx build api` passes; `nx build web` compiles all templates and fails only on the pre-existing initial bundle budget.
- `nx lint web api` — no new findings (remaining errors predate this track).
- Migration `20261007180000_chat_session_organizer` applied locally; `prisma migrate diff` reports no drift.
