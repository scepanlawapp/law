# SEF DEMO outgoing invoices

This integration sends an existing ordinary outgoing invoice to the SEF DEMO environment. It does not replace the local invoice send action and never changes the local invoice, line, or linked-work-entry status after a DEMO upload.

## Configuration

1. Set `ORGANIZATION_SECRETS_KEY` to at least 32 random characters. Keep this value stable: changing it makes the stored API key undecryptable.
2. In organization settings, complete the legal name, nine-digit PIB, eight-digit registration number, Serbian address, VAT settings, tax defaults, and an active RSD bank account. Store the DEMO API key through the existing API-key control and enable SEF with environment `DEMO`.
3. Complete the recipient's tax and registration identifiers and exactly one usable billing/primary address. The client form records public-sector classification and JBKJS explicitly; public-sector/CIR submission is blocked in v1.
4. Every invoice line must contain an explicit supported tax category. Exempt lines also require an exemption code and legal-basis text. Select the VAT-liability timing code for invoices containing standard VAT.

The new-invoice composer copies configured payment term, issue place, payment method, country code, currency, note, VAT rate, and VAT-liability timing into the draft. Tax-category and exemption fields are intentionally not exposed or sent by the composer; their assignment belongs to backend policy. The edit composer applies header defaults only where a saved draft still has no value. Supplier identity and postal data are not copied into each invoice: SEF preparation reads their current values directly from organization settings and freezes them in the immutable submission snapshot.

The backend requires `xmllint` from libxml2. Set `SEF_XMLLINT_PATH` only if it is not on `PATH`. The build copies the bundled OASIS UBL 2.1 schema tree from `apps/api/src/assets/sef` to `dist/apps/api/assets/sef`; startup environments and future API images must include the executable. Missing assets or executable produce a validation error, never a false success.

## Validation and submission

From the existing invoice detail screen:

1. **Validate for SEF** performs business checks, builds server-side XML, and validates it against the bundled UBL 2.1 Invoice XSD. It requires no API key and makes no SEF request.
2. **Download UBL** returns the locally validated XML. After remote creation, it always returns the immutable stored bytes.
3. **Send to DEMO SEF** uses a persisted idempotency key, stores the exact XML and source snapshot, and invokes the DEMO upload endpoint once. The request uses `executeValidation=true`, `sendToCir=No`, and multipart field `ublFile`.
4. **Refresh status** reads the outgoing invoice by the stored Sales Invoice ID. Upload success remains `SUBMITTED` even when this initial read fails; the remote status remains unknown until a later refresh succeeds.

`PREPARED`, `SENDING`, `SUBMITTED`, and `UNKNOWN` attempts make the invoice immutable. Editing, deleting, local sending, and voiding are blocked. The existing void operation is not a SEF cancellation/storno; that workflow is not implemented.

## Supported v1 mapping

- Ordinary domestic B2B Invoice (`InvoiceTypeCode` 380), RSD only.
- UBL 2.1 Serbian customization `urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022`.
- One service unit per stored invoice line (`H87`), with the stored net line amount as unit price.
- Standard VAT categories `S10` and `S20`, explicitly mapped to UBL category `S` at 10% or 20%.
- Zero-rate/exemption categories `Z`, `E`, `R`, `O`, and `OE`, only with an explicit code and explanation.
- Mixed categories/rates, grouped by category, rate, exemption code, and exemption text.
- VAT timing codes `35` (supply), `3` (issue), and `432` (advance-payment/cash-accounting rule), as applicable.
- Bank transfer (`PaymentMeansCode` 30) using an explicit or unambiguous active RSD account.

All fiscal amounts use `Prisma.Decimal`, round half-up to two decimals, and must agree at line and document level. Passing local checks does not guarantee SEF acceptance. Local profile validation consists of the UBL XSD plus implemented Serbian-profile business rules; no official executable Serbian Schematron package was located and none is claimed.

## Deliberately unsupported

Production, public-sector/CIR recipients, foreign recipients/currencies, advance invoices, credit/debit notes, attachments, fiscal-invoice references, cancellation/storno, and tax categories outside the mapping above are blocked before upload. Do not bypass these checks by editing XML; the API never accepts client-supplied XML, request IDs, remote IDs, workspace IDs, or API keys.

## UNKNOWN and restart recovery

`UNKNOWN` means a document may already exist remotely. Do not make a new invoice attempt or request ID. Preserve the record and XML, inspect the DEMO portal using the stored invoice number/request evidence, and reconcile manually before any future recovery implementation. A stale `SENDING` record becomes `UNKNOWN` after 15 minutes and is not automatically retried. A stale `PREPARED` record may be claimed because no network request has started. Confirmed failures may create a later revision while the failed record remains in history.

## Verification and source baseline

Automated tests validate a mixed-tax XML with Serbian text and XML metacharacters against the bundled XSD, monetary inconsistencies and unsupported public-sector data, precision-safe int64 parsing, the documented multipart request, no upload retry after an ambiguous network failure, one upload claim under concurrent idempotent requests, and immutable stored XML retrieval.

The mapping baseline is the SEF Internal Technical Instructions dated 1 October 2026 and the official UBL examples/tax-category material available during implementation. The documented API contract was verified from official published material, but no DEMO key was available in the repository and no live DEMO upload was performed. The current public portal advertises `demoefaktura.mfin.gov.rs`, while the required API base for this v1 is the older documented `https://efakturadev.mfin.gov.rs`; actual reachability and response fixtures remain unverified. Keep production blocked and re-confirm the DEMO API hostname before a real test.

Run focused checks with:

```bash
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test api --runInBand --testPathPatterns='(financials.service|sef-.*).spec.ts'
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test web --runInBand --testPathPatterns=invoice-form.spec.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx build api --configuration=development
npx ngc -p apps/web/tsconfig.app.json
```

For a real DEMO smoke test, use only a secure local DEMO key and valid DEMO issuer/recipient records. Validate and download first, then send exactly once and refresh. Never use a production key for this version.

The adapter smoke test is deliberately skipped unless all three variables are supplied. It performs a real upload, so use a unique invoice in the provided XML:

```bash
RUN_SEF_DEMO_INTEGRATION=1 \
SEF_DEMO_API_KEY='<demo-key>' \
SEF_DEMO_UBL_FILE='/absolute/path/to/validated-demo-invoice.xml' \
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test api --runInBand --testPathPatterns=sef-api.client.spec.ts
```
