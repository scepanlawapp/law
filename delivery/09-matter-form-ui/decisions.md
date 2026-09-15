# Decisions

- Reuse the existing Matter API and DTO contract rather than inventing a new Matter client abstraction.
- Keep the current compatibility-first architecture: the repo’s legacy `Client`/`Case` runtime remains intact while the legal-domain `Matter` model is additive.
- Treat `PracticeArea`, `Stage`, and other configurable values as lookup data served by the existing `ReferencesService` pattern.
- Treat the backend as authoritative for `DRAFT`/`OPEN` lifecycle validation instead of duplicating business rules in the browser.
- Keep the UX scoped to the create/edit form and not a broad matter management redesign.
- Defer explicit primary Client UI until product approval because it materially impacts the user workflow and contract.
