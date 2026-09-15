# Phase 19 — Security and tenant audit

## Context to add manually

Attach/reference all prior `verification.md` files that mention security/tenant limitations, plus the repository's auth/permission middleware/policies.

## Read before planning

- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/12-definition-of-done.md`

## Objective

Audit the completed Client/Matter/Party/Proceeding/Document/lookup/custom-field implementation for IDOR, cross-tenant reference assignment, and authorization gaps.

## Mandatory Plan-mode protocol

You are working in **Plan mode first**.

Before proposing implementation details:

1. Read the repository-wide instructions in `.github/copilot-instructions.md`.
2. Read the specification files listed above.
3. Read the prior delivery artifacts referenced in `Context to add manually`.
4. Inspect the relevant repository code, migrations, tests, configuration, API conventions, and UI components.
5. Prefer repository facts over assumptions.
6. Ask me for any information that is genuinely needed and cannot be reliably determined from the repository.
7. If no blocking information is needed, explicitly write: `No blocking questions.`
8. Produce a concrete plan before modifying application code.

Your plan must include:

- repository findings relevant to this phase;
- exact scope and non-scope;
- expected files/modules to change;
- database/migration impact;
- API/contract impact;
- frontend impact when applicable;
- compatibility and data-safety risks;
- test/verification strategy;
- any decisions that require my approval.

Do not modify application code while the plan is awaiting approval.

## Delivery tracking — mandatory

This phase owns:

```text
delivery/19-security-tenant-audit/
```

Maintain:

```text
plan.md
changes.md
decisions.md
verification.md
open-questions.md
```

If Plan mode cannot write repository files, include the exact proposed content for `plan.md` in your plan response and create/update the delivery files immediately when execution begins.

During implementation:

- keep `changes.md` synchronized with actual changes;
- record durable decisions and deviations in `decisions.md`;
- record exact checks actually run in `verification.md`;
- put unresolved or deferred items in `open-questions.md`;
- write `None.` when there are no open questions.

Never claim that a check passed if you did not run it.

## Tasks

1. Review every new detail/update/archive endpoint for tenant-scoped loading.
2. Review Client↔Party and organization contact-person relationships.
3. Review MatterClient and MatterParticipant assignment.
4. Review Proceeding ownership.
5. Review configurable lookup IDs.
6. Review Document access/linking.
7. Review custom-field definitions, options, and referenced values.
8. Review autocomplete/search for information leakage.
9. Add negative integration tests for representative cross-tenant attacks.
10. Fix security defects within this domain; do not use this phase for unrelated general application refactors.
11. Record any permission model decisions that require product-owner confirmation.

## Constraints

- Reuse the existing stack and conventions unless there is a documented reason not to.
- Preserve tenant isolation and authorization.
- Preserve existing data.
- Avoid destructive migrations.
- Do not invent placeholder business data.
- Do not refactor unrelated modules.
- Add/update tests for important rules introduced in this phase.
- Stop and ask if a newly discovered issue would materially change the approved product behavior.

## Completion gate

Phase is complete only when known cross-tenant/IDOR defects in the new domain are fixed or explicitly block completion.

At the end, summarize the phase and point me to all files under `delivery/19-security-tenant-audit/`.
