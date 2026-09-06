# Authentication and Authorization Specification

## Goals

- Provide invite-only password authentication for the Angular application.
- Use HttpOnly cookies and revocable, rotating database sessions.
- Enforce workspace membership and role checks at the API boundary.
- Support invitation acceptance, login, logout, current-user restoration, and password reset.
- Preserve zero-leakage boundaries for legal data and future AI/n8n workflows.

## Non-goals

Public registration, OAuth/OIDC, SSO, MFA, social login, granular permission matrices, billing, and account deletion are outside this track.

The following are also intentionally deferred to platform/integration tracks:

- Full authenticated Playwright journeys and mail-capture browser fixtures.
- Disposable-database infrastructure for authenticated API E2E runs.
- Redis-backed distributed rate limiting for multi-instance deployments.
- Authorization tests for case/document resources before those domain resources exist.

## Security invariants

- Raw passwords and authentication tokens are never logged, returned, or persisted.
- Password reset and invitation responses do not reveal whether an email exists.
- Protected resource queries must scope by authenticated user or workspace in Prisma `where` clauses.
- Browser requests cannot call n8n directly; workflow identity is derived server-side.
- Production cookies are Secure and HttpOnly, with an explicit SameSite and CSRF policy.
- In-scope automated coverage verifies auth state, interceptor retry behavior, form behavior, guards, anonymous API behavior, and an opt-in authenticated API session journey.
