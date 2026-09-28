# Chat Citation Scroll — Plan

- [x] Create the track files and link them from `delivery/index.md`.
- [x] `AssistantMarkdownPipe`: take an anchor prefix and link markers to `#<prefix>-<n>`.
- [x] `AssistantComponent`: per-message `citationAnchorPrefix()`, passed to the pipe and to `law-citation-list`.
- [x] `AssistantComponent`: delegated host click handler for `.assistant-markdown` citation links that prevents navigation, scrolls the in-panel target into view, focuses and flashes it (reduced-motion aware).
- [x] `scheduleMessagesScroll`: only pin to the bottom when forced (session load, own message) or when the reader was already near the bottom.
- [x] `CitationListComponent`: `tabindex="-1"` on entries, flash highlight and focus styles from theme tokens.
- [x] Tests: pipe prefix, citation list ids/tabindex, component click targets the same message's entry without navigating.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [x] Verify: targeted web tests and lint.

## Verification results

- `npx nx test web --testPathPattern=features/assistant`: 17 suites, 87 tests passed. Covers the pipe prefix, citation list ids/tabindex, and a two-message chat where marker 1 of the second reply scrolls to, focuses and flashes that reply's own entry with the default navigation prevented.
- `npx nx lint web`: no new problems. The 11 reported problems (9 errors, 2 warnings) also appear on `main`.
- Not verified in a running browser.
