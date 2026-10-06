# Persistent document folders

Extend the existing Documents workspace with workspace-owned nested folders, direct-child browsing, breadcrumbs, folder picker/import and recursive directory drop. Uploads retain the existing queue, validation, associations, categories, retry/idempotency and single-file version workflow. Logical folders do not change physical storage.

Folders precede paginated documents in list/grid. The list has icon, name, category, linked to, version, size, updated (immutable creation/import time), actions. Fixed table layout constrains content; complete names/links remain available in tooltips. Existing filters, statistics, details and actions remain available. Folder import is atomic, bounded, traversal-safe, retry-safe and workspace-scoped.

Browser directory selection cannot preserve unexposed empty folders; unsupported directory drops provide guidance to use the folder picker.

Follow-up: enlarge only table type icons by 50%; constrain document tooltips and retain separate case/client blocks matching the presented content.
