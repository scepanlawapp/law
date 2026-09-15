# Open Questions

1. Approve the Matter internal-number display format and implement the transactional allocator in the API phase.
2. Confirm whether the full ActivityEvent table belongs in Phase 01 or Phase 04; this Phase 01 slice preserves row-level audit metadata only.
3. Inspect any remote/deployed tenant databases before production migration; the local zero-legacy result cannot be generalized automatically.
4. Add migration/provisioner parity tests before declaring tenant provisioning complete for all future environments.
