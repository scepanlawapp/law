# Specification

## Goal

Make the saved invoice immediately reviewable and provide a polished print view that presents the complete billing statement in an A4-style layout.

## Requirements

- Navigate to the saved statement detail after a successful create or edit operation.
- Add a top-right print action to the statement detail page.
- Open a dedicated authenticated print-view route without the application shell.
- Present available statement, client, address, line, VAT, total, comment, and payment data in an invoice layout inspired by the supplied reference.
- Keep unavailable workspace issuer and banking data in one clearly marked placeholder model until workspace billing settings exist.
- Keep the signature area as an empty line.
- Provide an actual browser-print action and print-specific A4 styling.
- Preserve existing finance statement behavior and dark-theme application styling outside the paper preview.

## Acceptance criteria

- Saving a statement opens `/finance/statements/:id`.
- The detail header exposes a localized `Print statement` action.
- The print action opens `/finance/statements/:id/print`.
- The print view handles loading and failure states, supports returning to detail, and can invoke the browser print dialog.
- The invoice displays all user-entered invoice header fields and all line-level financial fields.
- No signature image or text is rendered above the signature line.
