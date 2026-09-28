# Chat Citation Scroll — Specification

## Problem

Clicking a citation marker (`¹`, `²`) in an assistant reply does not scroll to the right source entry:

1. **Duplicate anchor ids.** Every message's source list used the prefix `message-citation`, so each grounded reply rendered `id="message-citation-1"`. The browser resolves the first match, so marker 1 in a later reply jumped to the first reply's source.
2. **Plain hash links under `<base href="/">`.** The markers were `href="#message-citation-n"` inside `[innerHTML]`. With `<base href="/">` they resolve to `/#…`, not the assistant route. The Angular router does not intercept them, so a click can leave the chat.
3. **Nested scroll container.** Messages scroll inside `.message-scroll`. Nothing marked the target, and streamed updates snapped the view back to the bottom.

## Requirements

- Anchor ids are unique per message: `message-<messageId>-citation-<n>`.
- A marker click never changes the URL or route. It scrolls the chat panel to the source entry of the same message, centres it, focuses it, and highlights it briefly.
- Smooth scrolling honours `prefers-reduced-motion`.
- Streamed deltas and message updates only keep the transcript pinned to the bottom if the reader was already near the bottom. Loading a session and sending a message still jump to the bottom.
- The draft review panel's source list keeps working as before.

## Out of scope

- A hover/focus preview of the cited snippet on the marker.
