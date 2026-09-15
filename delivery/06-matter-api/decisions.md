# Decisions

## 1. Keep the additive Matter model in place

The repository instructions and migration safety rules require preserving the current runtime and using an additive path. The Matter API should therefore align with the legal-domain model without rewriting the active legacy `Client`/`Case` schema before the migration gate is complete.

## 2. Reuse the repository’s current service and DTO conventions

The repo already has a Matter service and DTO pattern, and the API should follow those conventions rather than introducing a new architecture or a competing API style.

## 3. Preserve the repository’s numbering and validation conventions

The existing Matter service uses `DomainCounter` and explicit lifecycle validation. Those repo-specific patterns should remain the precedent for the new backend implementation.

## 4. Keep participants generic and role-based

The legal-domain specification requires a generic `MatterParticipant` model with a separate role table, rather than a special-case `OppositeParty` model. This should drive the service and contract design.

## 5. Treat proceedings as a separate model

Proceedings are a distinct first-class entity in the target model and should not be collapsed into a single matter field or a legacy single-proceeding assumption.
