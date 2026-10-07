# Assistant Drafting Document Types — Specification

## What

- **Registry.** A document-type registry (`@law/brief-extraction`, `document-types.ts`). It lives in the lowest AI layer because `@law/drafting` and `@law/legal-grounding` already depend on `@law/brief-extraction`. Each type defines:
  - its party roles, and which role is the office's client by default
  - Serbian labels (nominative and genitive) for tasks and prompts
  - its type-specific fields, each with a label and a task title
  - the ordered sections of the document
  - the legal frame
  - grounding queries
- **Generic brief (v2):** `{ documentType, parties[{ role, name, address, idNumber }], fields[{ key, value }], legalBasis, factualDescription, evidence, missingFields, confidence, warnings }`.
  - Stored v1 lawsuit briefs (`plaintiff`/`defendant`/`competentCourt`/`claimValue`/`reliefSought`) are normalized to v2 on read. No data migration is needed.
- **Prompts.** The brief and drafting system prompts are built from the type definition. The placeholder, citation and no-invention rules are unchanged.
- **Agent tool.** `draft_document { documentType, note?, documentRefs? }` replaces `draft_lawsuit`.
  - `documentRefs` (`doc:<id>`) brings in filed workspace documents, such as the judgment for an appeal.
  - The agent asks when the type is unclear.
- **Persistence.** `BriefExtractionResult.documentType` and `DraftResult.documentType` are strings validated in code against the registry, defaulting to `LAWSUIT` (migration `20261007090000_draft_document_type`). The draft API returns `documentType`.
- **Types.** `BriefResult` is the shared contract type (not `z.infer`), because the API compiles without `strictNullChecks` and would otherwise see every field as optional.
- **Matter link.**
  - The client is the type's default client party. The lawyer can switch to any other party in the preview (`POST …/briefs/:briefId/preview` with `{ clientRole }`).
  - The opposing party is the first other party.
  - Missing-field task titles come from the registry, falling back to `Pribaviti podatak: {label}`.
- **UI.**
  - The draft review panel shows the document type.
  - The Case-work pane shows parties by role, with a client-party switch.
  - Missing-field labels translate known keys and otherwise show the model's label.
  - New starter cards cover odgovor na tužbu, žalba and predlog za izvršenje.

## Types in this track

| id | Label | Client role (default) | Other party |
|---|---|---|---|
| `LAWSUIT` | Tužba | tužilac (`plaintiff`) | tuženi (`defendant`) |
| `STATEMENT_OF_DEFENCE` | Odgovor na tužbu | tuženi (`defendant`) | tužilac (`plaintiff`) |
| `APPEAL` | Žalba | žalilac (`appellant`) | protivna strana (`opponent`) |
| `ENFORCEMENT_MOTION` | Predlog za izvršenje | izvršni poverilac (`creditor`) | izvršni dužnik (`debtor`) |
| `SUBMISSION` | Podnesak | podnosilac (`submitter`) | protivna strana (`opponent`) |

## Why

The office needs more than lawsuits. The registry makes each later type (Phase 2 in the epic) a data change instead of a pipeline change.

## Out of scope

- Contracts, letters and corporate acts (Phase 2).
- Analysis tools (Phases 3–5).
- Creating organization clients from the brief. The existing create path stays individual-only.
