# Assistant Deadline from Document — Spec

## Why

A missed remedy deadline is the costliest mistake a law office can make. Lawyers already ask the assistant "do kada je rok za žalbu?". A model that counts days by itself can get the period, the counting rule, or a holiday wrong. The assistant should therefore only recognize what the document is, and the date should come from fixed rules that a lawyer can check.

## What

- **Tool `detect_deadlines {documentRef, serviceDate?}`** (side effect: confirm).
  - The model classifies the act and the type of procedure. It reads the remedy instruction (pouka o pravnom leku), and the service date if the document states it. Each of these comes with a quote, and quotes are verified against the text.
  - **`@law/legal-deadlines`** (deterministic) picks the rule and computes the date. Its parts:
    - **Rules table.** Each rule has a period, a remedy, a legal basis and warnings. Sources are the consolidated texts:
      - ZPP: čl. 297, 367, 380, 402, 403, 411, 446, 452, 457, 472, 479, 487, 489, 493
      - ZIO: čl. 25, 73, 86, 326g
      - ZUP: čl. 153
      - ZUS: čl. 18, 51
    - **Counting.** ZPP čl. 103 and ZUP čl. 80: the day of service is not counted. If the last day falls on a Saturday, a Sunday or a public holiday, the deadline moves to the next working day.
    - **Serbian non-working days** under the Zakon o državnim i drugim praznicima:
      - 1–2 Jan, 7 Jan, 15–16 Feb, 1–2 May, 11 Nov.
      - Orthodox Easter from Good Friday to Easter Monday.
      - A state holiday falling on a Sunday makes the next working day non-working.
      - Dan pobede is a working day.
- **Service date.** The service date comes from the user, or from the document only when a verified quote supports it.
  - Without a service date, the tool returns `NEEDS_SERVICE_DATE` and the agent asks the user. It never guesses.
  - A service date in the future, or one taken from the document, is flagged.
- **Remedy instruction that disagrees with the rule.** If the remedy instruction names a different period, both are shown and the earlier date is proposed.
- **Proposal.** The result is proposed as a `create_deadline` PendingAction on the linked case, so the model never retypes the date.
  - The deadline type is COURT, or STATUTORY for ZUP.
  - The description names the document, the service date and its source, the period and legal basis, the counting steps, and any warnings.
  - A deadline that has already passed is reported (`EXPIRED`) and not proposed.
  - Without a linked case, the computed date is still reported (`NOT_PROPOSED`).
- **No deadline.** Some documents have no deadline: no remedy, a remedy that is expressly excluded, the act kind "other", or no answer to the lawsuit in small-claims or consumer disputes. These return `NO_DEADLINE` with the reason.
- **Agent prompt.** The agent must use the tool for every remedy or response deadline in a served document. It must never compute these itself or call `create_deadline` for them.
- **Starter cards:**
  - "Rok iz dokumenta", with the document picker.
  - "Rok iz dokumenta predmeta" on a linked case.

## Out of scope

- Media-law deadlines, which run from publication rather than service.
- Criminal and misdemeanour procedure.
- Deemed (fictional) service: the lawyer supplies the service date.
- Extraordinary remedies other than revizija and zahtev za preispitivanje.
- Month-based periods.
- Non-working days declared ad hoc by the government. These are listed as a warning.

## Acceptance

- A first-instance judgment served on a Friday gets a 15-day žalba deadline. If the last day falls on a holiday or weekend, it moves to the next working day.
- Small-claims, bill-of-exchange and similar judgments get 8 days.
- Without a service date, the agent asks for it.
- The confirmation card shows the computed date and the legal basis. Approving it creates the deadline on the case.
