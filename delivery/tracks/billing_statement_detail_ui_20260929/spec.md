# Billing Statement Basic Detail UI Specification

## Problem

The statement list links to a detail route, but that route currently renders only a placeholder. Users need a basic read-only view of the same information represented by the statement composer.

## Included

- Load one existing `BillingStatement` through the existing route id and finance API client.
- Show compact loading, persistent error/retry, and loaded states.
- Present the existing statement number, client, service period, currency, lines, and authoritative total.
- Render statement lines as a read-only table with source, service date, description, amount, and currency.
- Use existing Serbian `Račun` terminology while preserving all internal statement names and routes.
- Keep the statement number as the explicit accessible list link to the detail page.
- Reuse existing localization, date/currency formatting, Helm table/spinner/button primitives, semantic theme tokens, and breadcrumb patterns.

## Excluded

- Forms, edit controls, or any mutation from the detail page.
- Status, payments, tax, dates beyond the service period, notes, contact data, history, attachments, tabs, totals breakdowns, or workflow actions.
- Backend, DTO, route, service, property, or domain-model changes.
- Redesign of the statement create/import flow.
