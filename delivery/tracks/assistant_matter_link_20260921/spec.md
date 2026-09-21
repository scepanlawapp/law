# Assistant matter link

## What

Speed up the lawyer by connecting the existing assistant to the practice graph, in three phases:

1. Pin a chat session, and the drafts produced in it, to an existing case.
2. From a stored brief, confirm a client (match or create the plaintiff) and a case. The defendant is opposing-party text on the case.
3. From that linked brief, confirm a subset of tasks built from `missingFields` and `evidence`.

## Why

Today the assistant produces sessions, briefs, and drafts that are not linked to clients, cases, or work. The lawyer retypes anything useful. Linking the session and requiring confirmation per group removes that retyping without letting the model create office records on its own.

## Decisions

- AI remains optional. An unlinked session still works. Sending a chat message never creates a client, case, or task.
- Confirmation is per group: link, client+case, then tasks. There is no accept-all across groups.
- The plaintiff is the client. The defendant is `opposingPartyName` and `opposingPartyAddress` on the case. No party model.
- An approved draft is listed on the case by `caseId`. This track does not start the documents module and does not store a new file.
- Tasks only. No events, deadlines, inferred dates, or calendar writes.
- Idempotency lives on the brief row (`appliedCaseId`, `appliedTaskKeys`).
- Court and claim value are written into the case description, not new columns.
- Activity rows for AI-originated creates use `metadata.source = "AI_ASSISTED"`. The approving user is the actor.

## Out of scope

- Documents module, filing the DOCX, finance, notifications.
- Hearings, deadlines, and inferred limitation periods.
- Fuzzy identity resolution, JMBG invention, and organization clients from a brief.
- A second chat UI.
