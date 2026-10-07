# Assistant Conversation Organizer — Specification

## Problem

The assistant sidebar lists every conversation in one infinite list grouped by day. The only way to narrow it is a text box that matches the conversation title. Lawyers look for a conversation by matter (client → case), by state (a proposal waits for approval, a draft is ready) and by who started it — not by a remembered title.

## Goals

- **Token search.** Typing suggests typed tokens — client, case, author — that become removable chips. Leftover text matches title, case number, case name, client name and message text.
- **Quick filter chips.** `Moji` / `Tim` scope (default `Moji`), `Čeka odobrenje` (pending proposal or running job), `Nacrti` (has a draft), `Analize` (has a document analysis), `Arhiva` (archived instead of active). Counts come from the API only.
- **Group by.** `Datum` (existing today/yesterday/date grouping) or `Predmet` (client · case number, `Nepovezano` last).
- **Pin and archive.** Pinned conversations sit on top in both group modes. Archive uses the existing `ChatSessionStatus.ARCHIVED`; archived conversations are hidden unless the `Arhiva` chip is on.
- **Row actions.** Pin/unpin, archive/restore, rename, delete from a per-row menu.
- **Shareable state.** Filters live in URL query params; the case page can open the assistant filtered to a case. Group mode is remembered per browser.

## Non-goals

- No AI-generated folders, tags or titles beyond the existing auto-title.
- No per-user pin table; `pinnedAt` is per conversation.
- No change to how conversations are created, linked to a case, or deleted.

## Constraints

- Every query stays scoped by `workspaceId`; endpoints keep `CsrfOriginGuard` + `AuthGuard` + `WorkspaceAccessGuard`.
- Shared contracts live in `@law/api-interfaces`.
- Spartan/Helm primitives and semantic tokens only.
