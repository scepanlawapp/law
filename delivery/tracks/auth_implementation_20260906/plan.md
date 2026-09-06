# Authentication Implementation Plan

- [x] 4ab07ac Define the conductor track and security contract.
- [x] 4ab07ac Add Prisma models for users, workspaces, memberships, sessions, tokens, and audit events.
- [x] 4ab07ac Add Prisma module and initial migration workflow.
- [x] 4ab07ac Implement invite, login, logout, refresh, current-user, and password-reset use cases.
- [x] 4ab07ac Add cookie/session security guards and configuration validation.
- [x] 4ab07ac Add Angular auth state, interceptor, guards, and auth routes.
- [x] 057d271 Add API and frontend auth coverage; defer full authenticated Playwright journeys.
- [x] 4ab07ac Verify CSRF/CORS, in-process rate limiting, replay detection, configuration, and secret handling; defer distributed throttling and future resource isolation.

## Implemented in the current hardening slice

- Runtime DTO validation with whitelist and unknown-field rejection.
- Cookie-session authentication guard for protected auth routes.
- Origin validation for state-changing auth requests.
- Per-client throttling for login and password-reset requests.
- Refresh-token family revocation on replay detection.
- Sanitized audit events for authentication lifecycle operations.
- Invitation acceptance, password reset, and forgot-password screens.
- API guard tests and anonymous auth E2E coverage.
- Angular `AuthState` unit coverage for bootstrap, login, and logout.
- Opt-in authenticated API E2E coverage for session restoration, rotation, replay rejection, and logout.
- Startup validation for API origin, ports, and production SMTP requirements.
- Reusable workspace membership and role guard for future domain controllers.

## Deferred by scope decision

- Full authenticated Playwright journeys and mail-capture browser fixtures.
- Disposable-database infrastructure for authenticated API E2E runs.
- Distributed Redis-backed rate limiting for multi-instance production deployments.
- Workspace isolation tests for future case/document resources.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
