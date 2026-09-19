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
- **LLM (current):** OpenRouter via `ChatModelProvider`. Ollama, n8n, and Qdrant libraries are adapter stubs. Local Postgres includes the `vector` extension for later embeddings.

## Layout

```text
apps/api                 Nest composition root, Prisma schema/migrations/seeds
apps/web                 Angular shell and feature screens
libs/api/api-interfaces  Shared FE/BE DTOs
libs/api/core            Prisma, pagination, WorkspaceAccessGuard, workspace context
libs/api/features/*      Nest domain modules (auth, chat, clients, cases, …)
libs/api/ai/*            Workflows, extraction, transliteration, LLM adapters
libs/shared/frontend     api-clients, security, Spartan Helm UI
delivery/tracks          Historical delivery specs (verify against code)
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
- The browser never calls n8n, Ollama, or Qdrant.
- `AppModule` only composes feature modules. Domain logic lives in `libs/api/features`.

## Hard invariants

- **Single database, one workspace.** One Prisma schema ([apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)), one DB. Workspace id is [HARDCODED_WORKSPACE_ID](libs/api/core/src/lib/workspace.constants.ts). Do not revive per-tenant databases, `TenantContext`, `/workspaces`, or `X-Workspace-Id`. Still filter every business query by `workspaceId` and keep `WorkspaceAccessGuard`.
- **Shared types.** FE/BE contracts go in [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts) (split into domain files and re-export if the barrel grows). UI-only and Nest-only types stay local.
- **Script.** Canonical stored and prompted text is Serbian Latin (`@law/transliteration`). Cyrillic only on read/export (`script=cyrillic`, DOCX).
- **Chat jobs.** `triage` → (`answering` | `brief-extraction` → `drafting`) run on BullMQ. `npm run services:up` (Redis) must be running before `api:serve`.
- **LLM stubs.** `evaluation`, `review`, and `template-retrieval` return placeholder strings. Do not treat them as implemented.
- **Uploads.** Max 5 files per message. Disk: `tmp/chat-uploads/{workspaceId}/{sessionId}/{attachmentId}`.
- **Auth.** HttpOnly cookie `law_session`. Workspace endpoints: `CsrfOriginGuard` + `AuthGuard` + `WorkspaceAccessGuard`.

## Done vs placeholder

**Implemented:** authentication, clients, cases, calendar/events, Team work / My work, assistant (chat, SSE, brief extraction, tužba drafting, draft review/approval, DOCX export), user settings.

**Routes or groundwork only — not finished product:** documents, finance, reports, notifications; some client-detail tabs (documents, activities, financials). Do not invent counts, notifications, or a second chat UI. Mark unavailable data as unavailable.

## Angular / UI

- `standalone: true`, `inject()`, `signal()` / `computed()`, `effect()` only for side effects.
- Control flow: `@if`, `@for`, `@switch`, `@defer`. Do not use `*ngIf` / `*ngFor`.
- Typed reactive forms for legal/data forms. `HlmSpinner` while waiting on HTTP.
- Spartan/UI (`@spartan-ng/brain` + local Helm). Load [.github/skills/spartan-ui/SKILL.md](.github/skills/spartan-ui/SKILL.md) for UI work. Do not reinvent a primitive that already exists.
- Style with semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, …). No hardcoded colors, no `dark:bg-slate-*` palette classes.
- Themes (`data-theme`): `midnight`, `deep-navy`, `charcoal`, `dark-teal`, `burgundy`, `ivory`.
- Accents (`data-accent`): `gold`, `emerald`, `royal-blue`, `copper`, `ice-blue`, `burgundy`, `purple`, `ivory`. Finish is a separate setting.
- Selects: options `{ value, label }` with a translation key in `label`. Bind `[itemToString]` to `createSelectItemToString` from [apps/web/src/app/shared/utils.ts](apps/web/src/app/shared/utils.ts). Do not show the raw stored value in the trigger.

```ts
readonly themeOptions = [
  { value: "CHARCOAL", label: "settings.themeCharcoal" },
];
readonly themeItemToString = createSelectItemToString(
  this.themeOptions,
  (key) => this.localization.translate(key),
);
```

## Backend

- Feature modules under `libs/api/features`. Controllers stay thin.
- Domain services read workspace from `WorkspaceContextService.required` and scope Prisma queries to that id.
- Work-tracking mutations (events, tasks, deadlines, related case/client changes) write activity-log rows.
- After Prisma shape or relation changes, update [apps/api/prisma/seed-demo-data.cjs](apps/api/prisma/seed-demo-data.cjs).
- After business-behavior changes, update [.github/bussiness-logic-done-so-far.md](.github/bussiness-logic-done-so-far.md). Keep the current filename.

## Commands

```bash
npm install
cp .env.example .env
npm run services:up      # Compose project `law`: postgres (pgvector) + redis
npm run db:migrate
npm run api:serve        # http://localhost:3000/api
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
| Spartan/UI           | [.github/skills/spartan-ui/SKILL.md](.github/skills/spartan-ui/SKILL.md)                               |
| Angular custom agent | [.github/agents/frontend-developer.agent.md](.github/agents/frontend-developer.agent.md)               |
| Delivery history     | [delivery/index.md](delivery/index.md)                                                                 |
