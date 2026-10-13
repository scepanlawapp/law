# Work price suggestions

Add a searchable case choice after the client on Finance / Price sources. All cases means a client agreement; a specific case means a case override. Existing source versions retain their association.

Provide POST /financials/price-suggestion with a workEvent snapshot (work-entry capture fields, optional existing work-entry id, optional additional information and task completion fraction). Submitted values are authoritative, including unsaved creation forms. Return suggestedPrice (nullable when unsupported), currency, explanation, reviewRequired=true, confidence (LOW/MEDIUM/HIGH), missingInformation, warnings and verified sources.

Build workspace-scoped context from effective retainers, case prices, client agreements/profile, office catalog and public reference versions, in that priority. Include task scope and related work to prevent pricing one partial activity as an entire task. Use recorded duration in minutes. Keep retainer allocation distinct from additional billing; never suggest the whole monthly fee for one entry or silently convert currencies.

Use a standalone Mastra agent with structured output and no memory, storage, tools, conversation, job, tracing database or audit writes. Request context and result exist only for the request. AI remains optional and never updates work value automatically. Permit finance managers and lawyers, enforce own-entry access for lawyers.

## API example

```json
{
  "workEvent": {
    "clientId": "33333333-3333-4333-a333-333333333333",
    "caseId": "44444444-4444-4444-a444-444444444444",
    "title": "Priprema dela ugovora",
    "workDate": "2026-10-13",
    "minutes": 30,
    "currency": "RSD",
    "additionalInformation": "Provera jednog člana; nije završen ceo ugovor.",
    "taskCompletionFraction": 0.1
  }
}
```

`workEvent.id`, if provided, identifies a WorkEntry, not a calendar Event. `eventId` is the calendar link. A full form snapshot is required for both create and edit. Existing price-source associations are immutable when adding versions. The work-entry modal suggestion button is outside this API request's scope.
