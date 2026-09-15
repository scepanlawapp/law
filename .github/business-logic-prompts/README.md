# Prompt Order and Manual Context

Run these in numeric order in Copilot Plan mode.

| # | Prompt | Manual context to add |
|---|---|---|
| 00 | `00-repository-discovery.prompt.md` — Repository discovery and baseline | None. The repository itself is the context. Do not ask me to describe stack details that you can inspect. |
| 01 | `01-domain-migration-plan.prompt.md` — Concrete domain and migration plan | Attach or reference `delivery/00-repository-discovery/repository-analysis.md` and `delivery/00-repository-discovery/open-questions.md`. |
| 02 | `02-party-client-foundation.prompt.md` — Party, Client, contacts, and lookup foundation | Attach/reference `delivery/01-domain-migration-plan/plan.md`, `decisions.md`, and any answered open questions. |
| 03 | `03-matter-proceeding-foundation.prompt.md` — Matter, participants, and Proceedings | Attach/reference `delivery/01-domain-migration-plan/plan.md` and `delivery/02-party-client-foundation/changes.md` + `decisions.md`. |
| 04 | `04-legacy-data-migration.prompt.md` — Legacy Client and Case data migration | Attach/reference `delivery/01-domain-migration-plan/plan.md`, `delivery/02-party-client-foundation/verification.md`, and `delivery/03-matter-proceeding-foundation/verification.md`. |
| 05 | `05-client-api.prompt.md` — Client backend API | Attach/reference `delivery/02-party-client-foundation/changes.md`, `delivery/04-legacy-data-migration/verification.md`, and current API conventions discovered in Phase 00. |
| 06 | `06-matter-api.prompt.md` — Matter backend API | Attach/reference `delivery/03-matter-proceeding-foundation/changes.md`, `delivery/04-legacy-data-migration/verification.md`, and `delivery/05-client-api/decisions.md`. |
| 07 | `07-lookup-api.prompt.md` — Configurable lookup API | Attach/reference `delivery/02-party-client-foundation/changes.md`, the actual lookup implementation, and `delivery/06-matter-api/decisions.md` if Matter API established lookup contract expectations. |
| 08 | `08-client-form-ui.prompt.md` — Client create and edit frontend | Attach/reference `delivery/05-client-api/changes.md`, `delivery/07-lookup-api/changes.md`, and existing Client form/component files. |
| 09 | `09-matter-form-ui.prompt.md` — Matter create and edit frontend | Attach/reference `delivery/06-matter-api/changes.md`, `delivery/07-lookup-api/changes.md`, and existing Matter/Case form files. |
| 10 | `10-inline-create-lookups.prompt.md` — Reusable inline-create lookup UX | Attach/reference `delivery/07-lookup-api/changes.md`, `delivery/08-client-form-ui/changes.md`, and `delivery/09-matter-form-ui/changes.md`. |
| 11 | `11-client-detail-ui.prompt.md` — Client detail screen | Attach/reference `delivery/05-client-api/changes.md`, `delivery/08-client-form-ui/changes.md`, and existing Client detail/list components. |
| 12 | `12-matter-detail-ui.prompt.md` — Matter detail screen | Attach/reference `delivery/06-matter-api/changes.md`, `delivery/09-matter-form-ui/changes.md`, and existing Matter/Case detail components. |
| 13 | `13-document-backend.prompt.md` — Document backend and domain links | Attach/reference `delivery/04-legacy-data-migration/verification.md`, current storage implementation discovered in Phase 00, and `delivery/06-matter-api/changes.md`. |
| 14 | `14-document-frontend.prompt.md` — Document frontend | Attach/reference `delivery/13-document-backend/changes.md`, `delivery/10-inline-create-lookups/changes.md`, and existing document/upload UI. |
| 15 | `15-custom-fields-backend.prompt.md` — Custom fields backend | Attach/reference `delivery/02-party-client-foundation/decisions.md`, `delivery/03-matter-proceeding-foundation/decisions.md`, and current database capabilities. |
| 16 | `16-custom-fields-frontend.prompt.md` — Dynamic custom fields frontend | Attach/reference `delivery/15-custom-fields-backend/changes.md`, current form component patterns, and the Matter/Client form changes from Phases 08–09. |
| 17 | `17-activity-timeline.prompt.md` — Activity events and timeline | Attach/reference changes from Client API, Matter API, Document backend, and current event/audit infrastructure if any. |
| 18 | `18-search-improvements.prompt.md` — Client and Matter search improvements | Attach/reference `delivery/05-client-api/changes.md`, `delivery/06-matter-api/changes.md`, and database/index findings from prior phases. |
| 19 | `19-security-tenant-audit.prompt.md` — Security and tenant audit | Attach/reference all prior `verification.md` files that mention security/tenant limitations, plus the repository's auth/permission middleware/policies. |
| 20 | `20-legacy-cleanup.prompt.md` — Legacy cleanup and final verification | Attach/reference `delivery/01-domain-migration-plan/plan.md`, `delivery/04-legacy-data-migration/verification.md`, `delivery/19-security-tenant-audit/verification.md`, and any open questions from phases 00–19. |

## Standard behavior in every prompt

Every prompt already requires Copilot to:

- read `.github/copilot-instructions.md`;
- read relevant domain specs;
- inspect the repository instead of guessing;
- ask for information that is genuinely needed;
- say `No blocking questions.` when nothing is needed;
- work in Plan mode before modifying application code;
- create/update the matching `delivery/NN-phase-name/` folder;
- track plan, actual changes, decisions, verification, and open questions;
- avoid unrelated refactors.

You do not need to repeat those instructions manually.
