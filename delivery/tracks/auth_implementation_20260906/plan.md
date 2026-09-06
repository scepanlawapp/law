# Authentication Implementation Plan

- [x] Define the conductor track and security contract.
- [x] Add Prisma models for users, workspaces, memberships, sessions, tokens, and audit events.
- [x] Add Prisma module and initial migration workflow.
- [x] Implement invite, login, logout, refresh, current-user, and password-reset use cases.
- [x] Add cookie/session security guards and configuration validation.
- [x] Add Angular auth state, interceptor, guards, and auth routes.
- [~] Add API, frontend, and Playwright coverage.
- [~] Verify CSRF/CORS, rate limiting, replay detection, workspace isolation, and secret handling.

## Implemented in the current hardening slice

- Runtime DTO validation with whitelist and unknown-field rejection.
- Cookie-session authentication guard for protected auth routes.
- Origin validation for state-changing auth requests.
- Per-client throttling for login and password-reset requests.
- Refresh-token family revocation on replay detection.
- Sanitized audit events for authentication lifecycle operations.
- Invitation acceptance, password reset, and forgot-password screens.
- API guard tests and anonymous auth E2E coverage.
- Startup validation for API origin, ports, and production SMTP requirements.
- Reusable workspace membership and role guard for future domain controllers.

## Remaining before completion

- Add full authenticated API E2E coverage against a disposable database.
- Add frontend unit coverage for auth state/interceptor and reset forms.
- Verify workspace isolation against domain resources as those resources are implemented.
- Add distributed rate limiting for multi-instance production deployments.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
