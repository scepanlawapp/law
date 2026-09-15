# Decisions

## 1. Reuse the reference module pattern

The repo already has a working `ReferencesService` and `ReferencesController`, so the lookup API should extend that pattern instead of introducing a separate subsystem or a second API style.

## 2. Deactivate instead of hard-delete

The legal-domain specification and migration safety rules require lookup values to remain readable when historical references exist. Deactivation is the safe default.

## 3. Keep all lookups tenant-scoped

Every list, create, update, and set-active action must be constrained to the active workspace. Cross-tenant access is a hard security failure.

## 4. Keep the addition additive

This phase should not rewrite the existing runtime or destroy legacy data. It should extend the active schema and API carefully in the repo’s compatibility-first style.
