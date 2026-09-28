# Runtime Config Local Override — Plan

- [x] `runtime-config.ts`: try `/config.local.json`, then fall back to `/config.json`; treat an HTML or invalid response as missing.
- [x] `runtime-config.spec.ts`: local file preferred, fallback without it, dev-server HTML fallback, `config.json` failure still throws.
- [x] README note.

## Verification results

- `npx nx test api-clients`: 6 tests pass (4 new).
- eslint on the changed files is clean.
