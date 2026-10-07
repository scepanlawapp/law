# Assistant Capabilities — Specification

## Problem

The assistant can research law, read office data and documents, and propose approval-gated changes, but it drafts only one document: the tužba. That limit is built into every layer:

- **Brief schema:** fixed fields (tužilac, tuženi, court, claim value).
- **Prompts:** both the brief and drafting prompts are written for ZPP lawsuits only.
- **Workflow:** it stops for anything that is not a lawsuit.
- **Tool:** it is named `draft_lawsuit`.
- **Matter link:** the plaintiff always becomes the client.

The target office works mainly on contracts, corporate and media matters, so most of the drafting it needs is not a lawsuit. It also spends time reading contracts and served documents, and it misses deadlines.

## Goals

1. **Drafting by document type.** One registry of document types drives brief extraction, legal grounding, drafting, the matter link and the task proposals. Adding a type means adding a registry entry, not a new pipeline.
2. **Court submissions:** odgovor na tužbu, žalba, predlog za izvršenje, and a general podnesak.
3. **Contracts, letters/notices and corporate acts:**
   - Contracts: ugovor o pružanju usluga, NDA, ugovor o radu, licenca / ustupanje autorskih prava.
   - Letters and notices: opomena pred utuženje, raskid ugovora, odgovor na dopis, zahtev za objavljivanje odgovora/ispravke.
   - Corporate acts: punomoćje, odluka skupštine/direktora.
4. **Contract review:** analyze an uploaded or filed contract for risky and missing clauses, with suggested wording and legal-source citations. It is read-only.
5. **Case summary and timeline:** a chronology of a case's documents in which every event cites its document.
6. **Deadline from document:** classify a served act and compute the remedy deadline with deterministic rules (not the model). Propose it through the existing `create_deadline` confirmation.

## Constraints

- **AI stays optional.** No core workflow depends on the assistant.
- **No record change without approval.** Every draft needs lawyer approval, and every record change is a `PendingAction`.
- **Script.** Stored and prompted text is Serbian Latin.
- **No invention.** The model never invents parties, amounts, dates, or articles. Missing data becomes `[UNOS POTREBAN: …]` placeholders and missing-field items.
- **Existing data keeps working.** Old briefs and drafts (lawsuit shape) must keep rendering and applying.

## Phases

Each phase is a child track with its own spec and plan, created when the phase starts.

| Phase | Track | Status |
|---|---|---|
| 1 | `assistant_drafting_document_types_20261007` | implemented; manual check pending |
| 2 | `assistant_drafting_contracts_letters_20261007` | implemented; manual check pending (type list confirmed 2026-10-07; no house templates) |
| 3 | `assistant_contract_review_20261007` | implemented; manual check pending (checklists built in, review panel and DOCX memo, read-only) |
| 4 | `assistant_case_timeline_20261007` | implemented; manual check pending |
| 5 | `assistant_deadline_from_document_20261007` | implemented; manual check pending |
