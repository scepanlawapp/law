# Authentication Implementation Plan

- [x] Define the conductor track and security contract.
- [x] Add Prisma models for users, workspaces, memberships, sessions, tokens, and audit events.
- [x] Add Prisma module and initial migration workflow.
- [~] Implement invite, login, logout, refresh, current-user, and password-reset use cases.
- [~] Add cookie/session security guards and configuration validation.
- [x] Add Angular auth state, interceptor, guards, and auth routes.
- [ ] Add API, frontend, and Playwright coverage.
- [ ] Verify CSRF/CORS, rate limiting, replay detection, workspace isolation, and secret handling.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
