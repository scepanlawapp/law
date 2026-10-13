# Implementation plan

- [x] Create track, metadata, index and register delivery link.
- [x] Add shared request/result contracts and validated endpoint.
- [x] Implement read-only scoped context, source precedence, task context and stateless Mastra structured pricing agent.
- [x] Add searchable client-case selector, all-cases option and immutable existing associations.
- [x] Cover validation, access, precedence, edits, partial work and non-persistence with focused tests; run API and web checks.
- [x] Update implemented behavior documentation and finalize track.

## Verification

- API pricing and existing financial service suites: 43 tests passed.
- Case-selector behavior suite: 6 tests passed (pagination, stale response cancellation, source scope, version association, error/retry).
- API TypeScript and Angular template compilation passed.
- Nx web development build passed (sandboxed attempt failed; retry outside sandbox succeeded).
- Targeted ESLint and `git diff --check` passed.
- Local API/web servers were unavailable. Live browser keyboard/theme checks and a real OpenRouter call were not performed; model responses were mocked. Pricing calculations and source applicability remain AI estimates requiring review.
- No schema migration or seed change was needed.
