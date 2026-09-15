# Decisions

## Matter numbering

Matter numbers use a calendar-year sequence formatted as `YYYY-NNNNN`, allocated when a Draft Matter is opened. The existing tenant counter and unique workspace/internal-number constraint back the allocator.

## Lookup and lifecycle permissions

All active workspace members may manage valid configurable lookups and perform valid Matter lifecycle actions. The service still enforces tenant scope, valid references, and state-transition rules.

## Legacy compatibility

Legacy Case/Client shared contracts and frontend API-client wrappers remain in place until Phase 03 replaces their consumers. New legal contracts use `Legal*` names where necessary to avoid collisions with those exports.

## Tenant provisioning compatibility

The reverted TenantRegistryService state was preserved. Phase 02 API services do not restore that change or trust browser tenant identifiers. New-tenant lookup seeding parity remains a Phase 01 infrastructure follow-up because the current provisioning path does not visibly pass workspace ownership to the provisioner.
