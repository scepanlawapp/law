# Clientless event write-off — proposed change requiring approval

WorkEntry currently requires a client. Events may have no client or several clients. Removing the dialog means those events cannot produce a valid ledger entry without either choosing a client or allowing clientless entries.

Proposed implementation: allow a null client only for NON_BILLABLE work, enforced by a database CHECK constraint. Event Write off would create CONFIRMED / NON_BILLABLE work with user null and, when no unique client is known, client null. Normal capture and all billable work would continue to require a client. Preserve audit creator and eventId. Show “No client” in lists and keep these records out of client billing, retainers and invoice selection. Add tests for these boundaries and null-safe display/reporting.

No client-null migration has been applied. The authorized nullable-user changes proceed independently.
