# Documents in Case and Client Details Specification

## Scope

Reuse the Documents workspace component in case and client detail document tabs, with fixed relationship context and preserved case overview document summaries.

## What

- Support optional fixed case and client IDs in the Documents component's list query and upload flow.
- Hide fixed relationship filters while keeping case multi-select available for a fixed client, with case options scoped to that client.
- Replace the case detail documents table and client detail placeholder with the reusable Documents component.
- Retain the case overview recent-document preview and count, refreshing them after document changes.
- Preserve the standalone Documents page and its existing controls.

## Why

Case and client detail should offer consistent document search, views, paging, metadata, version, archive, restore, and upload behavior without duplicating a second document table.

## Non-goals

- Changes to document API or backend filtering behavior.
- Changes to the standalone Documents page behavior.
