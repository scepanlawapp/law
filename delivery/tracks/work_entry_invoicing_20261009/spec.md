# WorkEntry Invoicing

## Objective

Extend the current WorkEntry-to-InvoiceLine flow so users can import work as separate invoice lines or a grouped line, inspect linked work, and maintain associations while editing a draft invoice. Add an independent nullable value and currency to WorkEntry for future reporting.

## Requirements

- Preserve the existing WorkEntry/InvoiceLine relation and current invoice creation/edit architecture.
- WorkEntry value is nullable, non-negative, independent of InvoiceLine amounts, and never allocated across grouped entries. Currency is a supported ISO code; legacy value/currency remain null. New currency defaults from client billing profile, organization settings, then RSD; explicit user input takes precedence. Require currency when a value is entered.
- Default import mode is SEPARATE; GROUPED creates exactly one line with unique selected work IDs, deterministic title description, earliest work date, and accurate pricing-required state. No implicit currency conversion or partial sums presented as complete pricing.
- Display hydrated WorkEntry details in expandable linked lines and a unique invoice-level linked-work overview derived from line associations.
- Unlink/delete operations preserve WorkEntry records. Deleting linked lines requires confirmation. Draft association changes persist atomically only on successful save; canceled edits preserve persisted draft links.
- Enforce workspace, client, confirmation, treatment/billing eligibility, and uniqueness/availability on the backend. Preserve draft reservation and finalized invoice restrictions.
- Keep invoice VAT/totals, PDF rendering, and work specification behavior correct; grouped work is still billed by one InvoiceLine.
- Localize all added frontend strings in supported languages.

## Out of scope

Payments, per-entry allocation, partial billing, exchange-rate conversion, compensation calculations, and complex grouping editors.
