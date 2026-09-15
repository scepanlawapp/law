# Open Questions

1. Before Phase 01 backfill design, inspect deployed tenant databases to determine whether any Client/Case/Document data exists outside the current checkout.
2. Confirm whether the empty `apps/api/prisma/tenant-migrations/20260913000000_clients_cases/` directory represents an unapplied artifact, an intentionally removed implementation, or a zero-data baseline.
3. Resolve exact meanings of any legacy court, judge, external-reference, contact, address, tag, and custom-field values before mapping them to Proceeding or typed domain records.
4. Decide whether the recovered legal-domain filenames should be normalized to the prompt's unsuffixed names in a separate documentation maintenance change.
5. Confirm whether any non-chat stored files must be migrated into the future general Document model.
