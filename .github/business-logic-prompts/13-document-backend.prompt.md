# Phase 13 — Document backend and domain links

## Context to add manually

Attach/reference `delivery/04-legacy-data-migration/verification.md`, current storage implementation discovered in Phase 00, and `delivery/06-matter-api/changes.md`.

## Read before planning

- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Implement/refactor Document metadata and linking so one stored document can belong to Client, Matter, and/or Proceeding without file duplication.

## Mandatory Plan-mode protocol

You are working in **Plan mode first**.

Before proposing implementation details:

1. Read the repository-wide instructions in `.github/copilot-instructions.md`.
2. Read the specification files listed above.
3. Read the prior delivery artifacts referenced in `Context to add manually`.
4. Inspect the relevant repository code, migrations, tests, configuration, API conventions, and UI components.
5. Prefer repository facts over assumptions.
6. Ask me for any information that is genuinely needed and cannot be reliably determined from the repository.
7. If no blocking information is needed, explicitly write: `No blocking questions.`
8. Produce a concrete plan before modifying application code.

Your plan must include:

- repository findings relevant to this phase;
- exact scope and non-scope;
- expected files/modules to change;
- database/migration impact;
- API/contract impact;
- frontend impact when applicable;
- compatibility and data-safety risks;
- test/verification strategy;
- any decisions that require my approval.

Do not modify application code while the plan is awaiting approval.

## Delivery tracking — mandatory

This phase owns:

```text
delivery/13-document-backend/
```

Maintain:

```text
plan.md
changes.md
decisions.md
verification.md
open-questions.md
```

If Plan mode cannot write repository files, include the exact proposed content for `plan.md` in your plan response and create/update the delivery files immediately when execution begins.

During implementation:

- keep `changes.md` synchronized with actual changes;
- record durable decisions and deviations in `decisions.md`;
- record exact checks actually run in `verification.md`;
- put unresolved or deferred items in `open-questions.md`;
- write `None.` when there are no open questions.

Never claim that a check passed if you did not run it.

## Tasks

1. Reuse the existing storage provider and upload mechanism unless the approved plan requires a change.
2. Implement/align Document metadata with title, category, document date, source, visibility, description, uploader, checksum/size/mime where available.
3. Implement ClientDocument, MatterDocument, and ProceedingDocument links or repository-equivalent relationship entities.
4. Make DocumentCategory configurable through the existing lookup infrastructure.
5. Prevent cross-tenant document access and linking.
6. Preserve existing stored files and identifiers during migration/refactor.
7. Implement required API/service operations for upload, link, unlink, list, and metadata update according to current architecture.
8. Add tests, especially cross-tenant link prevention.

## Constraints

- Reuse the existing stack and conventions unless there is a documented reason not to.
- Preserve tenant isolation and authorization.
- Preserve existing data.
- Avoid destructive migrations.
- Do not invent placeholder business data.
- Do not refactor unrelated modules.
- Add/update tests for important rules introduced in this phase.
- Stop and ask if a newly discovered issue would materially change the approved product behavior.

## Completion gate

Phase is complete when a single Document can be safely surfaced through multiple relevant domain links with no storage duplication.

At the end, summarize the phase and point me to all files under `delivery/13-document-backend/`.
