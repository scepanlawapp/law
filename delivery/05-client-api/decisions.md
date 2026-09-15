# Decisions

## 1. Keep the compatibility-first runtime in place

The repository instructions and migration safety rules require preserving existing data and using an additive path. The Client API should therefore align with the target legal-domain model without deleting or rewriting the current `Client`/`Case` runtime path before migration verification is complete.

## 2. Reuse the repository’s existing service and DTO conventions

The repo already uses service/controller/DTO patterns in the feature modules. The new Client API should follow that structure instead of inventing a second architecture or a new REST style.

## 3. Treat `Client` as a firm relationship, not as the primary identity

The domain specification defines `Client` as the law firm’s relationship with a `Party`. That distinction should drive the API design and avoid duplicating identity fields on the Client record.

## 4. Model organization contact persons through `PartyRelationship`

The repo and legal-domain documents both require organization contact persons to be separate `Party` PERSON records connected by a relationship entity. This is safer and more extensible than embedding contact-person fields directly on `Client`.

## 5. Validate tenant ownership at the data access boundary

Every referenced ID used by the Client API must be checked within the current workspace context before the service proceeds. The repo’s tenant guard pattern and validation approach are the controlling precedent.
