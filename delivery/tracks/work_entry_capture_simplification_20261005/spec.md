# Work Entry Capture Simplification — Specification

## Problem

- Every work entry needs minutes, but some work is billed at a flat or tariff (AT) price and has no meaningful duration.
- Completing a task or event opens the "Koliko vremena?" panel, which interrupts the user.
- The one-sentence field "Opišite rad jednom rečenicom" is only AI auto-fill input and is never saved. Meanwhile the long "Opis rada" is required.

## Requirements

1. **Title**
   - `WorkEntry.title` is required, one sentence, at most 200 characters.
   - It is the field labelled "Opišite rad jednom rečenicom". The AI "Popuni" button parses this text.
   - `description` ("Opis rada") is optional notes.
2. **Optional time**
   - `minutes` is optional on create, update and confirm (1–1440 when given).
   - An untimed entry can be CONFIRMED.
3. **Untimed billing**
   - A confirmed untimed entry can be imported into an invoice. It becomes a `pricingRequired` line at 0, and the user enters the price before sending.
   - Invoice line text is the entry title, plus " (Xh Ymin)" only when minutes are set.
4. **Month-end run**
   - Untimed HOURLY/AT entries become `pricingRequired` lines.
   - Untimed RETAINER entries are covered by the fee and add 0 minutes.
5. **No completion prompt**
   - Completing a task, event or deadline no longer opens a time prompt.
   - The backend still creates a PROPOSED entry, titled after the task or event, for time review.
6. **Backfill**
   - Existing entries get `title` = the first sentence of `description` (max 200 chars), falling back to "Rad".
   - `description` is kept.

## Out of scope

- A per-entry fixed price field. Pricing stays on the invoice line.
