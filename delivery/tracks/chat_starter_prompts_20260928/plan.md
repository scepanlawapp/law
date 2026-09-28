# Chat Starter Prompts — Plan

- [x] Starter-prompt catalog `apps/web/src/app/features/assistant/assistant-starter-prompts.ts` (general + case sets, `send`/`compose` modes).
- [x] Standalone `StarterPromptsComponent` (`components/starter-prompts/`): card grid, semantic tokens, disabled while sending.
- [x] Assistant empty state renders the grid; `starterPrompts` computed switches to the case set for case-linked chats; `applyStarterPrompt` sends or fills the composer.
- [x] `ser.json` / `eng.json` keys for every card.
- [x] Widen `PORTIR_PRACTICE_RULE` to cover office read queries; spec assertions.
- [x] Component tests (starter-prompts, assistant send/compose/case set).
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [x] Verification: web + triage tests, web lint.

## Verification results

- `npx nx test web`: 19 suites and 94 tests pass, including the new `starter-prompts.spec.ts` and three assistant starter-prompt tests (sending, composing, and the case set).
- `npx nx test triage`: 10 tests pass, including one that checks the widened practice rule.
- `npx eslint` on the new and changed assistant files: clean. `npx nx lint web` reports the same 11 problems (9 errors, 2 warnings) with and without this change.
- `npx nx build web`: succeeds. It prints the bundle-budget warnings that were there before this change (the initial bundle and `assistant.component.scss`).
- No end-to-end run against a live model yet: whether Portir actually accepts each starter prompt still needs a manual check with the API running.
