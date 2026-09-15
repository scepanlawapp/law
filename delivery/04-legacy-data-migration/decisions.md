# Decisions

- Maintain the legacy `Client` and `Case` tables as the compatibility source until migration verification is complete.
- Use the additive legal-domain Party/Matter model as the migration target rather than rewriting working runtime code.
- Do not invent placeholder values for missing identity or proceeding fields; ambiguous rows are documented and left unmigrated.
- Migrate `Proceeding` records only when the source clearly represents a formal proceeding, and keep authority or judge metadata nullable unless a reliable source exists.
- Preserve `workspaceId`-scoped ownership in every migration step and reject cross-tenant data in verification checks.
