# Finance Retainer Agreement Management — Specification

**Track:** `retainer_agreement_creation_20261009` · **Type:** fix · **Parent:** none

## Goal

Make retainer agreement creation and editing discoverable on Finance → Retainers. A manager selects an active client to create an agreement or opens a listed retainer in the existing `RetainerAgreementDialogService` edit mode. Usage refreshes for the currently selected month after a successful save.

## Constraints

- Reuse the existing agreement dialog and `BillingSetupApiClient` behavior; add no new form or API.
- Finance usage rows contain only an agreement ID and client data. For edits, load `BillingSetupApiClient.listRetainers(clientId)`, match the agreement ID, and pass the full agreement to the dialog.
- Do not refresh on cancel or failed saves.
- Preserve existing usage sorting, month filtering, authorization, and loading/error behavior.
- Restrict create and edit controls to roles that can manage billing.
- Provide translated, accessible client-selection and create/edit controls, including visible loading and localized errors for edit lookup failures.

## Acceptance criteria

- A clear create action is visible to users who can manage billing.
- It is disabled until active clients are loaded and a client is selected.
- Activating it opens the agreement dialog with the selected `clientId` and `agreement: null`.
- A non-null saved result reloads the current usage month; dismissal does not.
- Each manager-visible row has an edit action that loads the matching full agreement for that client before opening the dialog.
- A successful edit refreshes the selected month; dismissal does not. Missing agreements and lookup/dialog failures show a localized error without opening an incomplete record.
- Users without billing-management permission do not see row edit actions.
- Native number inputs may produce numeric values; positive-rate validation and request normalization accept them without changing billing defaults.
