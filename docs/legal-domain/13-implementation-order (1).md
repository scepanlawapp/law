# Recommended Implementation Order

Run the prompt files under `.github/prompts/` in this order.

| Phase | Purpose |
|---|---|
| 00 | Repository discovery and baseline |
| 01 | Concrete domain/migration plan |
| 02 | Party, Client, contact model, configurable lookup foundations |
| 03 | Matter, participants, and Proceedings |
| 04 | Migrate existing Client/Case data |
| 05 | Client backend API |
| 06 | Matter backend API |
| 07 | Configurable lookup API |
| 08 | Client create/edit frontend |
| 09 | Matter create/edit frontend |
| 10 | Reusable inline-create lookup UX |
| 11 | Client detail frontend |
| 12 | Matter detail frontend |
| 13 | Document backend and links |
| 14 | Document frontend |
| 15 | Custom fields backend |
| 16 | Dynamic custom fields frontend |
| 17 | Activity timeline |
| 18 | Search improvements |
| 19 | Security and tenant audit |
| 20 | Legacy cleanup and final verification |

## Gate between phases

Before starting phase N+1:

- review `delivery/NN-.../changes.md`;
- review `delivery/NN-.../verification.md`;
- resolve blocking entries in `open-questions.md`;
- commit the phase or otherwise establish a clean rollback point according to your normal workflow.

Do not mechanically proceed when verification shows a data-loss risk, failed migration, broken build, or unresolved tenant/security problem.

## Scope flexibility

The exact order of Documents and Custom Fields may be adjusted if repository dependencies make another sequence materially safer.

Any reorder should be recorded in the relevant `delivery/.../decisions.md`.
