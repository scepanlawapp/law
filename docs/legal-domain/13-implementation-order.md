# Recommended Implementation Order — Compact Workflow

Use six larger implementation phases:

| Phase | Purpose |
|---|---|
| 00 | Repository audit and master plan |
| 01 | Core Party/Client/Matter/Proceeding/lookups + safe legacy migration |
| 02 | Shared contracts + NestJS APIs + lookup APIs + search/autocomplete |
| 03 | Angular Client/Matter forms and detail screens + inline lookup creation |
| 04 | Documents + typed custom fields + activity timeline |
| 05 | Security/tenant audit + legacy cleanup + final verification |

Critical sequence:

```text
understand repository
→ change schema and migrate data safely
→ stabilize backend contracts
→ migrate frontend
→ add document/extensibility/audit layer
→ security audit and cleanup
```

Do not merge Phase 00 into implementation.

Do not remove legacy storage/runtime structures before migration verification.

Before each next phase, review the current `delivery/.../changes.md`, `verification.md`, and blocking `open-questions.md`.
