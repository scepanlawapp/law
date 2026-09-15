# Assistant Workspace and Draft Review Redesign Specification

## Context

The `/assistant` route retained only structural styling after the Spartan/UI migration. Its current grid does not explicitly place the draft review panel, so the panel competes with the transcript and composer instead of behaving as a deliberate workspace. The conversation list, transcript, empty and processing states, composer, and draft review controls also lack the hierarchy, spacing, responsive behavior, and semantic-token surfaces used by the rest of the application.

The `app-draft-review-panel` component is always expanded and provides minimal layout styling. Large drafts consume chat space, raw approval enum values are displayed, warnings and missing fields are not visually differentiated, and workflow actions are not grouped by intent.

## Goals

- Turn `/assistant` into a focused, responsive legal work surface while preserving the current overall application style.
- Establish explicit layout and scroll ownership for conversation navigation, transcript, composer, and draft review.
- Present the draft as a dedicated right-side review workspace on desktop.
- Make draft review accessible and collapsible without losing unsaved draft text or reviewer notes.
- Automatically open a newly loaded draft and retain the user's expanded or collapsed choice while the same draft remains active.
- Make conversation navigation usable on narrow screens through an accessible mobile drawer.
- Improve visual hierarchy for messages, attachments, loading, errors, empty states, pending uploads, warnings, missing fields, document script, status, and review actions.
- Use Spartan/UI components, Lucide icons, Angular signals, modern template control flow, and existing semantic theme tokens.
- Support all configured themes and accent choices without hardcoded light or dark variants.

## Non-goals

- Changing chat, upload, speech recognition, SSE, draft generation, export, or approval API contracts.
- Changing backend workflow semantics or draft approval rules.
- Redesigning the global sidebar, header, theme system, or unrelated feature routes.
- Adding persistent user preferences for panel state in local storage or the backend.
- Adding arbitrary pane resizing in this track.
- Replacing existing localization infrastructure.

## Users and workflows

Lawyers and law-office staff use the assistant to search previous conversations, discuss cases and documents, attach source material, and review generated legal drafts. The design must support repeated desktop use with dense information while remaining functional on tablets and phones.

Primary workflows:

1. Start or select a conversation and read the transcript.
2. Compose a message with optional attachments or speech input.
3. Observe classification, error, and assistant-response states.
4. Open a generated draft without losing chat context.
5. Review warnings and missing fields, switch script, edit the document, add a note, save or export, and approve, reject, or request changes.
6. Collapse the review workspace to focus on chat, then reopen it without losing local edits.
7. Open conversation history from a mobile drawer and return to chat after selection.

## Functional requirements

### Assistant shell

- Desktop layout provides a conversation sidebar and a central workspace.
- When a draft exists, the central workspace provides chat plus a right-side review pane when expanded or a narrow review rail when collapsed.
- Conversation history, transcript, and expanded draft body scroll independently.
- The composer remains reachable and visually anchored at the bottom of chat.
- The selected conversation has a visible state derived from `selectedSessionId()`.
- Loading, no-conversation, empty-chat, classifying, and error states have deliberate presentation.
- Existing pagination, search, session selection, uploads, drag and drop, paste, speech, send, and delete behavior is preserved.

### Responsive navigation

- The fixed conversation sidebar is removed at the mobile breakpoint.
- A labeled icon control opens conversation history in a Spartan/UI sheet.
- The sheet supports focus management, Escape dismissal, backdrop dismissal, and appropriate accessible naming through the Spartan primitive.
- Selecting a conversation closes the mobile sheet.

### Draft expansion

- Expansion is controlled by the assistant parent because it changes the page grid.
- A draft with a different ID from the last loaded draft opens automatically.
- Collapsing and reopening the same draft does not reset text, note, or script state.
- A conversation with no draft removes the review pane and resets its identity state.
- The visible toggle exposes `aria-expanded`, names the controlled region, and is keyboard operable.

### Draft review content

- The collapsed state retains a recognizable review rail or header with status and an expand control.
- The expanded state contains a stable header, independently scrollable body, and stable action footer.
- Approval statuses are translated and never displayed as raw backend enum strings.
- Warning and missing-field sections use semantic warning or muted treatments with readable contrast.
- Latin and Cyrillic choices are presented as a compact segmented control with visible selected state.
- Draft text uses a document-oriented editable surface appropriate for long legal content.
- The reviewer note has a visible localized label in addition to placeholder text.
- Document utilities and workflow decisions are visually separated.
- Approve is primary, Reject is destructive, and Request changes remains a distinct non-destructive workflow action.

## Visual requirements

- Use `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--accent`, `--border`, `--ring`, and semantic status tokens through Tailwind or component-scoped CSS.
- Avoid hardcoded theme colors and `dark:` overrides.
- Keep radii compact and consistent with the application's operational UI.
- Keep message and document text at readable widths and sizes; do not use viewport-scaled typography.
- Prevent controls, long Serbian labels, filenames, warnings, and status labels from overflowing.
- Use Lucide icons for familiar actions and tooltips for icon-only or unfamiliar controls.
- Avoid nested decorative cards; use borders and full-height regions to establish workspace hierarchy.

## Accessibility requirements

- All icon buttons have localized accessible names.
- Draft expansion exposes accurate state and controlled-region semantics.
- Conversation sheet behavior remains keyboard and focus accessible.
- Focus rings remain visible across all themes and accents.
- Status, warning, selected, loading, and error meaning is not conveyed by color alone.
- Message timestamps use semantic `time` elements and attachment links remain keyboard accessible.
- Composer and review fields retain labels or accessible names.

## Acceptance criteria

- `/assistant` has no overlapping regions or unintended page-level double scrolling at desktop, tablet, and mobile widths.
- The transcript and draft body remain independently usable with a long conversation and long draft.
- A newly loaded draft opens automatically; manually collapsing it persists while that same draft is active.
- Collapsing does not discard unsaved draft text or reviewer notes.
- Conversations can be selected from the mobile sheet, and selection closes the sheet.
- All draft approval statuses have English and Serbian display labels.
- Empty, loading, classifying, error, attachment, warning, missing-field, and pending-file states are styled.
- Keyboard operation and visible focus work for conversation navigation, draft expansion, script selection, and all actions.
- Ivory and dark themes remain legible with multiple accent selections.
- Focused tests, web tests, web lint, and the development build pass.