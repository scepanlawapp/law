# Stojkovic Law Automation

Nx monorepo for a Serbian law-firm automation platform. The initial workspace contains the NestJS API, the primary Angular client, shared contracts, local AI adapter boundaries, and independently expandable workflow libraries.

## Prerequisites

- Node.js 22 LTS
- npm
- Docker Compose project `law` for local PostgreSQL with pgvector and Redis (Ollama and n8n remain optional/commented)

## Install

```bash
npm install
cp .env.example .env
```

The browser-safe runtime settings are in `apps/web/public/config.json`. Use `config.local.json` for local browser overrides; do not put credentials in either file.

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

The API is available at `http://localhost:3000/api`, with health at `http://localhost:3000/api/health`. The Angular client is available at `http://localhost:4200`.

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
libs/api/ai/n8n          Server-side n8n integration boundary
libs/api/ai/ollama       Local model adapter boundary
libs/api/ai/knowledge    Legal-source chunking and embedding boundary
libs/api/ai/workflows    One Nx library per AI workflow
libs/shared               Shared frontend and TypeScript libraries
infra/docker              Local dependency composition
infra/n8n                 Versioned workflow exports and conventions
```

## Add an AI workflow

Generate a library under `libs/api/ai/workflows/<name>`, add its workflow name and typed contracts in `libs/api/ai/contracts`, then add the n8n export under `infra/n8n/workflows`. Keep authorization in the API boundary and re-check access before any data enters model context.

## Verify

```bash
npx nx show projects
npm run lint
npm run test
npm run build
npm run services:config
```

Implemented so far: authentication and workspaces, chat with uploads and SSE, attachment extraction (PDF/DOCX/XLSX/TXT, image and scanned-PDF OCR) normalized to Serbian Latin, Portir triage, brief extraction and tužba drafting via OpenRouter, draft review/approval, DOCX export, and versioned legal-source ingestion/search through PostgreSQL `pgvector`. Not yet implemented: evaluation loop, assistant integration of retrieved law, hybrid/reranked retrieval, local Ollama completions, state-portal integrations, production TLS and zero-leakage controls. See [delivery/roadmap.md](delivery/roadmap.md) for the plan.
