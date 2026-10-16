# TOTP Two-Factor Authentication — Specification

Parent: [auth_hardening_mfa_20261016](../auth_hardening_mfa_20261016/spec.md). Requires the templates and `auth-mail` queue from [auth_email_delivery_20261016](../auth_email_delivery_20261016/spec.md).

## Policy

- 2FA is optional per user. `OrganizationSettings.mfaRequired` (default `false`), editable by OWNER/ADMIN, forces every active member without 2FA to enroll at next login.
- Factors: TOTP (RFC 6238, SHA-1, 6 digits, 30 s) is the only enrollable factor. Recovery codes and email codes are fallbacks for an enrolled user and never replace TOTP.
- Turning 2FA on/off, regenerating recovery codes, and revoking trusted devices require re-entering the current password.

## Data model (`apps/api/prisma/schema.prisma`)

- `UserMfa` (1:1 with `User`, cascade delete): `userId` (PK), `totpSecretCiphertext`, `totpSecretIv`, `totpSecretAuthTag`, `enabledAt DateTime?`, `lastUsedStep BigInt?`, `createdAt`, `updatedAt`. A row with `enabledAt = null` is a pending enrollment.
- `MfaRecoveryCode`: `id`, `userId`, `codeHash`, `consumedAt?`, `createdAt`; index on `userId`. Regeneration deletes the old set.
- `TrustedDevice`: `id`, `userId`, `tokenHash` (unique), `expiresAt`, `revokedAt?`, `lastUsedAt?`, `userAgent?`, `ipAddress?`, `createdAt`; index on `(userId, revokedAt)`.
- `AuthTokenPurpose` gains `MFA_CHALLENGE` and `MFA_EMAIL_CODE`. `AuthToken` gains `attempts Int @default(0)` and nullable `scope String?` (`LOGIN` | `ENROLLMENT`) for challenges.
- `OrganizationSettings.mfaRequired Boolean @default(false)`.
- Update `apps/api/prisma/seed-demo-data.cjs` only if it touches these models (personas stay without 2FA so demo login keeps working).

## Secrets and hashing

- TOTP secrets: AES-256-GCM with a key derived as SHA-256 of `AUTH_MFA_ENCRYPTION_KEY` (≥ 32 characters), the same scheme as `SefSecretService` / `ORGANIZATION_SECRETS_KEY`. A separate variable keeps auth secrets independent of finance secrets. Missing/invalid key: API refuses to start in production; in development a clear startup warning and 2FA endpoints return 503.
- Recovery codes: 10 codes, format `xxxx-xxxx` (base32 alphabet, no ambiguous chars), stored as SHA-256 hashes (high-entropy, so no slow hash needed), compared case/dash-insensitively.
- Challenge, email-code and trusted-device tokens: random, SHA-256 hashed, like existing `AuthToken`s.
- TOTP verification: library `otpauth`; window ±1 step; reject a step `<= lastUsedStep` (replay); update `lastUsedStep` atomically.

## Login flow

`POST /auth/login` response becomes a discriminated union (shared type in `@law/api-interfaces`):

- `{ status: "AUTHENTICATED", session }` — as today. Returned when the user has no enabled 2FA and the office does not require it, or has 2FA and presents a valid `law_trusted_device` cookie (device `lastUsedAt` updated).
- `{ status: "MFA_REQUIRED", methods: ["TOTP","RECOVERY","EMAIL"] }` — no session; sets HttpOnly, `SameSite=Strict`, `Path=/api/auth` cookie `law_mfa_challenge` (5 min, `scope=LOGIN`).
- `{ status: "MFA_ENROLLMENT_REQUIRED" }` — office requires 2FA, user not enrolled; challenge cookie with `scope=ENROLLMENT`.

New endpoints (all `CsrfOriginGuard` + rate-limited):

- `POST /auth/mfa/verify` `{ method: "TOTP"|"RECOVERY"|"EMAIL", code, rememberDevice }` — requires a `LOGIN` challenge. Wrong code increments `attempts`; on the 5th failure the challenge is consumed and the user must restart from password. Success consumes the challenge, creates the session, optionally creates a `TrustedDevice` and sets `law_trusted_device` (HttpOnly, `SameSite=Lax`, 30 days), clears the challenge cookie, audits `MFA_VERIFY` with method.
- `POST /auth/mfa/email-code` — requires a `LOGIN` challenge for a user with enabled TOTP. Invalidates earlier unused email codes, creates a 10-minute 6-digit `MFA_EMAIL_CODE`, enqueues `mfaEmailCode`. Limits: 3 per challenge, 5 per hour per user. Always returns 204.
- `POST /auth/mfa/enrollment/start` — with an `ENROLLMENT` challenge **or** an authenticated session (+ current password when session-based). Creates/replaces a pending `UserMfa`, returns `{ otpauthUrl, qrCodeDataUrl, secret }` (QR via `qrcode`, issuer = office display name).
- `POST /auth/mfa/enrollment/confirm` `{ code }` — validates against the pending secret, sets `enabledAt`, generates recovery codes and returns them once. If started from an `ENROLLMENT` challenge, also creates the session (enrollment counts as the second factor).
- `POST /auth/mfa/disable` `{ currentPassword }` — authenticated; forbidden (409) while `mfaRequired` is on. Deletes `UserMfa`, recovery codes, trusted devices; enqueues `mfaDisabled`.
- `POST /auth/mfa/recovery-codes` `{ currentPassword }` — regenerate, return once.
- `GET /auth/mfa` — status: enabled, enabledAt, remaining recovery codes, trusted devices list.
- `DELETE /auth/mfa/trusted-devices` (all) and `DELETE /auth/mfa/trusted-devices/:id` — authenticated, scoped to own user.
- Admin (no member-management API exists yet, so these live in the auth controller, OWNER/ADMIN only, scoped to `HARDCODED_WORKSPACE_ID`):
  - `GET /auth/admin/members/security` — active members with name, email, role, 2FA enabled/enabledAt.
  - `POST /auth/admin/members/:userId/mfa/reset` — target must be a member of the workspace and not the actor; deletes the member's 2FA data and trusted devices, revokes sessions, enqueues `mfaResetByAdmin`, audits with actor.
- Organization settings DTO gains `mfaRequired`.

## Revocation rules

Password reset, password change, 2FA disable, and admin 2FA reset revoke all of the user's trusted devices. Password reset and admin reset also revoke all sessions (reset already does). Enabling `mfaRequired` does not log anyone out; it applies at next login.

## Web (`apps/web`)

- Login page: on `MFA_REQUIRED` switch to a code step (6-digit input with `autocomplete="one-time-code"`, "Zapamti ovaj uređaj 30 dana" checkbox, links "Koristi rezervni kod" and "Pošalji kod na e-mail"). On `MFA_ENROLLMENT_REQUIRED` route to `/auth/mfa-setup`. Expired challenge → back to password step with notice.
- `/auth/mfa-setup` and Settings → **Bezbednost** (Security) share one enrollment component: QR + copyable secret, confirm code, then recovery codes with copy/download (.txt) and an "I saved them" confirmation.
- Settings → Security also shows status, regenerate codes, disable 2FA, trusted devices list with revoke, and the existing change-password form moves here.
- Organization settings: "Obavezna dvofaktorska autentifikacija" switch (OWNER/ADMIN), and a new minimal **Članovi — bezbednost** table (name, email, role, 2FA status) with "Resetuj 2FA" behind a confirmation dialog. No other member management is added.
- Spartan Helm primitives, semantic tokens, SR/EN translations, `HlmSpinner` while waiting.

## Audit events

`MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFY` (outcome + method), `MFA_CHALLENGE_LOCKED`, `MFA_EMAIL_CODE_SENT`, `MFA_RECOVERY_CODES_REGENERATED`, `MFA_RESET_BY_ADMIN`, `TRUSTED_DEVICE_REVOKED`, `MFA_POLICY_CHANGED`.

## Testing

- Unit (Jest, auth lib): TOTP drift ±1 and replay rejection; recovery code single use and normalization; challenge attempt limit and expiry; email-code invalidation and limits; trusted-device issue/expiry/revocation rules; enforcement branching in `login`; disable blocked under policy; admin reset authorization; secret encryption round-trip and key validation.
- `apps/api-e2e` with Mailpit: enroll via session (codes generated from returned secret) → logout → login → verify with TOTP; recovery code; email code read from Mailpit; remember-device skips challenge; enforcement forces enrollment.
- `apps/web-e2e` (Playwright): login code step and enrollment screen.

## Out of scope

Passkeys/WebAuthn, SMS, per-role/per-user enforcement, step-up auth for other sensitive actions.
