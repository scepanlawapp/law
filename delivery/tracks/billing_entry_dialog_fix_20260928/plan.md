# Billing Entry Dialog Fix Plan

- [x] Inspect the dialog, translations, API contract, and backend validation rules.
- [x] Create and register the delivery track before changing application code.
- [x] Add the missing English and Serbian dialog translations.
- [x] Normalize date-only values and add client-side billing validation.
- [x] Add focused regression coverage.
- [x] Run targeted tests, formatting checks, and the web build.
- [x] Update business-logic documentation and complete the delivery track.

## Verification

- Billing-entry utility Jest spec passed: 1 suite, 6 tests.
- Angular development build and strict template compilation passed.
- Targeted ESLint completed with no errors; the full web lint remains blocked by nine unrelated pre-existing errors in assistant, documents, and sidebar files.
- The running Serbian UI showed translated dialog controls, a normalized candidate date, and translated client-side validation without creating a billing entry.
