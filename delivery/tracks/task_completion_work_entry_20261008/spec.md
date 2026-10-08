# Specification

Task completion from the shared work view (drag/drop, status selection, completion action) and task editor must open quick capture before changing status. Prefill title, description, client and case. Cancellation preserves the previous task status and writes nothing. Confirmation saves the source-linked work entry and task completion atomically, preserves one entry per task, and allows optional duration. Existing completed tasks can be edited without prompting again. New tasks selected as DONE also require capture.
