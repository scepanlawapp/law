# Legal Domain Specification

This directory is the durable product/domain specification for the Client, Matter, Proceeding, Document, configurable lookup, custom-field, and activity modules.

It is intentionally technology-neutral. The existing repository decides concrete implementation details such as class names, ORM syntax, database types, routing style, DTO patterns, frontend state management, and UI component APIs.

## Reading order

1. `01-product-principles.md`
2. `02-domain-map.md`
3. `03-party-client.md`
4. `04-matter-proceeding.md`
5. `05-documents.md`
6. `06-lookups-custom-fields.md`
7. `07-frontend-ux.md`
8. `08-api-search.md`
9. `09-security-tenancy.md`
10. `10-migration-data-safety.md`
11. `11-activity-audit.md`
12. `12-definition-of-done.md`
13. `13-implementation-order.md`

## Authority

When an existing implementation conflicts with these documents:

- preserve data first;
- preserve security and tenant isolation;
- identify the conflict during Plan mode;
- prefer a staged migration instead of a destructive rewrite;
- ask the user when the conflict represents a genuine product decision rather than a technical adaptation.

Repository-specific conventions still take precedence for implementation mechanics unless they contradict the required domain behavior.
