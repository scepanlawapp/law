# Decisions

## Document storage traversal

Legal document storage now resolves the candidate path and verifies it remains under the expected tenant/workspace/document directory. Invalid traversal attempts reject asynchronously and are covered by a focused test.

## Legacy Case/Client retention

Legacy Case/Client contracts, wrappers, and `/cases` routes remain because current dashboard/sidebar navigation and compatibility consumers still reference them. Removing them in this phase would break active consumers and would not be data-safe.

## Release gate

The legal domain is not marked complete. Missing custom-field APIs, participant/proceeding mutations, frontend document/activity/custom-field integration, authenticated security tests, and remote tenant verification are release blockers or explicit follow-up work.

## Historical migrations

Historical Prisma migrations and existing ChatStorageService paths remain untouched.
