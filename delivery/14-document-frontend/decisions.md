# Decisions

- Reuse the repo’s existing design system, tabs, form patterns, toasts, and confirm dialogs rather than inventing a separate document UI architecture.
- Keep the Client documents view direct-by-default with an explicit include-matter toggle, matching the legal-domain guidance.
- Deduplicate aggregated rows by document identity rather than filename or upload date.
- Treat document category as a searchable configurable lookup with inline creation, reusing the existing references flow.
- Do not treat client-side hiding of actions as a security boundary; backend authorization remains authoritative.
