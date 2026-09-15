# Compact Copilot Prompt Order

Use these **6 prompts** in numeric order, always in Copilot Plan mode first.

| Phase | Prompt | Manual context |
|---|---|---|
| 00 | `00-repository-audit-master-plan.prompt.md` | None |
| 01 | `01-core-domain-migration.prompt.md` | Phase 00 repository analysis, plan, decisions |
| 02 | `02-backend-api-search.prompt.md` | Phase 01 changes, decisions, verification |
| 03 | `03-frontend-clients-matters.prompt.md` | Phase 02 API changes/decisions |
| 04 | `04-documents-custom-fields-activity.prompt.md` | Phases 02–03 changes + current storage implementation |
| 05 | `05-security-cleanup-final.prompt.md` | All prior verification and open questions |

## Recommended workflow

For each phase:

1. switch Copilot to Plan mode;
2. open/invoke the numbered prompt;
3. add only the manual context listed at the top;
4. answer blocking questions;
5. review and approve the plan;
6. let Copilot implement;
7. review `delivery/NN-.../verification.md`;
8. continue only when the phase gate passes.

Each prompt already tells Copilot to ask for missing information and maintain its own delivery folder.
