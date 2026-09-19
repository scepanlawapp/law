# Agent Delivery Conductor Specification

## Scope

Make the existing `delivery/tracks/<id>/` four-file layout the conductor for implementation work, so Plan mode always includes a track and implementation writes or updates it.

## What

- Add an always-on **Delivery tracks (conductor)** section to [AGENTS.md](../../../AGENTS.md).
- Stop describing `delivery/tracks` as historical-only.
- Point the Doc index at [delivery/index.md](../../index.md) as the live registry.
- Delete unused `PROJECT_STRUCTURE.md`, which described a delivery system (`tracks.md`, `workflow.md`, PRDs) that is not in this repo.

## Why

Agents otherwise plan features without a spec/plan folder, and tracks drift from code. A short AGENTS.md rule is loaded on every turn (Copilot already defers to it). Hard enforcement via hooks is out of scope.

## Non-goals

- Copilot hooks that block tools until a track exists
- A new skill, prompt, or custom agent
- Reviving `tracks.md`, `workflow.md`, or required PRDs
- Rewriting older tracks
