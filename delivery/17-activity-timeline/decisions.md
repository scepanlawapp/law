# Decisions

- Reuse the repository’s existing tenant-audit pattern as the base for domain activity events rather than inventing a separate event architecture.
- Keep event payloads minimal and business-readable; avoid full object snapshots or unnecessary sensitive data.
- Treat the backend as the source of truth for all timeline entries and keep the frontend as a rendering layer only.
- Start with the minimal legal-domain event set required for Client and Matter timelines and expand only when the product requires it.
- Keep the first implementation tenant-scoped and compatibility-safe, with additive schema changes only.
