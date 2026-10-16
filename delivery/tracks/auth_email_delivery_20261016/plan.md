# Auth Email Delivery and Reset Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localized, queued, retried auth email testable locally in Mailpit, plus hardened password reset/change and Redis-backed auth rate limits.

**Architecture:** Everything stays in `libs/api/features/auth`. Pure template functions render `{ subject, html, text }`; `AuthMailService` becomes a producer that resolves locale and office name and enqueues onto a new BullMQ queue `auth-mail`; `AuthMailProcessor` renders and sends through an injected nodemailer transport. Rate limiting goes through an `AuthRateLimitStore` port backed by Redis.

**Tech Stack:** NestJS, Prisma, BullMQ (`@nestjs/bullmq`), ioredis, nodemailer, Jest 30 (`apps/api`), `apps/api-e2e` (axios), Mailpit.

**Spec:** [spec.md](spec.md)

**Branch:** `auth_email_delivery_20261016`, created from `auth_hardening_mfa_20261016` before the first code edit.

## Global Constraints

- No Prisma schema change and no migration in this track (`AuditEvent.eventType` is a free string).
- Locales: `SR` (Serbian Latin, default) and `EN`, from `UserSettings.language`; invitations always `SR`; no `UserSettings` row → `SR`.
- Office name: `OrganizationSettings.displayName ?? legalName` for `HARDCODED_WORKSPACE_ID`, fallback `"Law"`.
- Links use `AuthRuntimeConfig.frontendOrigin`: `/accept-invitation?token=…`, `/reset-password?token=…` (unchanged paths).
- Queue `auth-mail`: `attempts: 5`, `backoff: { type: "exponential", delay: 5000 }`, `removeOnComplete: true`, `removeOnFail: { age: 3600 }`.
- Never log a token or a full link. Logs may contain template id and recipient user id only.
- Rate limits: per IP+path 5 per 60 s (unchanged values); forgot-password per normalized email 3 per hour. Redis key prefix `auth:rl:`.
- Redis failure in the rate-limit path → `503 Service Unavailable` (fail closed).
- Public responses of forgot-password never vary with account existence, throttling, or delivery.
- Audit event types added: `EMAIL_DELIVERY_FAILED`, `PASSWORD_RESET_THROTTLED`.
- Auth unit tests live in `apps/api/src/app/` (import from `@law/auth`), run with `npx nx test api --testPathPatterns=<name>`.

## Review Focus

1. Office name or user-supplied data containing `<`, `&`, `"` → HTML part is escaped, text part is literal (Task 2 test).
2. A reset link requested earlier must stop working after any successful reset or password change, not only after a newer request (Task 4 test).
3. SMTP down when the user clicks "forgot password" → API still returns the normal success; job retries; final failure audited without token (Task 3 test).
4. `Foo@Example.com ` and `foo@example.com` share one per-email throttle bucket (Task 5 test).
5. Redis unreachable → login/forgot-password answer 503, never let requests through unlimited and never 500 (Task 5 test).

---

### Task 1: Mailpit for local development

**Files:**
- Modify: `infra/docker/compose.yml`
- Modify: `.env.example` (SMTP block, ~line 52)
- Modify: `README.md` (run/services section)

- [ ] **Step 1:** Add service `mailpit` (`image: axllent/mailpit`, ports `"1025:1025"` and `"8025:8025"`, healthcheck `["CMD", "/mailpit", "readyz"]`) to `infra/docker/compose.yml`.
- [ ] **Step 2:** Above `SMTP_HOST` in `.env.example`, add a comment: defaults target Mailpit from `npm run services:up`; inbox at `http://localhost:8025`. Add `MAILPIT_URL=http://localhost:8025` (used only by api-e2e).
- [ ] **Step 3:** README: one line in the services list and one short "Testing email locally" paragraph.
- [ ] **Step 4: Verify.** Run `npm run services:up && curl -s http://localhost:8025/api/v1/info`. Expected: JSON containing `"Version"`.
- [ ] **Step 5: Commit** `chore(auth): add Mailpit for local email testing`.

### Task 2: Localized auth email templates

**Files:**
- Create: `libs/api/features/auth/src/lib/mail/auth-mail.templates.ts`
- Modify: `libs/api/features/auth/src/index.ts` (export the module)
- Test: `apps/api/src/app/auth-mail.templates.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AuthEmailLocale = "SR" | "EN";
  export type AuthEmailMessage =
    | { template: "invitation"; link: string }
    | { template: "passwordReset"; link: string }
    | { template: "passwordChanged"; changedAt: string /* ISO */ };
  export interface RenderedEmail { subject: string; html: string; text: string }
  export function renderAuthEmail(
    message: AuthEmailMessage,
    context: { locale: AuthEmailLocale; officeName: string },
  ): RenderedEmail;
  ```
  The MFA track later extends `AuthEmailMessage` with more variants.

- [ ] **Step 1: Write failing tests** in `auth-mail.templates.spec.ts`:
  - `renders invitation in Serbian`: SR subject contains `Poziv` and office name; `text` and `html` both contain the link.
  - `renders password reset in English`: subject contains `Reset your password`; text contains link and `30 minutes`.
  - `renders password reset in Serbian`: text contains `30 minuta`.
  - `password changed mentions time and what to do`: SR text contains the formatted time (`sr-Latn-RS`, `Europe/Belgrade`) and `administrator`; EN text contains `If this wasn't you`.
  - `escapes HTML but not text`: officeName `A&B <Advokati>` → `html` contains `A&amp;B &lt;Advokati&gt;` and not `<Advokati>`; `text` contains `A&B <Advokati>`.
  - `every template × locale yields non-empty subject/html/text` (table test over 3 templates × 2 locales).
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=auth-mail.templates`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `renderAuthEmail` as a copy table keyed by template and locale plus a private `escapeHtml(value: string): string` and one shared inline-styled HTML layout (heading, paragraph(s), optional button link, footer with office name). Dates use `Intl.DateTimeFormat(locale === "SR" ? "sr-Latn-RS" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Belgrade" })`. Serbian copy is Latin script.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): localized auth email templates`.

### Task 3: Queued delivery through `auth-mail`

**Files:**
- Create: `libs/api/features/auth/src/lib/mail/auth-mail.queue.ts` (constants, payload type, job options)
- Create: `libs/api/features/auth/src/lib/mail/auth-mail.transport.ts` (provider token + factory)
- Create: `libs/api/features/auth/src/lib/mail/auth-mail.processor.ts`
- Modify: `libs/api/features/auth/src/lib/mail.service.ts` → move to `mail/auth-mail.service.ts`, rewrite as producer
- Modify: `libs/api/features/auth/src/lib/auth.module.ts` (import `QueueRootModule`, `BullModule.registerQueue({ name: AUTH_MAIL_QUEUE })`, add providers)
- Modify: `libs/api/features/auth/src/lib/auth.service.ts` (call sites)
- Test: `apps/api/src/app/auth-mail.delivery.spec.ts`

**Interfaces:**
- Consumes: `renderAuthEmail`, `AuthEmailMessage`, `AuthEmailLocale` (Task 2).
- Produces:
  ```ts
  export const AUTH_MAIL_QUEUE = "auth-mail";
  export interface AuthMailJob {
    to: string; userId: string | null;
    locale: AuthEmailLocale; officeName: string;
    message: AuthEmailMessage;
  }
  export const AUTH_MAIL_TRANSPORT = Symbol("AUTH_MAIL_TRANSPORT"); // nodemailer Transporter
  // AuthMailService
  sendInvitation(email: string, token: string): Promise<void>;
  sendPasswordReset(user: { id: string; email: string }, token: string): Promise<void>;
  sendPasswordChanged(user: { id: string; email: string }, changedAt: Date): Promise<void>;
  // protected for MFA track reuse:
  enqueue(to: string, userId: string | null, message: AuthEmailMessage, localeOverride?: AuthEmailLocale): Promise<void>;
  ```

- [ ] **Step 1: Write failing tests** in `auth-mail.delivery.spec.ts` (Prisma and Queue as jest mocks, `AuthRuntimeConfig` real):
  - `enqueues password reset with the user's language`: `userSettings.findUnique` → `{ language: "EN" }`, org settings → `{ displayName: "AK Test" }`; expect `queue.add("send", { to, userId, locale: "EN", officeName: "AK Test", message: { template: "passwordReset", link: "http://localhost:4200/reset-password?token=t%2B1" } }, AUTH_MAIL_JOB_OPTIONS)`.
  - `defaults to Serbian and office fallback`: no settings rows → `locale: "SR"`, `officeName: "Law"`.
  - `invitation is always Serbian`: user settings `EN` → job locale `SR`.
  - `enqueue failure does not throw`: `queue.add` rejects → `sendPasswordReset` resolves; logger warning does not contain the token.
  - `processor renders and sends`: `process(job)` calls `transport.sendMail` with `{ from: config.smtpFrom, to, subject, html, text }` from `renderAuthEmail`.
  - `processor rethrows send errors` (so BullMQ retries).
  - `final failure is audited without the token`: `onFailed(job with attemptsMade 5, opts.attempts 5)` → `auditEvent.create({ data: { eventType: "EMAIL_DELIVERY_FAILED", outcome: "FAILURE", userId, metadata: { template: "passwordReset" } } })`; with `attemptsMade 2` → no audit.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=auth-mail.delivery`. Expected: FAIL.
- [ ] **Step 3: Implement** the four files. Transport factory builds the nodemailer transporter from `AuthRuntimeConfig` (same options as today's constructor). Processor extends `WorkerHost`, `@Processor(AUTH_MAIL_QUEUE)`, failure handler via `@OnWorkerEvent("failed")` following `document-ingestion.processor.ts`. Update `AuthService` call sites: `sendPasswordReset(user, token)`; invitation unchanged signature. Remove the old `mail.service.ts`.
- [ ] **Step 4: Run** the same command, then `npx nx test api --testPathPatterns=auth`. Expected: PASS (including existing `auth.guard.spec.ts`).
- [ ] **Step 5: Manual check.** `npm run services:up && npm run api:serve`, `curl -X POST localhost:3001/api/auth/password/forgot -H 'Origin: http://localhost:4200' -H 'Content-Type: application/json' -d '{"email":"<seeded user>"}'` → email visible in Mailpit with HTML and text parts.
- [ ] **Step 6: Commit** `feat(auth): queue auth email through auth-mail with retries`.

### Task 4: Reset and password-change hardening

**Files:**
- Modify: `libs/api/features/auth/src/lib/auth.service.ts` (`requestPasswordReset`, `resetPassword`, `changePassword`)
- Test: `apps/api/src/app/auth-password.service.spec.ts`

**Interfaces:**
- Consumes: `AuthMailService.sendPasswordReset`, `sendPasswordChanged` (Task 3).
- Produces: private `consumeOpenResetTokens(userId: string)` returning a Prisma `authToken.updateMany` operation usable inside `$transaction([...])`; `changePassword` signature unchanged.

- [ ] **Step 1: Write failing tests** (Prisma mock with `$transaction` executing the array/callback):
  - `new reset request consumes earlier open reset tokens`: expect `authToken.updateMany({ where: { userId, purpose: "PASSWORD_RESET", consumedAt: null }, data: { consumedAt: expect.any(Date) } })` in the same `$transaction` as `authToken.create`.
  - `reset consumes every open reset token and notifies`: `resetPassword` transaction includes the `updateMany` above and `sendPasswordChanged` is called with the user.
  - `change password revokes other sessions but keeps the current one`: expect `authSession.updateMany({ where: { userId, revokedAt: null, id: { not: currentSessionId } }, data: { revokedAt: expect.any(Date) } })`.
  - `change password consumes open reset tokens and notifies`.
  - `wrong current password changes nothing`: rejects `UnauthorizedException`; no `user.update`, no `updateMany`, no email.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns=auth-password`. Expected: FAIL.
- [ ] **Step 3: Implement.** `changePassword` uses `sessionForToken` (needs the session id) and one `$transaction` for password update + session revoke + token consumption; email and audit after commit.
- [ ] **Step 4: Run** same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): invalidate reset links and other sessions on password change`.

### Task 5: Redis-backed rate limiting and per-email reset throttle

**Files:**
- Create: `libs/api/features/auth/src/lib/rate-limit.store.ts`
- Modify: `libs/api/features/auth/src/lib/rate-limit.guard.ts`
- Modify: `libs/api/features/auth/src/lib/auth.service.ts` (`requestPasswordReset`)
- Modify: `libs/api/features/auth/src/lib/auth.module.ts`, `src/index.ts`
- Modify: `apps/api/src/app/auth.guard.spec.ts` (rate-limit test becomes async with a fake store)
- Test: `apps/api/src/app/auth-rate-limit.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export abstract class AuthRateLimitStore {
    /** Increments `auth:rl:${key}`; sets TTL on first hit; returns the count in the current window. */
    abstract hit(key: string, windowMs: number): Promise<number>;
  }
  export class RedisAuthRateLimitStore extends AuthRateLimitStore {} // ioredis MULTI INCR + PEXPIRE NX
  export class InMemoryAuthRateLimitStore extends AuthRateLimitStore {} // exported for tests
  // AuthRateLimitGuard.canActivate(context): Promise<boolean>
  ```
  Redis client: provider inside the auth module, `new Redis(REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })`, closed in `onModuleDestroy`.

- [ ] **Step 1: Write failing tests:**
  - `allows five attempts then 429` (guard + `InMemoryAuthRateLimitStore`), key `ip:${ip}:${path}`.
  - `separate paths and IPs have separate buckets`.
  - `store failure answers 503`: store `hit` rejects → `ServiceUnavailableException`.
  - `fourth reset request in an hour is throttled silently`: `requestPasswordReset` × 4 for `"Foo@Example.com "` then `"foo@example.com"` mixes → 3 tokens created, 3 emails, 4th resolves, audits `PASSWORD_RESET_THROTTLED`, no token, no email.
  - `throttle applies to unknown emails without revealing anything`: unknown email × 4 → resolves each time; no audit with userId.
  - Update the existing `auth.guard.spec.ts` rate-limit test to `await guard.canActivate` with an in-memory store.
- [ ] **Step 2: Run** `npx nx test api --testPathPatterns="auth-rate-limit|auth.guard"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Per-email throttle key `pwreset-email:${normalizeEmail(email)}`, limit 3, window 3_600_000 ms, checked before the user lookup.
- [ ] **Step 4: Run** same command plus `npx nx test api --testPathPatterns=auth`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): Redis rate limits and per-email reset throttle`.

### Task 6: End-to-end check, docs, track status

**Files:**
- Create: `apps/api-e2e/src/api/auth-email.spec.ts`
- Create: `apps/api-e2e/src/support/mailpit.ts`
- Modify: `README.md` (production email: provider via `SMTP_*`, SPF/DKIM/DMARC, `SMTP_FROM` on the sending domain)
- Modify: `.github/bussiness-logic-done-so-far.md` (Authentication and account security section)
- Modify: this `plan.md`, `metadata.json` (status), epic `plan.md`

**Interfaces:**
- Produces (`mailpit.ts`): `clearMailbox(): Promise<void>` (`DELETE /api/v1/messages`), `waitForMessages(to: string, count: number, timeoutMs = 10_000): Promise<Array<{ ID: string; Subject: string }>>` (polls `GET /api/v1/search?query=to:<email>`), `messageText(id: string): Promise<string>` (`GET /api/v1/message/{id}` → `Text`).

- [ ] **Step 1: Write the e2e test** `password reset via Mailpit`, skipped unless `AUTH_E2E_EMAIL`, `AUTH_E2E_PASSWORD`, `MAILPIT_URL` are set. Before: clear mailbox and `DEL auth:rl:pwreset-email:<email>` via ioredis. Then: forgot-password twice → 2 messages; extract `token` from each text; reset with the first → 401; reset with the second to `AUTH_E2E_PASSWORD` → 2xx; login → 200; a third message (password changed) arrives.
- [ ] **Step 2: Run** with services, API and seeded user: `npx nx e2e api-e2e --testPathPatterns=auth-email`. Expected: PASS.
- [ ] **Step 3:** Update docs listed above; tick this plan; set `metadata.json` `status: "completed"`, `updated_at`.
- [ ] **Step 4: Full checks:** `npx nx lint api api-e2e` and `npx nx test api`. Expected: no errors.
- [ ] **Step 5: Commit** `docs(auth): email delivery and reset hardening done` and push `auth_email_delivery_20261016`.
