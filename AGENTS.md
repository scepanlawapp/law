# Project Guidelines

Always-on context for coding agents. Keep this file short. Link to detailed docs instead of copying them.

## Product

Nx monorepo for a Serbian law-office platform: practice management (clients, cases, calendar, work) plus optional AI assistance.

AI is never required for a core workflow. Users must be able to create clients, cases, tasks, events, deadlines, and documents without the assistant.

Treat [.github/bussiness-logic-done-so-far.md](.github/bussiness-logic-done-so-far.md) as the source of truth for what is implemented. Prefer it over README, roadmap, or older notes when they disagree.

## Stack

- **Monorepo:** Nx, TypeScript, Node 22
- **Web:** Angular 22 (standalone, signals, typed reactive forms), Tailwind CSS v4, Spartan/UI
- **API:** NestJS, Prisma, PostgreSQL (`law_platform`, local image `pgvector/pgvector:pg17`)
- **Jobs:** Redis + BullMQ queue `workflow` (processors run inside the API process)
- **Shared contracts:** `@law/api-interfaces`
- **LLM (current):** OpenRouter via the Mastra model layer (`@law/mastra`; `ChatModelProvider` for structured calls). Legal-source embeddings use PostgreSQL `pgvector` through the `@law/knowledge` boundary.

## Layout

```text
apps/api                 Nest composition root, Prisma schema/migrations/seeds
apps/web                 Angular shell and feature screens
libs/api/api-interfaces  Shared FE/BE DTOs
libs/api/core            Prisma, pagination, WorkspaceAccessGuard, workspace context
libs/api/features/*      Nest domain modules (auth, chat, clients, cases, …)
libs/api/ai/*            Workflows, extraction, transliteration, LLM adapters
libs/shared/frontend     api-clients, security, Spartan Helm UI
delivery/tracks          Conductor specs (index/spec/plan/metadata); verify against code
.codex/agents            Project-scoped Codex custom-agent definitions
.agents/skills           Project-scoped Codex skills
```

## Dependency flow

```text
Spartan Helm / Brain
  → apps/web feature (signals / reactive forms)
  → @law/api-clients
  → @law/api-interfaces
  → Nest feature controller / service
  → Prisma / disk storage / AI workflows
```

- Apps import libs. Libs never import apps.
- The browser never calls n8n, Ollama, or embedding providers.
- `AppModule` only composes feature modules. Domain logic lives in `libs/api/features`.

## Hard invariants

- **Single database, one workspace.** One Prisma schema ([apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)), one DB. Workspace id is [HARDCODED_WORKSPACE_ID](libs/api/core/src/lib/workspace.constants.ts). Do not revive per-tenant databases, `TenantContext`, `/workspaces`, or `X-Workspace-Id`. Still filter every business query by `workspaceId` and keep `WorkspaceAccessGuard`.
- **Shared types.** FE/BE contracts go in [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts) (split into domain files and re-export if the barrel grows). UI-only and Nest-only types stay local.
- **Script.** Canonical stored and prompted text is Serbian Latin (`@law/transliteration`). Cyrillic only on read/export (`script=cyrillic`, DOCX).
- **Chat jobs.** BullMQ runs `triage` (Portir guardrail) → one `agent-turn` per legal request (the Mastra `legalAssistant`, `@law/mastra`). Drafting runs through its tools, which create `brief-extraction`/`drafting` job rows; review-panel revisions and retries run those jobs through the same Mastra workflows. Record changes are only proposed (`PendingAction`). Approval executes them and enqueues `agent-resume`. `npm run services:up` (Redis) must be running before `api:serve`.
- **Uploads.** Max 5 files per message. Disk: `tmp/chat-uploads/{workspaceId}/{sessionId}/{attachmentId}`.
- **Auth.** HttpOnly cookie `law_session`. Workspace endpoints: `CsrfOriginGuard` + `AuthGuard` + `WorkspaceAccessGuard`.

## Delivery tracks (conductor)

Every implementation task is conducted by a delivery track. `spec.md` is what/why; `plan.md` is how (checkboxes). Never mix them. Skip only Q&A or exploration with no repo change.

- Prefer updating an open parent track when this work continues it. Create a new folder for a distinct work item.
- Folder: [delivery/tracks](delivery/tracks)/`<snake_case>_<YYYYMMDD>/`
- Implementation branches must be created before the first code edit and named exactly after the delivery track ID (for example, `legal_knowledge_pgvector_20260919`). Planning or Q&A without repository changes does not require a branch.
- Required files: `index.md`, `spec.md`, `plan.md`, `metadata.json`. Register a link in [delivery/index.md](delivery/index.md). There is no `tracks.md`.
- `metadata.json`: `track_id`, `parent_track_id` (or `null`), `type` (`epic` | `feature` | `fix` | `chore`), `status` (`pending` | `in_progress` | `completed`), `created_at`, `updated_at`, `keywords`. Optional: `priority`, `prd_reference` (usually `null`; do not require a PRD).
- **Plan mode:** include explicit steps for those four files plus the index link (`track_id`, parent, type, status, spec outline, plan checkboxes). Do not write the files while planning.
- **Implement:** write or update the track files first, then code, then mark `plan.md` checkboxes and `metadata.json` status. Verify tracks against code.
- Example: [work_tracking_ux_20260919](delivery/tracks/work_tracking_ux_20260919/).

## Done vs placeholder

**Implemented:** authentication, clients, cases, calendar/events, Team work / My work, assistant (chat, SSE, brief extraction, tužba drafting, draft review/approval, DOCX export), user settings.

**Routes or groundwork only — not finished product:** documents, finance, reports, notifications; some client-detail tabs (documents, activities, financials). Do not invent counts, notifications, or a second chat UI. Mark unavailable data as unavailable.

## Angular / UI

- `standalone: true`, `inject()`, `signal()` / `computed()`, `effect()` only for side effects.
- Control flow: `@if`, `@for`, `@switch`, `@defer`. Do not use `*ngIf` / `*ngFor`.
- Typed reactive forms for legal/data forms. `HlmSpinner` while waiting on HTTP.
- Spartan/UI (`@spartan-ng/brain` + local Helm). Load [.agents/skills/spartan-ui/SKILL.md](.agents/skills/spartan-ui/SKILL.md) for UI work. Do not reinvent a primitive that already exists.
- Style with semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, …). No hardcoded colors, no `dark:bg-slate-*` palette classes.
- Themes (`data-theme`): `midnight`, `deep-navy`, `charcoal`, `dark-teal`, `burgundy`, `ivory`.
- Accents (`data-accent`): `gold`, `emerald`, `royal-blue`, `copper`, `ice-blue`, `burgundy`, `purple`, `ivory`. Finish is a separate setting.
- Selects: options `{ value, label }` with a translation key in `label`, built from a shared label map. Bind `[itemToString]` to `createSelectItemToString` from `shared/models`. Do not show the raw stored value in the trigger.

```ts
readonly themeOptions = optionsFrom(THEME_LABELS);
readonly themeItemToString = createSelectItemToString(
  this.themeOptions,
  (key) => this.localization.translate(key),
);
```

## Code organization (web + contracts)

One definition per concept. A component may declare a type, enum or constant only if it is used by that component alone and exists nowhere else; otherwise it lives in one of these places:

| What | Where |
| --- | --- |
| FE/BE contract types, DTOs, query/request shapes, enums | `@law/api-interfaces` ([libs/api/api-interfaces/src/lib](libs/api/api-interfaces/src/lib)); never in `@law/api-clients` or a component |
| Web-only shared enums/types | [apps/web/src/app/shared/models/types](apps/web/src/app/shared/models/types) |
| Enum → translation key maps, option lists, sort fields | [apps/web/src/app/shared/models/labels](apps/web/src/app/shared/models/labels) (`<domain>.labels.ts`) |
| Select helpers | [shared/models/select-option.ts](apps/web/src/app/shared/models/select-option.ts): `SelectOption`, `LabelMap`, `optionsFrom`, `filterOptionsFrom`, `labelOf`, `createSelectItemToString` |
| Sorting | [shared/models/sort.ts](apps/web/src/app/shared/models/sort.ts): define `SortFields` per list, build with `sortOptions`, display with `createSortItemToString`, send `field:direction` (`SortDirection`) |
| Locale / time zone | [shared/models/locale.ts](apps/web/src/app/shared/models/locale.ts) and `LocalizationService.locale()` |
| Pagination | [shared/pagination/paginated-list.ts](apps/web/src/app/shared/pagination/paginated-list.ts): `injectPaginatedList`, `PageState`, `LocalPagination`, `<law-pagination [paginator]>` |

Import web models through the `shared/models` barrel.

Rules:

- **Enums, not literals.** Contract unions are enum-like const objects with a same-named type (`export const CaseStatus = { DRAFT: "DRAFT", … } as const; export type CaseStatus = …`); tuple-backed ones use `enumOf(TUPLE)`. Code compares and assigns `CaseStatus.DRAFT`, never `"DRAFT"`. Templates use the enum exposed on the component (`protected readonly CaseStatus = CaseStatus`). Specs may use literals. New contract unions follow the same pattern; API error `code`s go in `ApiErrorCode`.
- **Labels in one map.** Every enum shown in the UI has exactly one `LabelMap<Enum>` keyed by enum members (`[CaseStatus.DRAFT]: "cases.status.DRAFT"`). Build options with `optionsFrom` / `filterOptionsFrom(map, "…all")`; translate single values with `labelOf`. No inline `{ value: "X", label }` arrays and no `'prefix.' + value` keys.
- **Locale.** Format dates/numbers with `localization.locale()` or `intlLocale(language)`; never `language() === "EN" ? … : …` or locale string literals. Compare languages with `UserSettingsLanguage`. Use `OFFICE_TIME_ZONE`, not `"Europe/Belgrade"`.
- **Every user-visible string is translated** (text, placeholders, titles, aria-labels, toasts, errors) and added to both `apps/web/public/i18n/ser.json` (Serbian Latin) and `eng.json`.
- **Page size.** Lists use the default page size (`DEFAULT_PAGE_SIZE`, 100) from the pagination state; lookups pass `FIRST_PAGE` / `{ ...FIRST_PAGE, search }`. Do not pass page sizes. Exceptions: dashboard counters and exists-checks may use `pageSize: 1`.
- **Sorting.** Lists declare `SortFields` (field → label key + `SortKind`) in the domain labels file and reuse the shared sort helpers.

## Backend

- Feature modules under `libs/api/features`. Controllers stay thin.
- Domain services read workspace from `WorkspaceContextService.required` and scope Prisma queries to that id.
- Work-tracking mutations (events, tasks, deadlines, related case/client changes) write activity-log rows.
- After Prisma shape or relation changes, update [apps/api/prisma/seed-demo-data.cjs](apps/api/prisma/seed-demo-data.cjs).
- After business-behavior changes, update [.github/bussiness-logic-done-so-far.md](.github/bussiness-logic-done-so-far.md) and the delivery track (`plan.md` checkboxes, `metadata.json` status). Keep the current filename.

## Commands

```bash
npm install
cp .env.example .env
npm run services:up      # Compose project `law`: postgres (pgvector) + redis
npm run db:migrate
npm run api:serve        # http://localhost:3001/api
npm run web:serve        # http://localhost:4200
npm run db:seed:auth
npm run db:seed:demo
npx nx run-many -t lint
npx nx run-many -t test
npx nx run-many -t build
```

Prefer a targeted Nx/Jest project over the whole workspace unless asked.

Browser runtime settings: [apps/web/public/config.json](apps/web/public/config.json). Local overrides: `config.local.json`. No credentials in either file.

## Gotchas

- Chat service tests run from `apps/api` (`apps/api/src/app/chat.service.spec.ts`). `libs/api/features/chat` has no `project.json`.
- pdf-parse under Jest may need `NODE_OPTIONS=--experimental-vm-modules`. Real OCR tests are opt-in: `RUN_OCR_INTEGRATION=1`.
- Jest projects that load `@law/mastra` must use `mastraTransformIgnorePatterns` + `esmJsTransform` from [jest.esm-interop.cjs](jest.esm-interop.cjs). Do **not** use `--experimental-vm-modules` for them.
- [delivery/roadmap.md](delivery/roadmap.md) and older exploration notes are historical. If they mention multi-tenant DBs, fire-and-forget workflows, or cream/custom CSS, ignore them.
- [.github/project-architecture.md](.github/project-architecture.md) describes an aspirational multi-tenant split; the live model is the single-database collapse in [delivery/tracks/single_database_collapse_20260917](delivery/tracks/single_database_collapse_20260917).

## Doc index

| Need                 | Read                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| What is implemented  | [.github/bussiness-logic-done-so-far.md](.github/bussiness-logic-done-so-far.md)                       |
| Product intent       | [.github/bussines-description.md](.github/bussines-description.md)                                     |
| Run / layout         | [README.md](README.md)                                                                                 |
| Schema               | [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)                                         |
| Shared DTOs          | [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts) |
| Spartan/UI           | [.agents/skills/spartan-ui/SKILL.md](.agents/skills/spartan-ui/SKILL.md)                               |
| Codex custom agents  | [.codex/README.md](.codex/README.md)                                                                   |
| Angular shared agent | [.github/agents/frontend-developer.agent.md](.github/agents/frontend-developer.agent.md)               |
| Delivery tracks      | [delivery/index.md](delivery/index.md)                                                                 |
