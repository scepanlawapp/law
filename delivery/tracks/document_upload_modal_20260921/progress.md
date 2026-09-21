# Document upload modal progress

| ID    | Status | Affected files                                                              | Next action |
| ----- | ------ | --------------------------------------------------------------------------- | ----------- |
| DU-00 | done   | `delivery/tracks/document_upload_modal_20260921/*`                          | —           |
| DU-01 | done        | Helm progress, HTTP XHR, API client, modal, i18n, tests, case/client wiring | —           |
| DU-02 | done   | Category API + client-first associations + compact table                    | —           |

## Verification

- `npm run prisma:generate` and `npm run db:migrate` applied `20260921183000_document_category` (no DB reset).
- `NX_TUI=false npx nx test web --skip-nx-cache --testPathPattern=document-upload`: 10 suites, 55 tests passed.
- `NX_TUI=false npx nx test api --skip-nx-cache --testPathPatterns=documents.service --testPathPatterns=cases.service --testPathPatterns=file.service`: 3 suites, 29 tests passed (plus fingerprint category assertion).
- `NX_TUI=false npx nx build web --configuration=development --skip-nx-cache`: success.
- Production `web:build` compiled; failed existing budgets (`bundle initial` 1.39 MB vs 1 MB, `assistant.component.scss` 10.67 kB vs 8 kB), not introduced by this modal.
