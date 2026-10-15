# Spec: Assistant time capture, billing answers, and undo

## Why
Hourly billing loses money on work nobody logs. The office already has an end-of-day time review; the assistant should turn it into proposed entries from a single question. Lawyers also ask money questions (who owes us, what is unbilled, how much of a retainer is used), and automatic saves need a cheap way back to be trusted.

## What

### Day work
- `get_day_work(date?)` returns the day's logged total, open proposed entries, meetings without logged time (with their length), and clients touched without an entry (activity, documents, chat). It reuses the time review.
- `log_work_entries` proposes up to 10 entries in one action: meetings by reference (length and title default from the meeting) or title, minutes, client and case. Every entry must resolve before anything is proposed; meetings must be past, the owner's, and not already logged.
- Modes: Auto saves the entries as PROPOSED; Manual falls back to the card (no multi-entry dialog). The assistant never invents minutes for touched clients; it asks.

### Billing answers (read-only)
- `get_client_billing(client, month?)`: open invoices (due date, remaining, days overdue, totals per currency), unbilled confirmed work (minutes, value per currency), retainer usage for the month.
- `list_receivables(overdueOnly?)`: top clients by open amount.
- Reads run as the conversation owner, so existing rules apply: invoices only for owners and admins; retainer usage for owners, admins, and the client's responsible lawyer; work entries as the user may list them. A section the user may not see is reported as not allowed.

### Undo
- An automatic save can be undone by the conversation owner within 24 hours: events and tasks are cancelled, a reschedule restores the previous time, proposed work entries are deleted. Case links and client updates have no undo.
- Undo goes through the domain services and is refused when the record has moved on (e.g. the entry was confirmed).
- The card shows "Poništi", then "Poništeno"; the agent's next turn is told what was undone.

## Out of scope
Undo for case links and client updates, a multi-entry edit form, any money-changing action.
