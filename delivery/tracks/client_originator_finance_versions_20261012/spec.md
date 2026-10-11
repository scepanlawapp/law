# Specification

Record the optional lawyer who brought a client to the office independently from the responsible lawyer. Show the field below responsible lawyer in create/edit dialogs and beside it in the detail summary.

Rename company Other settings to Case numeration. Replace finance settings with a paginated version table, creation dialog using the existing configuration editor, and a read-only version detail page with a breadcrumb back to the list. Preserve permissions, localization and immutable version history. Provide workspace-scoped pagination and version-by-id API reads.

On client creation, default the referring lawyer to the signed-in user. Editing preserves the saved value (including no referring lawyer); delayed session loading must not overwrite an explicit selection or clearing.
