# Decisions

## 1. Discovery phase scope is documentation-only

The repository instructions explicitly require plan-first behavior and prohibit modifying application code while a phase is awaiting approval. This repo-discovery phase therefore limits itself to analysis and delivery artifacts only.

## 2. Use the legal-domain docs as the target authority

The legal-domain documents in [docs/legal-domain](../../docs/legal-domain) are treated as the authoritative target model for clients, parties, matters, proceedings, documents, and related lookup patterns. The current runtime schema is evaluated against that target rather than assumed to be final.

## 3. Preserve the existing architecture

The repository already uses NestJS, Prisma, Angular, Nx, and tenant-aware runtime context. The next implementation work should reuse these patterns rather than install a different stack or parallel architecture.

## 4. Maintain tenant safety as non-negotiable

Every future domain change must preserve workspace and tenant boundaries. This is a core project rule and should be treated as a design constraint rather than an implementation detail.

## 5. Prefer additive migration steps

The project guidance requires additive, expand-and-contract migration patterns. No destructive schema removals are acceptable without a verified migration path.
