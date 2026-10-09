# Settings Content Scrolling — Specification

## Problem

Long settings routes currently expand the app shell's main scroll container, so scrolling moves the shell rather than remaining within the settings page content pane.

## Requirements

- The settings routed-content pane has a bounded height and scrolls vertically when its content exceeds the available space.
- The settings navigation remains visible and usable on desktop and mobile layouts.
- Do not modify the app shell or its main scroll container.

## Acceptance criteria

- Long routed settings content can scroll within its own pane.
- The settings page remains constrained to the available shell height.
- The Angular web development build succeeds.
