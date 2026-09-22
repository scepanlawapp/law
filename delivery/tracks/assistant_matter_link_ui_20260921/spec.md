# Spec

## Problem

The assistant always renders the matter-link panel as a sibling of the chat column. The workspace grid then gives that panel a column, so the conversation is squeezed even when there is nothing to confirm.

The client and case suggestion also never appears during a live draft. Preview loads only when a session is selected again, and the finished extraction job does not carry the brief id the card needs.

## Outcome

- The chat column keeps the full workspace width unless a draft review pane is open.
- After brief extraction, the conversation shows a suggestion card with the proposed client, case number, case name, and opposing party.
- The lawyer confirms that card to create or link the client and case. A second card then offers tasks.
- Nothing is created before that confirm. A plain legal answer does not show the card.
