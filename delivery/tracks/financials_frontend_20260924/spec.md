# Financials Frontend Specification

Implement real Angular Financials screens for overview, work review and recorded work, client statements and preview, client balances, and versioned price sources. Use the existing standalone Angular, Signals, reactive forms, localization, semantic-token, and Spartan/UI patterns.

## Boundaries

- All data comes from the authenticated Financials API and existing client/case APIs.
- Amounts remain backend Decimal strings; client arithmetic is presentation-only.
- The UI never presents source clues or AI proposals as approved charges.
- Informational service statements are clearly distinguished from formal external invoices.
- The current backend does not expose an overview unpaid aggregate, payment reversal route, or direct manual-line composer; the UI surfaces those limitations honestly.
