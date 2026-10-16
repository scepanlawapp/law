# Plan — Pre-launch Security Audit

Finding numbers refer to [report.md](report.md).

## Audit

- [x] Review auth, sessions, MFA, CSRF and rate limiting
- [x] Review controller guards and service role checks
- [x] Review uploads, downloads and file storage
- [x] Review raw SQL, process execution and frontend HTML sinks
- [x] Review assistant tools, pending actions and markdown rendering
- [x] Review configuration validation, seeds and local infra
- [x] Run `npm audit --omit=dev`
- [x] Write [report.md](report.md) and register the track

## Remediation — must fix before go-live

- [ ] 1. Require ADMIN for organization-settings writes; add role tests
- [ ] 2. Configure `trust proxy` by hop count from env
- [ ] 3. Add multer `fileSize`/`files` limits to chat uploads
- [ ] 4. Strip or same-origin-restrict images in assistant markdown
- [ ] 5. Reject `replace-with` placeholders in production config and seeds
- [ ] 6. Upgrade vulnerable dependencies; replace `xlsx` 0.18.5; add audit to CI
- [ ] 7. Add security headers / CSP (helmet or proxy); require https origin in production

## Remediation — should fix

- [ ] 8. Fix "clear conversation history" (missing workspace guard) with a test
- [ ] 9. Require `Origin`/`Sec-Fetch-Site` on state-changing requests
- [ ] 11. Make `xmllint` validation asynchronous
- [ ] 12. Constant-time login for unknown emails

## Decisions

- [ ] 10. Workspace visibility and who may approve assistant actions
- [ ] 13. Production infra credentials, Redis auth, closed ports
- [ ] 14. LLM provider data retention and DPA

## Docs

- [ ] Update `.github/bussiness-logic-done-so-far.md` when behavior changes land
