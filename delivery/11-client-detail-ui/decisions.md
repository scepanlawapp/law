# Decisions

- Reuse the current Client API and detail component structure instead of creating a parallel client detail model.
- Keep the detail page compact and tabbed rather than turning it into a giant edit form.
- Treat the organization contact person as a relationship-backed concept, not a flat field on the Client record.
- Keep document/activity sections conservative: display only what the actual backend contract exposes and do not invent mock persistence.
- Prefer concise empty/error/loading states over blank sections.
