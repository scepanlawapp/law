# TOTP Two-Factor Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional authenticator-app 2FA with recovery codes, email-code fallback, 30-day trusted devices, an office-wide enforcement switch, admin reset, and the matching web screens.

**Architecture:** All server code lives in `libs/api/features/auth/src/lib/mfa/`. Session creation moves out of `AuthService` into `AuthSessionIssuer` so both password login and MFA verification can issue sessions without a dependency cycle. Login returns a discriminated union; the challenge between password and code is an `AuthToken` (`MFA_CHALLENGE`) referenced by an HttpOnly cookie. The web login page gains a code step; one shared enrollment component serves `/mfa-setup` and Settings → Security.

**Tech Stack:** NestJS, Prisma (PostgreSQL), `otpauth`, `qrcode`, ioredis (existing `AuthRateLimitStore`), BullMQ (`AuthMailService`), Angular 22 standalone + signals + typed reactive forms, Spartan Helm, Jest (`apps/api`, `apps/web`), `apps/api-e2e`, `apps/web-e2e` (Playwright), Mailpit.

**Spec:** [spec.md](spec.md) · parent [auth_hardening_mfa_20261016](../auth_hardening_mfa_20261016/spec.md) · depends on the merged [auth_email_delivery_20261016](../auth_email_delivery_20261016/spec.md)

**Branch:** `auth_totp_mfa_20261016`, created from `auth_hardening_mfa_20261016` before the first code edit.

## Global Constraints

- TOTP: RFC 6238, SHA-1, 6 digits, 30 s period, accept window ±1 step, reject any step `<= lastUsedStep` (replay); `lastUsedStep` updated atomically (conditional `updateMany`).
- Recovery codes: 10 per set, format `xxxx-xxxx` from alphabet `abcdefghjkmnpqrstuvwxyz23456789` (no `i l o 0 1`), stored as SHA-256 hex, compared after removing spaces/dashes and lower-casing; regeneration deletes the old set.
- Secrets: AES-256-GCM, key = SHA-256 of `AUTH_MFA_ENCRYPTION_KEY` (≥ 32 chars), same scheme as `SefSecretService`. Production refuses to start without a valid key. Development without it logs one startup warning; 2FA endpoints answer 503; users without enabled 2FA log in normally; users with enabled 2FA get 503 on login (never bypass an enabled second factor).
- Challenge: `AuthToken` purpose `MFA_CHALLENGE`, `scope` `LOGIN` | `ENROLLMENT`, TTL 5 min, `attempts` max 5 (5th wrong code consumes it). Cookie `law_mfa_challenge`: HttpOnly, `SameSite=Strict`, `Path=/api/auth`, `Secure` in production, maxAge 5 min.
- Email code: `AuthToken` purpose `MFA_EMAIL_CODE`, 6 digits, TTL 10 min, single use; issuing one consumes earlier unused ones of that user; limits 3 per challenge and 5 per hour per user via `AuthRateLimitStore` (keys `mfa-email:challenge:<challengeId>`, `mfa-email:user:<userId>`); endpoint always answers 204. Only for users with enabled TOTP.
- Trusted device: `TrustedDevice` row, random token SHA-256 hashed, 30 days, cookie `law_trusted_device`: HttpOnly, `SameSite=Lax`, `Path=/api/auth`, `Secure` in production, maxAge 30 days.
- Revocation: password reset, password change, 2FA disable and admin 2FA reset revoke all of the user's trusted devices; password reset and admin reset also revoke all sessions. Enabling `mfaRequired` logs nobody out.
- Re-auth: enrollment start (session path), disable, regenerate recovery codes and revoking trusted devices require `currentPassword`.
- Policy: `OrganizationSettings.mfaRequired Boolean @default(false)` for `HARDCODED_WORKSPACE_ID`, read/written only through auth endpoints (Ruling: the financials organization-settings DTO is not touched, keeping auth independent of finance — cost: one extra small admin endpoint). Disable is 409 while it is on.
- Admin endpoints: OWNER/ADMIN of `HARDCODED_WORKSPACE_ID`; reset target must be a workspace member and not the actor.
- Audit event types: `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFY` (outcome + `metadata.method`), `MFA_CHALLENGE_LOCKED`, `MFA_EMAIL_CODE_SENT`, `MFA_RECOVERY_CODES_REGENERATED`, `MFA_RESET_BY_ADMIN`, `TRUSTED_DEVICE_REVOKED`, `MFA_POLICY_CHANGED`. Never put secrets, codes, tokens or recipient emails in audit metadata or logs.
- Rate limiting: `AuthRateLimitGuard` on `/auth/mfa/verify`, `/auth/mfa/email-code`, `/auth/mfa/enrollment/start`, `/auth/mfa/enrollment/confirm`.
- Web: standalone, `inject()`, signals, typed reactive forms, `@if/@for`, Spartan Helm (load `.agents/skills/spartan-ui/SKILL.md`), semantic tokens only, `HlmSpinner` while waiting, SR + EN keys in `apps/web/public/i18n/ser.json` / `eng.json` (flat keys), Serbian Latin copy.
- Auth API unit tests live in `apps/api/src/app/`, run with `npx nx test api --testPathPatterns=<name>`; web tests with `npx nx test web --testPathPatterns=<name>`.

## Review Focus

1. User with enabled 2FA while `AUTH_MFA_ENCRYPTION_KEY` is missing/garbled → login answers 503, never a session without the second factor (Task 4 test).
2. Same TOTP code submitted twice (two tabs, or replay within 30 s) → second is rejected, even under concurrency (Task 2 + Task 4 tests).
3. Challenge cookie from user A presented after A's password but with B's session cookie in the browser, or an `ENROLLMENT` challenge used on `/verify` → rejected; scopes never cross (Task 4/5 tests).
4. Trusted-device cookie of user A presented at login of user B → ignored, B still challenged (Task 6 test).
5. Admin resets their own 2FA, or a user from outside the workspace → 403/404, nothing deleted (Task 8 test).

---

### Task 1: Foundation — dependencies, schema, secret cipher, config

**Files:**
- Modify: `package.json` (add `otpauth`, `qrcode`, dev `@types/qrcode`; run `npm install`)
- Modify: `apps/api/prisma/schema.prisma`; Create: migration `apps/api/prisma/migrations/20261016120000_auth_totp_mfa/migration.sql`
- Create: `libs/api/features/auth/src/lib/mfa/mfa-secret.cipher.ts`
- Modify: `apps/api/src/app/config.validation.ts`, `.env.example`
- Test: `apps/api/src/app/mfa-secret.cipher.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // schema: UserMfa, MfaRecoveryCode, TrustedDevice exactly as spec "Data model";
  // AuthTokenPurpose += MFA_CHALLENGE, MFA_EMAIL_CODE; AuthToken += attempts Int @default(0), scope String?;
  // OrganizationSettings += mfaRequired Boolean @default(false); User gets relations mfa/recoveryCodes/trustedDevices.
  export interface EncryptedSecret { ciphertext: string; iv: string; authTag: string } // base64
  @Injectable() export class MfaSecretCipher {
    get available(): boolean;                 // key present and ≥ 32 chars
    encrypt(plain: string): EncryptedSecret;  // throws ServiceUnavailableException("Two-factor authentication is not configured") when !available
    decrypt(secret: EncryptedSecret): string; // same 503 when !available; tampering → throws Error
  }
  ```
  `MfaSecretCipher` reads `process.env.AUTH_MFA_ENCRYPTION_KEY` (like `AuthRuntimeConfig`), is registered in `AuthModule`, and logs one warning in `onModuleInit` when unavailable outside production.

- [ ] **Step 1: Write failing tests:** `round-trips a secret`; `uses a fresh iv per encryption` (two encryptions differ); `rejects a tampered ciphertext`; `is unavailable and throws 503 without a key or with a short key`; in the existing config validation spec style add `production requires AUTH_MFA_ENCRYPTION_KEY of at least 32 characters`.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns="mfa-secret|config.validation"`. Expected: new tests FAIL (config.validation has one pre-existing unrelated failure).
- [ ] **Step 3: Implement** schema + `npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name auth_totp_mfa --create-only` (rename folder to the timestamp above if needed), `npm run prisma:generate`, the cipher, config validation (production only), `.env.example` entry with a generation hint (`openssl rand -base64 48`).
- [ ] **Step 4: Run** the same tests, then `npm run db:migrate` against local Postgres and `npx tsc -p apps/api/tsconfig.app.json --noEmit`. Expected: PASS, migration applied.
- [ ] **Step 5: Commit** `feat(auth): MFA schema, secret cipher and config`.

### Task 2: Factor primitives — TOTP and recovery codes

**Files:**
- Create: `libs/api/features/auth/src/lib/mfa/totp.ts`, `libs/api/features/auth/src/lib/mfa/recovery-codes.ts`
- Test: `apps/api/src/app/mfa-factors.spec.ts`

**Interfaces:**
- Produces (pure functions, no Nest):
  ```ts
  export function generateTotpSecret(): string;                       // base32, 20 random bytes
  export function totpUri(secret: string, accountEmail: string, issuer: string): string;
  /** Returns the matched time step, or null. Rejects steps <= lastUsedStep. */
  export function verifyTotp(secret: string, code: string, lastUsedStep: bigint | null, now?: Date): bigint | null;
  export function generateRecoveryCodes(): string[];                  // 10 × "xxxx-xxxx"
  export function normalizeRecoveryCode(input: string): string;       // strip spaces/dashes, lower-case
  export function hashRecoveryCode(code: string): string;             // sha256 hex of normalized
  ```

- [ ] **Step 1: Write failing tests** (use `otpauth` to compute expected codes at fixed `now`): `accepts the current code`; `accepts ±1 step and rejects ±2`; `rejects a step at or below lastUsedStep`; `rejects non-6-digit input`; `uri contains issuer, account and SHA1/6/30`; `recovery codes: 10 unique, match /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/`; `normalization: " ABCD-efgh " and "abcdefgh" hash equal`.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=mfa-factors`. Expected: FAIL.
- [ ] **Step 3: Implement** with `otpauth` `TOTP` (`validate({ token, window: 1, timestamp })` returns delta → step = `floor(now/30s) + delta`) and `crypto.randomInt` for recovery codes.
- [ ] **Step 4: Run** same. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): TOTP and recovery code primitives`.

### Task 3: MFA email templates

**Files:**
- Modify: `libs/api/features/auth/src/lib/mail/auth-mail.templates.ts`, `libs/api/features/auth/src/lib/mail/auth-mail.service.ts`
- Test: extend `apps/api/src/app/auth-mail.templates.spec.ts`, `apps/api/src/app/auth-mail.delivery.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // AuthEmailMessage += { template: "mfaEmailCode"; code: string } | { template: "mfaDisabled"; at: string } | { template: "mfaResetByAdmin"; at: string }
  // AuthMailService:
  sendMfaEmailCode(user: { id: string; email: string }, code: string): Promise<void>;
  sendMfaDisabled(user: { id: string; email: string }, at: Date): Promise<void>;
  sendMfaResetByAdmin(user: { id: string; email: string }, at: Date): Promise<void>;
  ```

- [ ] **Step 1: Write failing tests:** SR/EN `mfaEmailCode` contains the code and `10 minuta` / `10 minutes` and "do not share"; `mfaDisabled` and `mfaResetByAdmin` contain the formatted time (label form like `passwordChanged`) and the contact-administrator line; table test extended to 6 templates × 2 locales; delivery spec: each new `send*` enqueues the right message with the user's locale; the warning on enqueue failure never contains the code.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=auth-mail`. Expected: FAIL.
- [ ] **Step 3: Implement** copy entries and the three methods (same layout/escaping as existing templates).
- [ ] **Step 4: Run** same. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): MFA email templates`.

### Task 4: Login challenge and code verification (TOTP, recovery)

**Files:**
- Create: `libs/api/features/auth/src/lib/auth-session.issuer.ts` (moved `createSession` + `toResponse` from `AuthService`)
- Create: `libs/api/features/auth/src/lib/mfa/mfa-challenge.service.ts`, `libs/api/features/auth/src/lib/mfa/mfa-verification.service.ts`, `libs/api/features/auth/src/lib/mfa/mfa.controller.ts`, `libs/api/features/auth/src/lib/mfa/mfa.dto.ts`, `libs/api/features/auth/src/lib/cookies.ts`
- Modify: `auth.service.ts` (`login`), `auth.controller.ts` (`login`), `auth.module.ts`, `auth.guard.ts` (`sessionToken` via `readCookie`), `libs/api/api-interfaces/src/lib/api-interfaces.ts`, `libs/shared/frontend/api-clients/src/lib/api-clients.ts` + `libs/shared/frontend/security/src/lib/security.ts` (unwrap `AUTHENTICATED` so the app keeps working)
- Test: `apps/api/src/app/mfa-login.spec.ts`

**Interfaces:**
- Consumes: `MfaSecretCipher` (T1), `verifyTotp`, `hashRecoveryCode` (T2).
- Produces:
  ```ts
  // @law/api-interfaces
  export type MfaMethod = "TOTP" | "RECOVERY" | "EMAIL";
  export type LoginResponse =
    | { status: "AUTHENTICATED"; session: AuthSessionResponse }
    | { status: "MFA_REQUIRED"; methods: MfaMethod[] }
    | { status: "MFA_ENROLLMENT_REQUIRED" };
  export interface MfaVerifyRequest { method: MfaMethod; code: string; rememberDevice: boolean }
  // cookies.ts
  export const MFA_CHALLENGE_COOKIE = "law_mfa_challenge"; export const TRUSTED_DEVICE_COOKIE = "law_trusted_device";
  export function readCookie(request: Request, name: string): string | undefined;
  // AuthSessionIssuer
  issue(userId: string): Promise<{ token: string; session: AuthSessionResponse }>;
  // MfaChallengeService
  create(userId: string, scope: "LOGIN" | "ENROLLMENT"): Promise<string /* raw token */>;
  find(rawToken: string | undefined, scope: "LOGIN" | "ENROLLMENT"): Promise<{ id: string; userId: string; createdAt: Date }>; // 401 if missing/expired/consumed/wrong scope
  recordFailure(id: string): Promise<{ locked: boolean }>; // attempts+1; at 5 consume + audit MFA_CHALLENGE_LOCKED
  consume(id: string): Promise<void>;
  // AuthService.login(email, password, trustedDeviceToken?: string) → { result: LoginResponse; sessionToken?: string; challengeToken?: string }
  // MfaVerificationService.verify(challengeToken, req: MfaVerifyRequest) → { token: string; session: AuthSessionResponse; userId: string }
  ```
  `trustedDeviceToken` is accepted but ignored until Task 6 (always challenge). `EMAIL` method returns 400 until Task 7.

- [ ] **Step 1: Write failing tests:**
  - `user without 2FA and policy off → AUTHENTICATED with session token`.
  - `user with enabled 2FA → MFA_REQUIRED, methods [TOTP, RECOVERY, EMAIL], challenge created with scope LOGIN, no session`.
  - `policy on and user not enrolled → MFA_ENROLLMENT_REQUIRED, challenge scope ENROLLMENT`.
  - `enabled 2FA but cipher unavailable → 503 and no session` (Review Focus 1).
  - `verify TOTP success consumes challenge, updates lastUsedStep conditionally, issues session, audits MFA_VERIFY method TOTP`.
  - `verify replay: lastUsedStep conditional update count 0 → 401` (Review Focus 2).
  - `verify recovery code consumes exactly that code (consumedAt) and rejects reuse`.
  - `wrong code increments attempts; 5th failure locks (challenge consumed, audit MFA_CHALLENGE_LOCKED, 401)`.
  - `ENROLLMENT challenge on verify → 401` (Review Focus 3).
  - Controller-level (construct controller with mocked services): login sets `law_session` for AUTHENTICATED; sets `law_mfa_challenge` with the cookie options above for the other two; verify clears the challenge cookie and sets `law_session`.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns="mfa-login|auth"`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `POST /auth/mfa/verify` in `MfaController` (`@Controller("auth/mfa")`, `CsrfOriginGuard`, `AuthRateLimitGuard`). Login response body is now `LoginResponse`; web `AuthApiClient.login` returns `LoginResponse` and `AuthState.login` sets the session only for `AUTHENTICATED` (full UI comes in Task 9).
- [ ] **Step 4: Run** the auth tests, `npx nx test web --testPathPatterns=login`, `npx tsc -p apps/api/tsconfig.app.json --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): MFA login challenge and verification`.

### Task 5: Enrollment and self-service

**Files:**
- Create: `libs/api/features/auth/src/lib/mfa/mfa-enrollment.service.ts`
- Modify: `mfa.controller.ts`, `mfa.dto.ts`, `api-interfaces.ts`, `auth.module.ts`
- Test: `apps/api/src/app/mfa-enrollment.spec.ts`

**Interfaces:**
- Consumes: T1–T4 (`MfaChallengeService.find(…, "ENROLLMENT")`, `AuthSessionIssuer.issue`, `AuthMailService.sendMfaDisabled`).
- Produces:
  ```ts
  // @law/api-interfaces
  export interface MfaEnrollmentStartRequest { currentPassword?: string }
  export interface MfaEnrollmentStartResponse { otpauthUrl: string; qrCodeDataUrl: string; secret: string }
  export interface MfaEnrollmentConfirmRequest { code: string }
  export interface MfaEnrollmentConfirmResponse { recoveryCodes: string[]; session?: AuthSessionResponse }
  export interface MfaPasswordRequest { currentPassword: string }
  export interface MfaRecoveryCodesResponse { recoveryCodes: string[] }
  export interface MfaStatusResponse { enabled: boolean; enabledAt: string | null; recoveryCodesRemaining: number; policyRequired: boolean; trustedDevices: TrustedDeviceSummary[] }
  export interface TrustedDeviceSummary { id: string; userAgent: string | null; createdAt: string; lastUsedAt: string | null; expiresAt: string; current: boolean }
  ```
  Routes: `POST enrollment/start`, `POST enrollment/confirm`, `POST disable`, `POST recovery-codes`, `GET ""` (status; `trustedDevices` is `[]` until Task 6).
  A shared private password check helper is extracted from `AuthService` (`verifyPassword`) into `libs/api/features/auth/src/lib/passwords.ts` (`hashPassword`, `verifyPassword`).

- [ ] **Step 1: Write failing tests:**
  - `start via session requires correct currentPassword (401 otherwise)`; `start via ENROLLMENT challenge needs no password`; `start when already enabled → 409`; `start replaces a pending secret` and stores it encrypted only; response has `otpauth://totp/` URL with issuer = office display name (fallback `"Law"`) and a `data:image/png;base64,` QR.
  - `confirm with valid code sets enabledAt, stores 10 hashed recovery codes, returns plaintext codes once, audits MFA_ENROLLED`; `confirm via ENROLLMENT challenge also issues a session and consumes the challenge`; `confirm with wrong code → 401, still pending`.
  - `disable requires password, deletes UserMfa + codes (+ trusted devices once T6 exists), sends mfaDisabled, audits`; `disable while policy on → 409`.
  - `regenerate replaces the set and audits MFA_RECOVERY_CODES_REGENERATED`.
  - `status counts unconsumed codes`.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=mfa-enrollment`. Expected: FAIL.
- [ ] **Step 3: Implement.** QR via `qrcode.toDataURL(otpauthUrl)`. Session-path endpoints use `AuthGuard`; `start`/`confirm` accept either a session or the challenge cookie (session wins when both present).
- [ ] **Step 4: Run** `npx nx test api --testPathPatterns="mfa|auth"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): MFA enrollment and self-service`.

### Task 6: Trusted devices and revocation rules

**Files:**
- Create: `libs/api/features/auth/src/lib/mfa/trusted-device.service.ts`
- Modify: `mfa-verification.service.ts`, `auth.service.ts` (`login`, `resetPassword`, `changePassword`), `mfa-enrollment.service.ts` (`disable`, `status`), `mfa.controller.ts`, `auth.controller.ts`
- Test: `apps/api/src/app/mfa-trusted-device.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // TrustedDeviceService
  create(userId: string, meta: { userAgent?: string; ipAddress?: string }): Promise<string /* raw token */>;
  validFor(userId: string, rawToken: string | undefined): Promise<boolean>; // checks user match, expiry, revokedAt; updates lastUsedAt
  revokeAll(userId: string, client?: Pick<PrismaService, "trustedDevice">): Promise<void>; // pass the tx client inside transactions
  revoke(userId: string, id: string): Promise<void>; // 404 if not the user's
  list(userId: string, currentRawToken?: string): Promise<TrustedDeviceSummary[]>;
  ```
  Routes: `DELETE /auth/mfa/trusted-devices` and `DELETE /auth/mfa/trusted-devices/:id`, both with body `{ currentPassword }`, audit `TRUSTED_DEVICE_REVOKED`; clear the cookie when the current device is revoked.

- [ ] **Step 1: Write failing tests:** `verify with rememberDevice creates a device and returns its token (cookie set by controller with Lax/30 d)`; `login with valid trusted device of the same user → AUTHENTICATED without challenge`; `another user's device token → still MFA_REQUIRED` (Review Focus 4); `expired or revoked device → challenge`; `password reset, password change, disable revoke all devices (inside their transactions)`; `revoke one requires password and only the user's device`; `status lists devices with current flag`.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns="mfa-trusted|auth-password"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test api --testPathPatterns="mfa|auth"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): trusted devices for MFA`.

### Task 7: Email code fallback

**Files:**
- Modify: `mfa-verification.service.ts`, `mfa.controller.ts`
- Test: `apps/api/src/app/mfa-email-code.spec.ts`

**Interfaces:**
- Consumes: `AuthMailService.sendMfaEmailCode` (T3), `AuthRateLimitStore` (existing), `MfaChallengeService` (T4).
- Produces: `POST /auth/mfa/email-code` (204 always) and `method: "EMAIL"` support in `verify`. Code storage: `tokenHash = sha256(`${challengeId}:${code}`)`, so a code is only valid with the challenge it was issued for.

- [ ] **Step 1: Write failing tests:** `issues a 6-digit code, consumes earlier unused ones, enqueues email, audits MFA_EMAIL_CODE_SENT`; `4th request for one challenge → 204 but nothing sent`; `6th request in an hour for one user → 204 but nothing sent`; `no-op (204) for a user without enabled TOTP`; `verify EMAIL accepts the code once within 10 min`; `expired code → 401 and counts as a failed attempt`; `code issued for another challenge → 401`; store failure → 503.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=mfa-email-code`. Expected: FAIL.
- [ ] **Step 3: Implement** (code via `crypto.randomInt(0, 1_000_000)` zero-padded).
- [ ] **Step 4: Run** `npx nx test api --testPathPatterns="mfa|auth"`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): email code fallback for MFA`.

### Task 8: Admin policy, member security list, admin reset

**Files:**
- Create: `libs/api/features/auth/src/lib/mfa/mfa-admin.service.ts`, `libs/api/features/auth/src/lib/mfa/mfa-admin.controller.ts`
- Modify: `auth.module.ts`, `api-interfaces.ts`
- Test: `apps/api/src/app/mfa-admin.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // @law/api-interfaces
  export interface MfaPolicy { mfaRequired: boolean }
  export interface MemberSecuritySummary { userId: string; name: string | null; email: string; role: WorkspaceRole; mfaEnabled: boolean; mfaEnabledAt: string | null }
  ```
  Routes (`@Controller("auth/admin")`, `CsrfOriginGuard` + `AuthGuard`, OWNER/ADMIN check in service): `GET mfa-policy`, `PUT mfa-policy` (audit `MFA_POLICY_CHANGED` with `{ mfaRequired }`), `GET members/security` (active members only), `POST members/:userId/mfa/reset`.

- [ ] **Step 1: Write failing tests:** `MEMBER gets 403 on every admin route`; `policy read defaults to false when no OrganizationSettings row`; `policy write upserts and audits`; `members list returns ACTIVE members of the hardcoded workspace with 2FA flags`; `reset deletes UserMfa, codes, trusted devices, revokes sessions in one transaction, sends mfaResetByAdmin, audits with actor id`; `reset of self → 403`; `reset of non-member → 404` (Review Focus 5).
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=mfa-admin`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx nx test api --testPathPatterns="mfa|auth"` and `npx tsc -p apps/api/tsconfig.app.json --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): MFA policy and admin reset`.

### Task 9: Web — login code step and enrollment page

**Files:**
- Modify: `libs/shared/frontend/api-clients/src/lib/api-clients.ts` (`AuthApiClient`: `verifyMfa`, `sendMfaEmailCode`, `startMfaEnrollment`, `confirmMfaEnrollment`, `mfaStatus`, `disableMfa`, `regenerateRecoveryCodes`, `revokeTrustedDevice(s)`, `getMfaPolicy`, `setMfaPolicy`, `memberSecurity`, `resetMemberMfa`), `libs/shared/frontend/security/src/lib/security.ts` (`AuthState.login` returns `LoginResponse`; `completeLogin(session)`)
- Modify: `apps/web/src/app/auth/login/login.component.ts|html` (code step)
- Create: `apps/web/src/app/auth/mfa/mfa-enrollment.component.ts|html` (shared), `apps/web/src/app/auth/mfa/mfa-setup.component.ts` (route wrapper)
- Modify: `apps/web/src/app/app.routes.ts` (`mfa-setup` under `AuthLayoutComponent`), `apps/web/public/i18n/ser.json`, `eng.json`
- Test: `apps/web/src/app/auth/login/login.component.spec.ts`, `apps/web/src/app/auth/mfa/mfa-enrollment.component.spec.ts`

**Interfaces:**
- Consumes: shared types from T4/T5/T6/T8.
- Produces: `MfaEnrollmentComponent` inputs `mode: "challenge" | "session"`, output `completed: EventEmitter<{ session?: AuthSessionResponse }>`; steps: password (session mode only) → QR + copyable secret + 6-digit confirm → recovery codes with copy, download `.txt` (`law-recovery-codes.txt`) and a required "Sačuvao/la sam kodove" checkbox before Continue.

- [ ] **Step 1: Write failing tests:**
  - login: `MFA_REQUIRED switches to the code step`; `submits TOTP with rememberDevice`; `"Koristi rezervni kod" switches method to RECOVERY and input accepts xxxx-xxxx`; `"Pošalji kod na e-mail" calls sendMfaEmailCode then method EMAIL`; `401 on verify shows invalid-code error; 401 with locked/expired challenge returns to the password step with a notice`; `MFA_ENROLLMENT_REQUIRED navigates to /mfa-setup`.
  - enrollment: `challenge mode skips password step`; `continue disabled until codes saved checkbox ticked`; `download produces the 10 codes`.
- [ ] **Step 2: Run** `npx nx test web --testPathPatterns="login.component|mfa-enrollment"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Code input: `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength` 6 (9 for recovery). Copy (SR): checkbox "Zapamti ovaj uređaj 30 dana", links "Koristi rezervni kod", "Pošalji kod na e-mail"; EN equivalents.
- [ ] **Step 4: Run** same plus `npx nx lint web`. Expected: PASS, no new lint errors.
- [ ] **Step 5: Commit** `feat(web): MFA login step and enrollment`.

### Task 10: Web — Settings → Security

**Files:**
- Create: `apps/web/src/app/features/settings/security-settings.component.ts|html`, `apps/web/src/app/features/settings/member-security.component.ts|html` (admin section)
- Modify: `apps/web/src/app/features/settings/settings.component.ts` (menu item `security`, label `settings.security`, icon `lucideShieldCheck`, after `profile`), `apps/web/src/app/app.routes.ts` (`settings/security`), `profile-settings.component.ts|html` (remove password form; link to Security), i18n files
- Test: `apps/web/src/app/features/settings/security-settings.component.spec.ts`, `member-security.component.spec.ts`

**Interfaces:**
- Consumes: `MfaEnrollmentComponent` (T9, `mode="session"`), `AuthApiClient` methods (T9).
- Produces: Security page sections: 2FA status (enable via enrollment component / regenerate codes / disable with password dialog; disable hidden with explanation when `policyRequired`), trusted devices table (revoke one / all with password dialog), change password (moved form, same behaviour), and for OWNER/ADMIN (`canManageBilling`-style role check) the policy switch "Obavezna dvofaktorska autentifikacija" and the members table with "Resetuj 2FA" behind an alert dialog.

- [ ] **Step 1: Write failing tests:** `shows enable button when disabled and status when enabled`; `disable button hidden with notice when policyRequired`; `revoke-all asks for password then calls API`; `change password form still submits`; `admin section hidden for MEMBER`; `toggling policy calls setMfaPolicy`; `reset asks for confirmation then calls resetMemberMfa and refreshes the list`; `own row has no reset button`.
- [ ] **Step 2: Run** `npx nx test web --testPathPatterns="security-settings|member-security"`. Expected: FAIL.
- [ ] **Step 3: Implement** with Spartan Helm (switch, table, alert dialog, dialog, button, field, spinner).
- [ ] **Step 4: Run** same plus `npx nx test web --testPathPatterns=profile-settings` and `npx nx lint web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): security settings with MFA and member reset`.

### Task 11: End-to-end, docs, track status

**Files:**
- Create: `apps/api-e2e/src/api/auth-mfa.spec.ts`, `apps/web-e2e/src/auth-mfa.spec.ts`
- Modify: `.github/bussiness-logic-done-so-far.md`, `README.md` (`AUTH_MFA_ENCRYPTION_KEY`), this `plan.md`, `metadata.json`, `index.md`, epic `plan.md` / `metadata.json` / `index.md`

- [ ] **Step 1: Write the API e2e** (skipped unless `AUTH_E2E_EMAIL`, `AUTH_E2E_PASSWORD`, `MAILPIT_URL`; reuse `apps/api-e2e/src/support/mailpit.ts`; clear `auth:rl:` ip keys like `auth-email.spec.ts`): login → enroll via session (TOTP from returned secret with `otpauth`) → logout → login gives `MFA_REQUIRED` → verify TOTP with rememberDevice → logout → login with trusted-device cookie gives `AUTHENTICATED` → login without it → recovery code works once → email code from Mailpit works → `finally`: disable 2FA with password so the account is left as found.
- [ ] **Step 2: Write the web e2e** (Playwright, same env gating): enroll through the API in `beforeAll`, then UI login → code step → TOTP → lands on `/`; `afterAll` disables 2FA.
- [ ] **Step 3: Run** with services, migrated DB and a fresh API build on a free port: `npx jest -c apps/api-e2e/jest.config.cts auth-mfa` and `npx nx e2e web-e2e --grep mfa` (or the project's Playwright command). Expected: PASS. Do not stop processes you did not start.
- [ ] **Step 4:** Update docs; tick this plan; child `metadata.json`/`index.md` `completed`; epic: tick remaining lines, status `completed` only if every child is done.
- [ ] **Step 5: Full checks:** `npx nx test api`, `npx nx test web`, `npx nx run-many -t lint -p api api-e2e web web-e2e`. Expected: no new failures versus the pre-existing list in [auth_email_delivery_20261016/plan.md](../auth_email_delivery_20261016/plan.md) Task 6.
- [ ] **Step 6: Commit** `docs(auth): TOTP two-factor authentication done`.
