# Backend Build Prisma Generation Fix Specification

## Problem

The API build can compile against an outdated generated Prisma client. After schema fields were added for promoted chat documents and extracted document text, the stale client rejected valid `documentId` and extraction-field updates with TypeScript errors.

## Included

- Add Prisma client generation as an explicit prerequisite of the API build.
- Reuse the repository's canonical `prisma:generate` script and schema path.
- Preserve the existing inferred Nx/webpack API build and its dependency builds.
- Verify that a stale-client reproduction is repaired by the normal API build command.

## Excluded

- Prisma schema, migration, database, and application behavior changes.
