# Chat Starter Prompts — Specification

## Why

A new assistant chat shows only an icon, a title and one line of text, so users cannot tell what the assistant can do. The Mastra `legalAssistant` already has read tools for the agenda, work items, cases, clients, activity and documents, plus legal-source search, lawsuit drafting and deadline proposals. The empty state should offer starting points backed by those tools.

## What

- When a chat has no messages yet, show a grid of starter cards. Each card has an icon, a title and a short description.
- **Click behaviour.** Each card has a mode:
  - `send`: the question is complete. The card puts it in the composer and sends it immediately, creating the session if needed.
  - `compose`: the card needs detail from the user. It fills the composer with a stem, then focuses the composer with the caret at the end. It does not send.
- **General set** (chat not linked to a case):
  - Work: today's agenda, deadlines in the next 48 hours, my open tasks, overdue items, hearings/events this week.
  - Cases & clients: my active cases, client overview (compose).
  - Legal: research a regulation (compose), Advokatska tarifa lookup (compose, lookup only).
  - Drafting: draft a tužba (compose), analyse an attached document (compose), set a deadline (compose, becomes a proposal the user approves).
- **Case set** (chat opened with `?caseId=` or a session linked to a case): case summary, open deadlines and tasks on the case, recent activity, case documents, draft a tužba for this case (compose), set a deadline on the case (compose), research a regulation (compose).
- Prompts are canonical Serbian Latin. English translations live in `eng.json`.
- **Portir triage.** Widen the practice rule so questions about tasks, deadlines, events, the agenda, cases, clients, documents or recent activity are classified `LEGAL`/`ANSWER`, including short ones such as "moji zadaci".

## Non-goals

- Slash commands.
- A tariff calculator; the tariff card is a knowledge lookup only.
- Attaching files automatically.
- New API endpoints, DTOs or schema changes.
