# Plan

## Track scaffolding

- [x] Create the implementation branch `assistant_matter_link_slideout_20260924` before any code edit.
- [x] Write `index.md`, `spec.md`, `plan.md`, `metadata.json` and register the link in `delivery/index.md` (Active Tracks).

## State refactor (`assistant.component.ts`)

- [x] Rename `draftReviewExpanded` → `rightRailExpanded` (header toggle, `.review-expanded` binding, draft panel `[expanded]`, `openDraftReview`, `applyDraft`, `deleteSession`).
- [x] Add `railTab = signal<"draft" | "matter">("draft")` and `matterAvailable` computed (`latestBriefId()` + selected session + workspace present).
- [x] Add `loadedBriefId` id guard; auto-expand rules with parity to drafts:
  - brief arrives (`handleEvent` job completed, `selectSession`/`resyncSelectedSession` with a brief) → expand rail + tab `matter`;
  - new draft (`applyDraft`) → expand rail + tab `draft`;
  - session select/resync collapses first, then re-applies the rules; refresh/SSE updates never re-expand a rail the user collapsed.
- [x] `deleteSession` on the active session also resets `latestBriefId` and `rightRailExpanded` (fixes stale-brief leak).

## Matter-link pane (`matter-link.component.ts`)

- [x] Restructure from a card to a rail pane mirroring `draft-review-panel`: `:host` full-height block, header (icon + title + status), scrollable body, collapsed-rail styling (vertical title + chevron), mobile rules; own SCSS file.
- [x] Add `expanded` input + `expandedChange` output (chevron); keep `workspaceId` / `session` / `briefId` inputs and `linked` output unchanged.

## Shared rail (`assistant.component.html`) + styles

- [x] Remove the inline `<app-assistant-matter-link>` block from `.message-stream`.
- [x] Render the rail container (`.review-pane.assistant-rail`, `[class.is-expanded]="rightRailExpanded()"`) when `draft() || matterAvailable()`; widen the `.has-draft` binding to the same condition.
- [x] Compact tab switcher (styled like the draft panel's script toggle) only when both a draft and a brief exist; bind `railTab`.
- [x] Keep both panels mounted in the rail and toggle visibility with a class (not `@if`/`hidden` attribute) so matter-link state survives tab switches.
- [x] Generalize the header mobile toggle to `draft() || matterAvailable()` with the label from the active tab.
- [x] Remove obsolete `.matter-link` SCSS from `assistant.component.scss`; reuse `.review-pane` mobile overlay rules.

## i18n

- [x] Add keys to `apps/web/public/i18n/eng.json` and `ser.json` (Serbian Latin canonical): `assistant.matter.collapse` / `assistant.matter.expand`, `assistant.rail.draftTab` / `assistant.rail.matterTab`, and a status-pill key for linked/unlinked.

## Tests

- [x] Update `assistant.component.spec.ts`: matter-link now renders in the rail, not as a message-stream child; cover rail auto-expand flags, tab-switcher visibility, pane visibility toggling.
- [x] Add `matter-link.component.spec.ts`: collapsed/expanded header rendering, chevron `expandedChange`, content sections.

## Docs & close-out

- [x] Update `.github/bussiness-logic-done-so-far.md` (matter-link now lives in the right rail as the Case-work tab and auto-opens when extraction is ready).
- [x] Run `npx nx run-many -t build` / targeted lint+test for the web app; fix regressions.
- [x] Mark remaining checkboxes, set `metadata.json` status to `completed`.