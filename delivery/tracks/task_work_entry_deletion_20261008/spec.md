# Specification

Task work entries are clickable and open the capture modal with their saved data. Place Delete at the lower left; confirm before deleting. Prevent removal of the last linked work entry for any task, with an informational message asking the user to add another first. Enforce this on the API across all deletion paths, including concurrent attempts. Keep existing ownership and billed-entry restrictions; entries that cannot be edited remain viewable. Refresh the task list after edits/deletions; cancellation and errors preserve the entry.
