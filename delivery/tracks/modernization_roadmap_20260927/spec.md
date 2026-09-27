# Law Office Modernization Roadmap — Specification

## What

A phased plan for turning the platform into the target office's competitive edge. It lists what to improve in existing features, what is missing, and the Serbia-specific bets that other offices do not have. Each item becomes a child track when it starts.

## Why

The office wants four things: more profit, less manual work, a modern way of working, and more satisfied lawyers. Most Serbian offices still work from Word, paper and spreadsheets. The advantage comes from:

- never missing a deadline;
- billing every tariff item the office is owed;
- turning around contracts and media matters faster;
- being the most responsive office a company client works with.

## Office profile (confirmed 2026-09-27)

- About 6 lawyers plus a few trainees (pripravnici).
- Clients are mostly companies. The main practice areas are contracts and media law. In media matters the office represents both media outlets and the people or companies written about.
- Billing is mostly by the Advokatska tarifa (AT), with other models for some clients.
- Pain points: all of them (deadlines, drafting time, billing and collection, client status calls).
- AI provider: a foreign provider (OpenRouter) is acceptable during development. EU or local hosting is to be revisited before production use.
- Integrations wanted: Viber and Outlook. Court e-filing and eSanduče are used, but integrating them is not a priority now.
- Still unknown: the contract types the office drafts most often.

## Starting point (2026-09-27)

Implemented:

- **Records:** clients, cases, the calendar, and tasks, deadlines and events (Team work and My work).
- **Assistant:** answers with citations from 34 legal sources (33 laws and the AT). It reads case documents and drafts lawsuits with a lawyer approval gate. Record changes it proposes need a lawyer's confirmation.

Partial or missing:

- The documents UI (the track has not started).
- The finance UI (in progress).
- Client detail tabs.
- Notifications and reports (empty screens).
- Backend domain tests.

See [.github/bussiness-logic-done-so-far.md](../../../.github/bussiness-logic-done-so-far.md).

## Principles

- AI stays optional. Every workflow must also work by hand.
- The AI only proposes. A lawyer approves every record change, draft, invoice and outgoing client message.
- Every automated or AI-assisted change writes an activity-log row.
- Serbian Latin is the canonical script. Cyrillic is used only on output.
- No fabricated numbers. Data that is not available is shown as unavailable.

## Roadmap items

### Phase 1 — Foundations and zero missed deadlines

- **Documents and client detail:** finish the documents library UI and the client documents, activities and financials tabs.
- **Deadline reminders:** email reminders at 7, 3 and 1 days before a deadline and on the day, plus a morning digest for each lawyer. The existing BullMQ queue runs them. In-app notifications replace the placeholder screen.
- **Deadline calculator:** calculate a deadline from a start date, such as delivery (dostava) or publication, and a rule (days, months, whether it is procedural). It moves past weekends and Serbian public holidays, including Orthodox Easter, and the lawyer confirms the result.
- **Conflict-of-interest check:** before a case or client is created, search the new party and the opposing party against clients, contacts and past opposing parties. The outcome is recorded.
- **Account security:** two-factor login (TOTP). Record which AI provider receives which data.

### Phase 2 — Revenue capture (AT-first)

- **The tariff as data:** tariff items with their points, the point value (currently 50 RSD) and the increase rules (such as foreign language or after hours), versioned by date in the Official Gazette (Službeni glasnik).
- **Billing proposals from completed work:** a completed hearing, filing, meeting or contract proposes a priced `BillingEntry` with its tariff item, for review in finance.
- **Cost claim:** a troškovnik is generated for court filings from the tariff and court fees.
- **Finance UI and invoicing:** finish the finance UI, then e-invoicing through the state system (SEF), which is mandatory for company clients.
- **Statutory default interest calculator:** based on the central bank (NBS) reference rate.
- **Monthly retainer report:** "work done for you this month, valued at X under the tariff". It supports paušal (fixed monthly fee) clients and fee increases.
- **First reports:** unbilled work, collections and receivables, workload per lawyer, deadlines at risk.

### Phase 3 — Contracts and Outlook

- **Contract review against the firm's standard positions:** the firm records its standard position per contract type once. The AI marks where a counterparty draft departs, suggests replacement wording, and cites the relevant article of the Law on Obligations (ZOO) or other law.
- **Clause library and contract templates:** approved clauses, with Serbian and bilingual Serbian/English output.
- **Contract obligation tracking:** from a signed contract, extract expiry dates, notice periods, renewals, payment dates and warranties as deadlines with reminders.
- **Redline comparison:** compare versions and summarize the changes in plain language for the client.
- **Company lookup (APR):** fill in client data by registration number or tax number (PIB), and draft routine corporate resolutions for APR filings.
- **Outlook (Microsoft Graph):** two-way calendar sync for hearings and deadlines, "file this email to a case" with attachments as documents, and a proposed billing entry for email work.
- **Trainee → partner review:** trainee drafts go to a responsible lawyer for approval, reusing the draft approval gate.

### Phase 4 — Media law and client experience

- **Media-law response drafting:**
  - For people and companies written about: find the false statements in an article and draft the reply or correction request, with its deadline calculated.
  - For media outlets: decide whether the outlet must publish a reply or correction it received, and check articles for legal risk before publication.
- **Media monitoring:** alerts when a client is mentioned in the press. It can be sold as a retainer service.
- **Viber:** case status updates for clients and reminders for lawyers. Viber's business messaging terms must be checked first; SMS or email is the fallback.
- **Case law corpus:** published case law, bylaws, and "which of our active cases does this change?" alerts when a law is amended.
- **Semantic search over the firm's own documents:** "have we written this before?"
- **Drafting beyond lawsuits:** answers to lawsuits, appeals, pre-suit demand letters, powers of attorney, and representation agreements.

### Deferred

- Court portal (portal.sud.rs) monitoring, eSanduče and e-filing integration.
- Batch enforcement motions (low volume in this practice mix).
- EU or local LLM hosting (revisit before production).

## Success metrics

- Share of completed work that is billed: above 90%.
- Missed deadlines: 0.
- Time from client request to first draft: from hours to under 30 minutes of lawyer time.
- Client status phone calls: down, because updates are sent proactively.
- Admin hours per lawyer per week: down, measured before and after each phase.

## Open questions

- Which contract types does the office draft most often? This is needed before the Phase 3 contract review against standard positions.
- Which reports do the partners need first?
- Which AI hosting will be used in production (EU provider, zero-retention routes, or local)?
