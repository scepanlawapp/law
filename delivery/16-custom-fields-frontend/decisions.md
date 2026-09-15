# Decisions

- Reuse the repo’s current Angular reactive form pattern instead of introducing a separate custom-form system.
- Treat Matter create/edit as the first approved integration point unless repository readiness shows Client first is materially better.
- Keep the backend authoritative for all validation and type enforcement.
- Use a single shared dynamic renderer with typed mappings per field family instead of hard-coded per-field components.
- Preserve inactive historical options for rendering while preventing them from being used as new selections unless still valid.
