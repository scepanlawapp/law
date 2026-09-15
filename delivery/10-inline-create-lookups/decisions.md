# Decisions

- Reuse the existing `ReferencesController` and `ReferencesService` pattern instead of introducing a separate lookup subsystem.
- Keep the inline-create pattern minimal and repository-native; avoid building a huge generic lookup editor abstraction.
- Use the backend as the source of truth for duplicate validation, permissions, and lookup creation behavior.
- Keep lookup values tenant-scoped, deactivated instead of deleted, and consistent with the current compatibility-first architecture.
- Defer broad admin/editor UX for lookup management until after this shared create pattern proves useful in the actual forms.
