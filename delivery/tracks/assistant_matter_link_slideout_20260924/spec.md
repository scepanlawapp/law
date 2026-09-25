# Spec

## Problem

The matter-link card is rendered inline at the bottom of the chat message stream whenever a brief exists. It reads as part of the conversation, interrupts the message flow, and behaves differently from the draft review, which lives in a dedicated right-side slideout pane. In a session that has both a draft and a brief, the two concerns (review the document vs. confirm the case/work) are expressed in two unrelated places.

## Outcome

- The matter-link becomes a right-rail pane identical in pattern to the draft review panel: a collapsible rail with a header (icon, title, status), a chevron to collapse/expand, and a scrollable body.
- A single shared right rail renders either the draft review or the matter-link. When both a draft and a brief exist in the selected session, a compact tab switcher appears at the top of the rail (Draft | Case work).
- The rail auto-expands when new work arrives, with parity to the draft: a fresh brief opens the rail on the Case-work tab, a fresh draft opens it on the Draft tab. Id guards prevent SSE/session refreshes from re-expanding a rail the user collapsed.
- Nothing from the matter-link renders inside the chat message stream anymore.
- When the session's case is already linked, the pane still opens and shows the linked case summary plus an "Open case" link.
- The pane stays open until the user collapses it; switching sessions collapses the rail.
- Both panels stay mounted while the rail is available so the matter-link does not refetch its brief preview and in-progress form state survives tab switches.
- Mobile keeps the existing draft-pane behavior (rail becomes a full-height overlay pushed by a header toggle).

## Non-goals

- No backend/API changes: `previewBrief`, `linkSessionCase`, `applyBrief`, `applyBriefTasks` are untouched.
- No changes to the draft review panel itself beyond how it is mounted.