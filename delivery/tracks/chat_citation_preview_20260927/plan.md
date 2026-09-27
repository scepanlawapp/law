# Chat Citation Preview — Plan

- [x] Create the track files and link them from `delivery/index.md`.
- [x] Extract the citation label logic (`isArticleNumber`, `matchPercent`) into a shared helper used by the list and the preview.
- [x] `CitationPreviewComponent`: label, source title, snippet, match, "Open source" link; `role="tooltip"`; theme-token styles.
- [x] `CitationPreviewController` (component-scoped): show/hide delays, CDK overlay connected to the marker, hover bridge into the preview, `aria-describedby`, cleanup on destroy.
- [x] `AssistantComponent`: delegated host `mouseover`/`mouseout`/`focusin`/`focusout`/`keydown.escape` for `.assistant-markdown a.citation-marker-link`; resolve the citation from the marker's message; hide on marker click.
- [x] Tests: preview rendering; hover shows the same message's snippet; Escape and pointer leave hide it.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [x] Verify: targeted web tests and lint.

## Verification results

- `npx nx test web --testPathPattern=features/assistant`: 18 suites, 89 tests passed. New tests cover the preview rendering, and in the chat: hovering marker 1 of the second reply previews that reply's snippet with `aria-describedby`; pointer leave and `Escape` close it; keyboard focus opens it.
- `npx nx lint web`: no new problems. The 11 reported problems also appear on `main`.
- `npx nx build web`: passes. The initial-bundle and `assistant.component.scss` budget warnings also appear on `main`.
- Not verified in a running browser.

## Notes

- The preview closes on any scroll instead of following the marker. The chat panel is not a CDK scrollable, so reposition strategies would not see its scroll events.
