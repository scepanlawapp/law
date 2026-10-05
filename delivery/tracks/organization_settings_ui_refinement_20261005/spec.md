# Organization Settings UI Refinement Specification

## Goal

Make workspace organization settings clearer and safer to configure by exposing an unambiguous active tab, explaining invoice-number variables and precision controls, and limiting currency choices to supported enum values.

## Requirements

- Mark the active workspace settings navigation tab visibly and accessibly.
- Keep available invoice-number variables directly after the pattern field in a vertical section, and explain what each variable produces.
- Rename the preview to “Trenutni izgled broja fakture” in Serbian and improve pattern guidance with concrete examples.
- Present the bank-transfer payment method as “Virman” in Serbian.
- Replace free-form default and allowed currency inputs with installed Spartan/UI select controls backed by the existing `CurrencyCode` options.
- Translate exchange-rate source values instead of displaying stored enum identifiers.
- Explain exchange-rate precision and amount precision, and stack the two controls vertically.

## Constraints

- Preserve stored enum values and existing organization-settings API contracts.
- Use typed reactive forms, installed Spartan/UI APIs, semantic theme tokens, and existing localization utilities.
- Do not expand the supported currency set or change backend invoicing behavior.
