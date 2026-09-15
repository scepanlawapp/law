# Decisions

## 1. Keep the legacy Case table as the compatibility source

The repo still depends on the current Client/Case runtime, and the instructions require additive schema changes rather than destructive replacements. This phase therefore builds a separate Matter foundation alongside the existing tables.

## 2. Reuse the existing lookup pattern

The repo already has a narrow but consistent reference system. That pattern is the right base for MatterStage, ParticipantRole, and ProceedingType instead of inventing a second lookup architecture.

## 3. Keep proceeding detail nullable in V1

The legal-domain spec allows transitional text fields for authority and judge when the repo does not yet have a source-of-truth directory. That keeps the initial model compatible without forcing unverified assumptions.

## 4. Keep the public API additive

The implementation starts with the minimum backend foundation needed to prove the model shape and validation rules without forcing the entire product to cut over to a full Matter API in this phase.
