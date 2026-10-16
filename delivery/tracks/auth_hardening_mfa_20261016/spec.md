# Auth Hardening and Two-Factor Authentication — Epic Specification

## Why

The office is preparing to go live with confidential client data. The existing auth (cookie sessions, invitations, password reset — see [auth_implementation_20260906](../auth_implementation_20260906/spec.md)) is sound but has gaps:

- Auth emails are one-line English plain text, sent once with failures only logged.
- Requesting a new reset link does not invalidate earlier unused ones.
- Password change does not revoke other sessions.
- Rate limiting is in-memory, per IP+path only (no per-email throttle; lost on restart; not shared across instances).
- There is no second factor and no local way to inspect outgoing email.

## Decisions

| Topic | Decision |
| --- | --- |
| Approach | Extend `libs/api/features/auth` in place. No auth framework swap, no external IdP. |
| Local email | Mailpit in `infra/docker/compose.yml` (SMTP 1025, UI 8025). |
| Primary second factor | TOTP (authenticator app) + 10 single-use recovery codes. |
| Email one-time code | **Fallback only**, offered on the challenge screen for users who already enrolled TOTP. Never a standalone factor. |
| Enforcement | Optional per user; one office-wide switch `OrganizationSettings.mfaRequired` (default off). When on, users without 2FA must enroll at next login. |
| Remember device | Yes, 30 days, revoked by password change/reset, 2FA reset, or admin reset. |
| Recovery | Admin "Reset 2FA" per member, audited and emailed. |
| Email language | Recipient's `UserSettings.language` (SR/EN), default Serbian Latin. |
| SMS | Not supported. |

## Children

1. [auth_email_delivery_20261016](../auth_email_delivery_20261016/spec.md) — Mailpit, templated localized email, queued delivery, reset hardening, Redis rate limits.
2. [auth_totp_mfa_20261016](../auth_totp_mfa_20261016/spec.md) — TOTP enrollment, login challenge, recovery/email codes, trusted devices, enforcement, admin reset, UI.

Child 2 depends on child 1 (email templates + queued delivery are used for email codes and security notifications).

## Out of scope / future

- Passkeys (WebAuthn) — candidate follow-up track.
- External IdP / SSO (e.g. Microsoft Entra).
- Per-role or per-user enforcement.
- Account lockout beyond rate limiting and challenge attempt limits.
