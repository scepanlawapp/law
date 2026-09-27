# Chat Citation Preview — Specification

## Problem

A reader has to jump to the "Izvori" list to see what a `[n]` marker cites, then find their place in the reply again.

## Requirements

- Hovering a citation marker in an assistant reply (after a short delay), or focusing it with the keyboard, shows a preview anchored to the marker. It contains the article label (article, tariff item or general provision), the source title, the snippet, the match percentage and an "Open source" link.
- The preview uses the citation of the same message the marker belongs to.
- It stays open while the pointer moves from the marker into the preview, so the source link can be clicked. It closes on pointer leave (short delay), blur, `Escape`, and when the marker is clicked to jump to the source.
- The preview sits below the marker, or above it when there is no room, stays inside the viewport, and closes when the page or chat panel scrolls.
- Accessibility: the preview has `role="tooltip"` and the marker gets `aria-describedby` while it is open.
- Styling uses theme tokens only.
- Clicking a marker still jumps to the source entry (parent track). Touch devices keep that tap behaviour.

## Approach

Markers are rendered through sanitized `[innerHTML]`, so Spartan trigger directives cannot be attached to them. The assistant listens for delegated `mouseover`/`mouseout`/`focusin`/`focusout` on its host and opens one CDK overlay (`createOverlayRef`, `createFlexibleConnectedPositionStrategy`, `createRepositionScrollStrategy`) connected to the marker element.

## Out of scope

- Previews for the draft review panel (its text has no inline markers).
