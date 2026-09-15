# Phase 05: Security Audit, Legacy Cleanup, and Final Verification

## Objective

Audit tenant isolation and IDOR risks, fix confirmed defects, preserve necessary compatibility code, and document final release status.

## Implemented in this phase

- Audited tenant/auth guard flow and current legal services.
- Confirmed current legal routes use the existing Auth, CSRF, and WorkspaceAccess guard chain.
- Fixed the duplicate `@law/documents` alias that caused API compilation failure while preserving the AI document utility alias.
- Fixed the Document list contract to include sorting used by the service.
- Fixed Angular detail-tab typing so the web build succeeds.
- Fixed legal document storage path traversal by resolving and containing candidate paths inside the tenant/document directory.
- Added and passed a focused storage traversal regression test.
- Audited legacy Case/Client consumers and retained them because dashboard/sidebar/routes and compatibility wrappers still use `/cases` and legacy exports.

## Release status

The repository is not Definition-of-Done complete. Custom-field APIs/validation, participant/proceeding mutation APIs, full Document link/unlink behavior, frontend Document/Activity/custom-field integration, authenticated security e2e coverage, and remote tenant verification remain incomplete.

## Non-scope

- No historical migration deletion.
- No destructive database cleanup.
- No permanent document deletion.
- No removal of legacy paths still consumed by current UI/API code.
- No production readiness claim without remote tenant inspection.
