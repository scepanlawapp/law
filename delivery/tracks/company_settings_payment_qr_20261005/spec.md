# Company Settings and Invoice Payment QR Specification

## Goal

Keep user notification and regional preferences on the Workspace settings page, move organization/invoicing configuration to a dedicated Company settings page, and optionally render a standards-compliant payment QR code on invoices.

## Settings navigation

- `/settings/workspace` directly contains notification preferences and regional preferences without organization tabs.
- `/settings/company` is a routed settings layout containing Company, Tax, SEF, Numbering, Payments, Currencies, Invoice defaults, and Payment QR tabs.
- Existing organization-settings forms retain their APIs and behavior after the route move.

## Payment QR configuration

- Payment QR configuration belongs to the existing workspace-scoped `OrganizationSettings` aggregate and defaults to disabled for backward compatibility.
- Store enablement, standard, selected existing bank-account id, purpose template, optional reference model, and optional reference template.
- Initially support the Serbian NBS IPS QR payment standard. Do not duplicate recipient identity, address, account number, invoice amount, currency, customer, invoice number, or due date.
- Enabling QR requires an active RSD bank account with a valid Serbian domestic account number, a configured company name, a supported standard, and a non-empty purpose template. Reference model and template must be configured together.

## Payload and rendering

- A reusable Angular `InvoicePaymentQrService` interpolates supported invoice variables, validates runtime invoice/settings/account compatibility, and constructs the NBS IPS textual payload.
- NBS IPS payloads use the prescribed mandatory tags, an 18-digit domestic recipient account, RSD amount with decimal comma, payment code 221, optional purpose, and optional model/reference.
- Model `00` uses the interpolated reference directly; model `97` calculates the MOD 97 control number from a numeric interpolated reference.
- Invalid or incomplete configuration returns no payload, so no QR is rendered.
- `angularx-qrcode` only renders the final payload in the invoice print view and contains no payment-formatting logic.

## Template variables

Purpose and reference templates support `{{invoiceNumber}}`, `{{customerName}}`, `{{amount}}`, `{{currency}}`, and `{{dueDate}}` through a reusable interpolation helper.

## Exclusions

- Generic QR generation, payment execution, NBS network validation, foreign-currency QR standards, or account/IBAN duplication.
- Changes to invoice totals, numbering, or bank-account ownership.
