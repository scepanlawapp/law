# Spec

## Why

- Demos need a realistic, Serbian-language office: eight personas with profiles, one organization, many clients and cases, and a dense calendar, task list and time log for September and October 2026.
- Users enter a retainer's monthly fee as a net amount (bez PDV-a). The month-end run took its VAT rate from billing settings (`WorkspaceConfig.defaultVatRate`), ignoring the organization tax settings, so fee lines could end up with 0% VAT (gross = fee), which looks like the fee was treated as gross.

## What

### Users (`seed-second-user.cjs`)

- Upsert all eight personas (Bojana Stojković … Stefan Stefanović) with name, username, phone, gender, job title and workspace role. Existing passwords are kept.
- Each persona gets `UserSettings` (theme, accent, finish, language SR, 24h, Europe/Belgrade).

### Demo data (`seed-demo-data-stojkovic.cjs`)

- `OrganizationSettings` for "Advokatska kancelarija Stojković i partneri", VAT registered at 20%, bank account, `WorkspaceConfig` with 20% VAT.
- Service categories, user hourly rates, client billing profiles.
- Clients (individuals and organizations, varied statuses), cases (all statuses, priorities).
- Events of every type and status (SCHEDULED / COMPLETED / CANCELLED), dense for September and October 2026.
- Tasks in every status and priority, deadlines.
- Work entries in every status (RUNNING, PROPOSED, CONFIRMED, BILLED, WRITTEN_OFF), treatment and source.
- Retainer agreements (with overage rules and covered categories).
- Invoices (DRAFT, SENT, VOIDED) with consistent net/VAT/gross lines linked to billed work entries.

### Retainer VAT fix

- The month-end run uses the organization VAT: 0% when the organization is not VAT registered, otherwise `OrganizationSettings.defaultVatRate`, falling back to `WorkspaceConfig.defaultVatRate`.
- The monthly-fee labels say the amount is excluding VAT.
