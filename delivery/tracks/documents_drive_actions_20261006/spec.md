# Documents Drive Actions

Documents use page-local multi-selection, separate file/folder counts, and a selection toolbar instead of a final actions column. Single clicks select; double clicks or Enter open folders or file details. Checkboxes support accessible additive selection. Filename cells support inline rename with save/cancel and pending/error states.

Move chooses root or a nested folder in a folders-only modal. Folder moves reject self/descendant destinations. Archive reuses the existing confirmation dialog; archived items remain restorable. Folder operations must be backed by workspace-scoped APIs, not simulated client-side. Files download individually and folders download as streaming ZIPs, bounded to 1,000 folders, 250 files and 1 GiB of source data per ZIP. Grid and list share selection and actions. Associations do not select or open rows. Renaming changes document display titles or logical folder names, not immutable stored version filenames.

No permanent deletion, tenant model changes, unrelated redesign, or destructive browser validation. Existing implementation branch creation is prohibited by the controlling session instruction; changes remain on main.
