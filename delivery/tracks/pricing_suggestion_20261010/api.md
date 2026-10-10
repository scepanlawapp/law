# Pricing Suggestion API

`POST /api/work-entries/pricing-suggestion`, authenticated active OWNER/ADMIN only. Existing CSRF/origin guards apply. Response is HTTP 200 for suggestion/review outcomes and has `Cache-Control: no-store`; malformed requests return 400, unauthenticated requests 401 and unauthorized requests 403/404.

## Requests

Saved work (recorded value is not treated as a pricing rule):

```json
{ "kind": "SAVED", "workEntryId": "11111111-1111-4111-8111-111111111111", "pricingFacts": { "claimValue": "100000", "claimCurrency": "RSD", "proceedingType": "Parnicni postupak", "legalAction": "Sastavljanje tuzbe", "representedParties": 1 } }
```

Unsaved work:

```json
{ "kind": "UNSAVED", "work": { "title": "Sastavljanje tuzbe", "description": "Tuzba za isplatu duga", "workDate": "2026-10-10", "clientId": "22222222-2222-4222-8222-222222222222" }, "pricingFacts": { "claimValue": "100000", "claimCurrency": "RSD", "proceedingType": "Parnicni postupak", "legalAction": "Sastavljanje tuzbe", "representedParties": 1 } }
```

Optional pricingFacts: claimValue (decimal string), claimCurrency, proceedingType, legalAction, representedParties, quantity, hearingMinutes and notes. Use notes for additional rule-specific facts. Supply missing facts on the same endpoint; nothing is retained between calls. Saved requests cannot override the record, but can supply pricingFacts. Unsaved work permits title, description, workDate, clientId, caseId, minutes and serviceCategoryId; all references are workspace-validated.

## Outcomes

Schematic response for a fictional evidenced rule of 100 points at 50 RSD per point (not a statement of the actual Serbian tariff):

```json
{
  "status": "SUGGESTED",
  "suggestedPrice": "5000.00",
  "currency": "RSD",
  "explanation": "Vrednost rada prema navedenom pravilu.",
  "reviewRequired": true,
  "confidence": "EVIDENCE_BACKED_SUGGESTION",
  "calculation": { "formula": "points * pointValue", "operands": { "base": "100", "unitValue": "50" }, "rounding": "ROUND_HALF_UP, 2 decimal places; final amount only" },
  "sources": [{ "id": "chunk-id", "sourceId": "source-id", "versionId": "version-id", "version": null, "kind": "LEGAL_TARIFF", "title": "Tarifa", "reference": "Tarifni broj 1", "sourceUrl": "https://example.invalid/tarifa", "effectiveFrom": "2026-01-01", "effectiveTo": null, "excerpt": "Naknada 100 bodova. Vrednost boda 50 RSD.", "dateExcerpt": "Primenjuje se od 1.1.2026." }],
  "missingInformation": [],
  "warnings": ["LAWYER_REVIEW_REQUIRED", "WORK_VALUE_NOT_ADDITIONAL_CHARGE"],
  "alternatives": []
}
```

The actual service includes supported candidates in alternatives, including when a single primary suggestion exists. Conflicting supported prices produce NEEDS_REVIEW, a null primary price, and alternatives with separate evidence and calculations. Zero is a known decimal amount, never an unknown placeholder.

Missing-fact outcome example:

```json
{ "status": "NEEDS_INFORMATION", "suggestedPrice": null, "currency": null, "explanation": "Nedostaje vrednost spora.", "reviewRequired": true, "confidence": "UNDETERMINED", "calculation": null, "sources": [], "missingInformation": [{ "key": "claimValue", "label": "Vrednost spora", "type": "DECIMAL", "reason": "Tarifni raspon zavisi od vrednosti spora." }], "warnings": ["LAWYER_REVIEW_REQUIRED", "WORK_VALUE_NOT_ADDITIONAL_CHARGE"], "alternatives": [] }
```

## Supported arithmetic and evidence

- Fixed amounts, hourly rate times minutes/60, tariff points times point value, claim-value percentages, explicitly evidenced positive percentage increases, quantity multipliers and explicit monetary minimum/maximum limits.
- Exact excerpts must belong to authorized retrieved sources. Numeric operands must occur in the cited excerpt or equal submitted facts. Currency must be explicitly evidenced; Serbian dinar/euro names are recognized. Final rounding is decimal HALF_UP to two places. Supported currencies: RSD, EUR, USD, CHF, GBP, CAD and AUD; there is no conversion or tax computation.
- Price-source effective dates control date applicability. Missing dates require exact numeric applicability-date text from the same source version. A publication or retrieval date alone is insufficient. Multiple candidate versions remain a review outcome, not an invented newest-version policy.
- Evidence checks verify excerpt identity and arithmetic, not the legal correctness of an AI-selected tariff item or band. Every result is a lawyer-reviewable suggestion, not an automatically approved or guaranteed price.

## Limits and privacy

- Complex legal formulas, implied discounts, multi-stage compounding, nonnumeric effective-date clauses, dates derived from publication, unsupported currency precision and uncertain applicability do not produce a precise primary amount.
- Missing facts are returned with key/label/type/reason; unsupported formulas are distinct from missing information and unreliable evidence. There is no complete tariff engine or historical agreement reconstruction.
- Mutable client hourly profiles and retainers are context only unless an independently evidenced applicable valuation rule exists. Retainer coverage does not make work value zero. No usage allocation or additionalCharge is calculated.
- Context is bounded to 20 pricing versions, 12 search hits, 6 applicability clauses, 12,000 characters per source and 48,000 source characters total. Truncated/incomplete context produces review warnings. Semantic retrieval is not exhaustive.
- Model interpretation has a 20-second cancellable deadline. Tariff retrieval precedes that deadline and relies on the existing embedding provider's timeout behavior. Search/model outages produce review outcomes without logging content.
- Sources, requests, responses and tool calls are not written or traced by this path; no queue, invoice, earnings or mutation services are invoked. Authentication and workspace guards remain unchanged. OpenRouter/model/embedding provider retention must be verified operationally; local nonpersistence cannot guarantee provider nonretention.

## Existing workflows

Invoice import prefers compatible recorded WorkEntry.value; month-end billing does not load it. Retainer usage selects one agreement per month while billing allocates each applicable agreement. These differences are documented but unchanged by this feature. Existing manual WorkEntry saving remains the sole way to persist a final value; no acceptance endpoint is added.

Quick capture shows Suggest price for OWNER/ADMIN on editable work, disabled for NON_BILLABLE. It sends current unsaved form data (including edits to existing work), locks value/currency, blocks Save during processing, and becomes Cancel request with loading feedback. Cancellation/error leaves money unchanged and unlocks fields; pricing-input changes cancel stale requests. A supported primary suggestion populates value/currency without saving. Explanations, formulas, operands and versioned source excerpts are displayed for review; alternatives/missing facts do not automatically overwrite money. Closing the dialog unsubscribes HTTP; backend interpretation may continue until its existing timeout.
