# Plan

- [x] Register track and branch.
- [x] Add nullable performer support and assignment contracts/validation; retain required client.
- [x] Add user selector and source defaults; remove event write-off dialog fallback.
- [x] Verify null-user display/reporting, assignment permissions, and timer confirmation.
- [x] Apply userId-only migration and update business docs.
- [ ] Resolve approval for the separate clientless non-billable write-off proposal. No client-null migration has been applied.

Validation: 83 focused frontend tests; 126 focused API tests across work entries, source capture and profitability (final work-entry suite rerun after timer guard). Angular development build, API TypeScript check, targeted ESLint and diff whitespace checks passed. Authenticated browser visual testing was not performed.

Automatic approval review rejected the broader nullable-client change due to billing/reporting and data-integrity scope. The safer user-only implementation is complete. Events without a client currently return a clear informational message without any dialog. The proposal is reviewable in clientless-writeoff-proposal.md and awaits the user's response.
