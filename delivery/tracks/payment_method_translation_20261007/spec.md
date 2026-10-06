# Invoice Payment Method Localization Specification

## Goal

Display the existing localized labels for known organization payment-method enum values on invoices rather than exposing values such as `BANK_TRANSFER` to users.

## Behavior

- Recognized payment methods (`BANK_TRANSFER`, `CASH`, `CARD`, and `OTHER`) use the existing `settings.organization.payment.methods.*` translations.
- New invoice defaults and existing draft values display as localized labels.
- Invoice detail and print views localize recognized enum values.
- Custom free-text payment descriptions remain unchanged.
- Persisted/API values and settings enum values are not replaced with translation keys.
