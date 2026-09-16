# Client Identity and Addresses Specification

> **Source PRD:** [Phase 1 development scope](../../../.github/develop-phase1.md)

## Scope

Extend the existing tenant-scoped Client backend. The change covers Prisma models, tenant migrations and provisioning, NestJS DTOs and APIs, shared contracts, and focused verification. Frontend form implementation is intentionally excluded.

## Requirements

- Add `isDomestic` to Client. It is non-nullable and defaults to `true`.
- Add nullable string fields `jmbg`, `taxNumber`, and `registrationNumber`.
- `taxNumber` and `registrationNumber` are intended for organizations, but the backend does not enforce client type.
- Add repeatable identification documents with `id`, `type`, `number`, `issuedDate`, `expiredDate`, and `country`.
- Identification document type and number are strings. Document numbers are not unique and do not produce duplicate warnings or blocking.
- Clients have repeatable structured addresses. Address `addressType` is an arbitrary backend string defined by the frontend.
- Address street, city, postal code, and country are required. `streetAdditional`, `stateOrRegion`, and `note` are optional.
- `isPrimary` identifies the single primary address. Multiple addresses with the same `addressType` are allowed.
- Remove `Client.primaryAddressId`; `ClientAddress.isPrimary` is the sole source of truth.
- JMBG, PIB, and registration number are not role-restricted by this feature.

## Exclusions

Citizenship collections, trading names, registration countries, foreign identifier collections, identifier-format validation, banking, law-office payment accounts, invoicing, contact-person websites, and frontend forms are excluded.

## Compatibility

Existing clients receive `isDomestic = true`. Existing address enum values are converted to string `addressType` values. Existing null address components are backfilled before required database constraints are applied. Existing primary-address data is retained through `ClientAddress.isPrimary` while the redundant client pointer is removed.

## Acceptance criteria

- Existing tenant data can be migrated without losing clients or addresses.
- New tenant provisioning creates the same client, address, and identification-document shape.
- Client CRUD persists the new scalar fields and defaults `isDomestic` correctly.
- Identification documents can be listed, created, updated, and removed within the authenticated workspace.
- Address CRUD accepts arbitrary address types, requires the four required components, permits repeated types, and maintains one primary address per client.
- Shared contracts describe the new response/request data without requiring frontend form changes.
