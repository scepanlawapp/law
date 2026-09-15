# Decisions

- Reuse the additive Matter model and current backend contract instead of inventing a parallel workspace abstraction.
- Treat the detail screen as a compact workspace summary with tabs rather than a giant edit form.
- Keep the Matter detail screen compatible with the repo’s existing Angular and Spartan patterns.
- Use the backend as the source of truth for status, client membership, and participant/proceeding authorization.
- Keep document/activity sections conservative and empty-aware until the backend contract for those sections is fully available.
