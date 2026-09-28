# Chat Starter Pickers — Plan

- [x] Card model: `pick` and `group` on `AssistantStarterPrompt`; new picker cards in the general set.
- [x] `StarterPickerService` and `StarterPickerDialogComponent`: debounced search over clients, cases, and documents; colleagues filtered locally; loading, empty, and error states; "attach a new file" for documents.
- [x] `StarterPromptsComponent`: group headings and a chevron on picker cards.
- [x] `AssistantComponent.applyStarterPrompt`: opens the picker, builds the prompt with the reference, then sends or composes.
- [x] i18n (`ser.json` / `eng.json`).
- [x] `AssistantDocumentReadsService`: explicit `doc:<id>` refs in the workspace; agent prompt line.
- [x] Tests: picker, assistant pick flow, document reads.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [x] Verification: web tests, API document-reads spec, web build, eslint.

## Notes

- The Helm `command` family (`libs/shared/frontend/ui/command`) was generated with `nx g @spartan-ng/cli:ui --name=command`. That command skips the Helm families already installed. The generator also reformatted `tsconfig.base.json`; that change was reverted, and only the `@spartan-ng/helm/command` path was kept.
- Card descriptions, group headings, and picker details use `text-sm`, following the project's 14px minimum. The first starter-card version used `text-xs`.

## Verification results

- `npx nx test web`: 20 suites and 104 tests pass. New tests cover:
  - the picker dialog: case reference, server search debounce, colleagues filtered locally ignoring diacritics, documents limited to those with a file, the attach hand-off, and the error state;
  - the assistant's pick flow: send, compose with the reference parameter, cancel, attach fallback, and no pickers in the case set.
- `apps/api` `assistant-document-reads.service.spec.ts`: 10 tests pass. They cover an explicit `doc:<id>` read and search outside the case, and NOT_FOUND for other workspaces or archived documents.
- `npx nx test mastra`: 41 tests pass.
- `npx nx build web` and `npx nx build api` succeed.
- `eslint` on the changed files is clean.
- Not yet checked by hand in a browser against a running API: dialog focus returning to the composer, the look on mobile, and the picker in each theme.
