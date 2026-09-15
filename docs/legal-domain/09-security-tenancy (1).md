# Security, Tenancy, and Authorization

## Tenant isolation

All firm-owned data must be scoped to the authenticated tenant/firm.

Never trust:

```text
firm_id
tenant_id
organization_id
```

from the browser as the authority for ownership.

Resolve tenancy from authenticated server context according to the existing repository architecture.

## Cross-tenant references

For every incoming foreign/reference ID, verify ownership and permission.

Examples:

- Client attached to Matter;
- Party attached as participant;
- contact person relationship;
- PracticeArea / Stage / Role lookup;
- User assigned as responsible;
- Document linked to Client/Matter/Proceeding;
- custom-field referenced entity;
- custom-field definition;
- Proceeding linked to Matter.

A syntactically valid UUID/ID is not sufficient.

## IDOR prevention

Detail, update, archive, and relationship endpoints must query within the current tenant and current authorization scope.

Do not:

1. load an object globally by ID;
2. then assume it belongs to the current firm.

Prefer tenant-scoped repository/service access from the start.

## Search leakage

Autocomplete and global search are security-sensitive.

They must not reveal:

- names;
- emails;
- phones;
- identifiers;
- filenames;
- matter titles;

from another tenant.

## Documents

Document access and linking requires:

- same tenant;
- authorized user;
- authorized target entity;
- storage access consistent with current permissions.

A document belonging to tenant A must never be linkable to tenant B's Matter even if its ID is known.

## Sensitive values

Identifiers may contain sensitive personal/business information.

Do not log entire sensitive identifier values in normal application logs unless the repository already has an explicit secure policy requiring it.

Activity events should avoid storing unnecessary secret/sensitive snapshots.

## Security tests

Add negative tests for cross-tenant access and assignment, especially:

- Client → Matter;
- Party → MatterParticipant;
- PartyRelationship;
- Document links;
- lookup IDs;
- custom-field references;
- autocomplete.
