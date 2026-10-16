# Stojkovic Law Automation

Nx monorepo for a Serbian law-firm automation platform. The initial workspace contains the NestJS API, the primary Angular client, shared contracts, local AI adapter boundaries, and independently expandable workflow libraries.

## Prerequisites

- Node.js 22 LTS
- npm
- Docker Compose project `law` for local PostgreSQL with pgvector, Redis, and Mailpit (Ollama and n8n remain optional/commented)

## Install

```bash
npm install
cp .env.example .env
```

The browser-safe runtime settings are in `apps/web/public/config.json`. Use `config.local.json` (gitignored) for local browser overrides: when it exists, it is loaded instead of `config.json`. Do not put credentials in either file.

## Run

```bash
npm run services:up // Compose project `law`: postgres (pgvector) + redis
npm run db:migrate // database migration
npm run api:serve // backend
npm run web:serve // frontend
npm run db:seed:auth // Insert first user
npm run legal:ingest -- --dry-run // Fetch and inspect the first legal source
```

The chat pipeline (triage -> brief-extraction -> drafting) runs as BullMQ jobs on a Redis-backed `workflow` queue, so `services:up` (which starts Redis) must be running before `api:serve`.

The API is available at `http://localhost:3001/api`, with health at `http://localhost:3001/api/health`. The Angular client is available at `http://localhost:4200`.

### Testing email locally

Email invitations and password-reset messages are delivered via Mailpit (`http://localhost:8025`), a local SMTP sink that captures outbound mail. No actual email is sent in development.

Local end-to-end check: with the API running, run `AUTH_E2E_EMAIL=<seeded user> AUTH_E2E_PASSWORD=<its password> MAILPIT_URL=http://localhost:8025 npx nx e2e api-e2e --testPathPatterns=auth-email`. Use a dedicated or seeded e2e user whose password equals `AUTH_E2E_PASSWORD`, never a real account: the test resets that account's password to `AUTH_E2E_PASSWORD`, revokes all its sessions and sets it ACTIVE, and it clears the whole local Mailpit inbox. Mailpit can take several seconds per delivery on some setups (for example WSL reverse DNS lookups); `infra/docker/compose.yml` sets `MP_SMTP_DISABLE_RDNS=true` on the Mailpit service to avoid Mailpit's reverse-DNS delay (it applies the next time the services are brought up with `npm run services:up`).

### Production email

Auth email (invitations, password reset, password-changed notices) goes through the `auth-mail` BullMQ queue and a standard SMTP provider. Configure the provider with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. Set `SMTP_FROM` to an address on the domain you authenticate with the provider, and publish SPF, DKIM and DMARC records for that domain, otherwise reset and invitation mail is likely to land in spam. Redis must be reachable in production: it carries the mail queue and the auth rate limits (the login and forgot-password endpoints answer 503 when Redis is down).

## Document file storage

Workspace documents stream to a local directory (`FILE_STORAGE_ROOT`, absolute path required in production; development default is `<repo>/tmp/file-storage`). Chat attachments stay under `CHAT_UPLOAD_DIR` and are a separate store.

The file tree is not a backup. Restore needs PostgreSQL **and** this directory together. A single API process is assumed unless operators put `FILE_STORAGE_ROOT` on shared filesystem storage. Do not point the directory at source, `public/`, or chat upload paths.

## Workspace layout

```text
apps/api                 NestJS composition root and Prisma ownership
apps/web                 Angular intake/client application
libs/api/api-interfaces  API DTO boundary
libs/api/core            Backend infrastructure boundary
libs/api/ai/contracts    Typed workflow requests, results, and authorization context
libs/api/ai/mastra       Mastra agent, tools, workflows (assistant engine)
libs/api/ai/knowledge    Legal-source chunking and embedding boundary
libs/api/ai/workflows    One Nx library per AI workflow
libs/shared               Shared frontend and TypeScript libraries
infra/docker              Local dependency composition
infra/n8n                 Versioned workflow exports and conventions
```

## Add an AI workflow

Add assistant capabilities as Mastra tools or workflows in `libs/api/ai/mastra` (see `AI_ARCHITECTURE.md`), with prompts and schemas in a `libs/api/ai/workflows/<name>` library when they are reusable. Keep authorization in the API boundary and re-check access before any data enters model context.

## Verify

```bash
npx nx show projects
npm run lint
npm run test
npm run build
npm run services:config
```

Implemented so far: authentication and workspaces, chat with uploads and SSE, attachment extraction (PDF/DOCX/XLSX/TXT, image and scanned-PDF OCR) normalized to Serbian Latin, Portir triage, brief extraction and tužba drafting via OpenRouter, draft review/approval, DOCX export, and versioned legal-source ingestion/search through PostgreSQL `pgvector`. Not yet implemented: evaluation loop, assistant integration of retrieved law, hybrid/reranked retrieval, local Ollama completions, state-portal integrations, production TLS and zero-leakage controls. See [delivery/roadmap.md](delivery/roadmap.md) for the plan.
