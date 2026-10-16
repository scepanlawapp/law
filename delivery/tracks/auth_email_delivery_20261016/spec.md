# Auth Email Delivery and Reset Hardening — Specification

Parent: [auth_hardening_mfa_20261016](../auth_hardening_mfa_20261016/spec.md).

## Current state (verified 2026-10-16)

- `AuthMailService` (`libs/api/features/auth/src/lib/mail.service.ts`) sends English plain-text one-liners via nodemailer; on failure it logs a warning and drops the message.
- SMTP config (`auth.config.ts`) already defaults to `localhost:1025`; production requires `SMTP_HOST` and `SMTP_FROM` (`apps/api/src/app/config.validation.ts`).
- `requestPasswordReset` creates a 30-minute `PASSWORD_RESET` `AuthToken` without invalidating earlier unused ones.
- `resetPassword` consumes the token, sets the password, and revokes all sessions (correct, kept).
- `changePassword` does not revoke other sessions and sends no notification.
- `AuthRateLimitGuard` is an in-memory map keyed by `ip:path`, 5 per minute.

## Requirements

### 1. Local email: Mailpit

- Add a `mailpit` service (`axllent/mailpit`) to `infra/docker/compose.yml`, ports `1025` (SMTP) and `8025` (web UI/API). `npm run services:up` starts it with Postgres and Redis.
- `.env.example` documents that the defaults target Mailpit and links the inbox `http://localhost:8025`.
- README "Run" section mentions Mailpit.

### 2. Templated, localized auth email

- New template module in the auth lib. Each template is a pure function `(locale, data) → { subject, html, text }`.
- Templates: `invitation`, `passwordReset`, `passwordChanged`. (Child track `auth_totp_mfa_20261016` adds `mfaEmailCode`, `mfaDisabled`, `mfaResetByAdmin`.)
- Locales: Serbian Latin (`SR`, default) and English (`EN`), chosen from the recipient's `UserSettings.language`; invitations (no user settings yet) use Serbian.
- Office name in subject/footer comes from `OrganizationSettings.displayName ?? legalName`, falling back to a neutral product name.
- HTML is simple and inline-styled with no images; every email also carries the full plain-text alternative. Links use `AUTH_FRONTEND_ORIGIN`.
- Security emails ("password changed") state time, and say what to do if it wasn't you (contact the office admin).

### 3. Queued delivery with retries

- A dedicated BullMQ queue `auth-mail` owned by the auth lib (auth must not depend on the chat-owned `workflow` queue). Processor runs in the API process, like the other queues.
- Job payload: template id, recipient email, locale, template data. **Raw tokens/codes are in the job payload only as long as needed**: jobs use `removeOnComplete: true` and `removeOnFail` with a bounded age, so links/codes do not linger in Redis.
- 5 attempts, exponential backoff. Final failure writes an auth audit row (`EMAIL_DELIVERY_FAILED`, recipient user id when known) and logs without the token.
- Public responses never change based on delivery or account existence (forgot-password stays enumeration-safe).

### 4. Reset and password-change hardening

- `requestPasswordReset`: in the same transaction as creating the new token, mark all earlier unconsumed `PASSWORD_RESET` tokens of that user consumed.
- `changePassword`: revoke all other `AuthSession` rows of the user (keep the current one), and enqueue `passwordChanged`.
- `resetPassword`: additionally enqueue `passwordChanged`. (Trusted-device revocation is added by the MFA track.)
- Password-reset completion does **not** log the user in (unchanged); with MFA on, the next login still requires the second factor.

### 5. Rate limiting

- Move `AuthRateLimitGuard` counters to Redis (fixed window with `INCR` + `EXPIRE`), same per-IP+path limits as today.
- Add a per-email limit for forgot-password: 3 requests per hour per normalized email. Exceeding it silently skips sending (still returns the normal success response) and audits `PASSWORD_RESET_THROTTLED`.
- If Redis is unavailable, the guard fails closed with 503 on these auth endpoints (Redis is already a hard dependency of the API).

### 6. Production notes (documentation only)

- Any SMTP provider via existing `SMTP_*` variables (e.g. Postmark, Amazon SES, Brevo).
- Document SPF, DKIM, DMARC for the sending domain and that `SMTP_FROM` must be on that domain.

## Testing

- Unit: each template × locale renders subject/html/text with the link and no unescaped user input; reset request invalidates prior tokens; change-password revokes other sessions only; per-email throttle; Redis rate-limit guard.
- `apps/api-e2e`: forgot-password → fetch email from Mailpit HTTP API (`/api/v1/messages`, `/api/v1/message/{id}`) → reset → login with new password; old link rejected after a second request.

## Out of scope

- MFA (child track 2), marketing/notification emails, bounce webhooks.
