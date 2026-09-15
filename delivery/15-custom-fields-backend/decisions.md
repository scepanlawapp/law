# Decisions

- Keep the custom-field subsystem additive and compatibility-safe rather than replacing legacy JSON fields immediately.
- Reuse the repository’s existing tenant/workspace validation pattern instead of introducing a separate enforcement layer.
- Treat inactive definitions and options as readable historical data rather than deleting them.
- Keep the first implementation minimal: typed definitions, options, and values plus the small API surface required for dynamic forms.
- Follow the legal-domain data-type list exactly unless an approved repository constraint later narrows it.
