# Stojkovic Law Automation

Nx monorepo for a Serbian law-firm automation platform. The initial workspace contains the NestJS API, the primary Angular client, shared contracts, local AI adapter boundaries, and independently expandable workflow libraries.

## Prerequisites

- Node.js 22 LTS
- npm
- Docker Compose for local PostgreSQL, Redis, Qdrant, Ollama, and n8n

## Install

```bash
npm install
cp .env.example .env
```

The browser-safe runtime settings are in `apps/web/public/config.json`. Use `config.local.json` for local browser overrides; do not put credentials in either file.

## Run

```bash
npm run services:up // docker
npm run db:migrate // database migration
npm run api:serve // backend
npm run web:serve // frontend
npm run db:seed:auth // Insert first user
```

The API is available at `http://localhost:3000/api`, with health at `http://localhost:3000/api/health`. The Angular client is available at `http://localhost:4200`.

## Workspace layout

```text
apps/api                 NestJS composition root and Prisma ownership
apps/web                 Angular intake/client application
libs/api/api-interfaces  API DTO boundary
libs/api/core            Backend infrastructure boundary
libs/api/ai/contracts    Typed workflow requests, results, and authorization context
libs/api/ai/n8n          Server-side n8n integration boundary
libs/api/ai/ollama       Local model adapter boundary
libs/api/ai/qdrant       Template retrieval adapter boundary
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

This scaffold does not yet implement authentication, OCR, document generation, legal prompts, domain persistence, production TLS, or production zero-leakage controls. Those require separate design and delivery work.
