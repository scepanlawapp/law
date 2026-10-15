# Revenue Sharing Settings UX

## Goal

Refactor `/finance/settings` into a clear, Serbian-language settings experience using existing Angular and Spartan/UI patterns. Preserve the existing revenue-sharing API, immutable publication flow, member agreements, advanced rules, hypothetical server preview, and historical versions.

## Scope

- Replace the large editor modal with an in-route settings experience.
- Organize current supported settings into human-readable sections and preserve all existing controls.
- Preserve existing frontend contracts and API semantics. A follow-up may correct the revenue-sharing persistence implementation without changing those contracts or the database schema.
- Explicitly mark role-based compensation defaults and fixed monthly compensation as unavailable because the current revenue-sharing contract has no fields for them. Do not repurpose user hourly rates.
- Keep publication and individual/advanced editors within established Spartan/UI interactions.

## Acceptance criteria

- The route loads configuration directly and retains the `/finance/settings/:id` read-only version route.
- Existing edits remain drafts until confirmed publication; existing unsaved-change protection remains active.
- Existing agreement, special-rule, simulator, and history capabilities remain accessible.
- Unsupported role/fixed compensation is not presented as saved or calculated.
- UI text remains localized and uses the installed Spartan controls.
- No API contracts, Prisma models, migrations, or database structure are changed.
