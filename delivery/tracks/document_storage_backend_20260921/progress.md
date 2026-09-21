# Document storage progress

| ID | Status | Affected files | Verification | Next action |
| --- | --- | --- | --- | --- |
| DS-00 | done | `delivery/tracks/document_storage_backend_20260921/*`, `delivery/index.md` | Track files exist | — |
| DS-01 | done | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260921120000_document_storage/migration.sql` | `npx prisma migrate deploy` applied `20260921120000_document_storage` | — |
| DS-02 | done | migration backfill + `seed.cjs` / `seed-demo-data.cjs` upserts | SQL insert + seed upserts for `local-default` | — |
| DS-03 | done | `libs/api/features/file-storage` adapter + config | `local-storage.adapter.spec.ts` exclusive write / traversal / symlink | — |
| DS-04 | done | `storage.router.ts` | FileService recorded-connection download test | — |
| DS-05 | done | `file.service.ts` | MIME, oversize, idempotency, reconcile tests | — |
| DS-06 | done | `api-interfaces.ts`, `DocumentsApiClient` | Types compile via `nx test api` / `nx build api` | — |
| DS-07 | done | `libs/api/features/workspace-documents` | Documents service unit tests | — |
| DS-08 | done | `AppModule`, `tsconfig.base.json` aliases | `nx build api` webpack compiled | — |
| DS-09 | done | `documents.service.ts` activity log + case/client counts | 400 unavailable / DOCUMENT_* log tests | — |
| DS-10 | done | `.env.example`, `config.validation.ts`, README | config.validation.spec FILE_STORAGE_ROOT cases | — |
| DS-11 | done | `chat.storage.ts` comment | Chat tests still in `nx test api` | — |
| DS-12 | done | README document file storage section | Operator notes: volume ≠ backup | — |
| DS-13 | done | `apps/api/src/app/*.spec.ts` | `NX_TUI=false npx nx test api --skip-nx-cache` — 18 suites, 94 tests passed | — |
| DS-14 | done | `.github/bussiness-logic-done-so-far.md` | Documents backend recorded; UI still placeholder | — |

## Commands run

```text
npx prisma generate --schema apps/api/prisma/schema.prisma
NX_TUI=false npx nx test api --skip-nx-cache
  Test Suites: 18 passed, 18 total
  Tests:       94 passed, 94 total
NX_TUI=false npx nx build api --skip-nx-cache
  webpack compiled successfully
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
  Applying migration `20260921120000_document_storage`
  All migrations have been successfully applied.
```

## Next action

None in this backend track. Angular documents UI is out of scope.
