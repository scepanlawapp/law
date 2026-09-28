# Spec — Draft Review & Case-Work Missing Fields UX

## Problem

- `BriefResult.missingFields` is a free-form `string[]`. The model mixes schema keys (`plaintiff.address`, `competentCourt`) with invented snake_case (`datum_dostavljanja_resenja`). The draft panel chips, the matter-link card and task titles show them verbatim.
- The draft panel repeats the same gaps three times: LLM warnings ("Placeholder upotrebljen za …"), missing-field chips, and `[UNOS POTREBAN: …]` placeholders in the text. None of them helps the lawyer fill a gap, and Approve / DOCX export are allowed with gaps open.
- Case-work task proposals use raw keys as titles, mix missing data with evidence, preselect nothing, propose evidence that was already uploaded, and carry no due date or priority.

## Goals

1. **Structured missing fields.** `missingFields: { key, label }[]`. `key` is one of a canonical list; `label` is a short Serbian Latin phrase from the model.
   - Keys: `plaintiffName`, `plaintiffAddress`, `plaintiffIdNumber`, `defendantName`, `defendantAddress`, `defendantIdNumber`, `competentCourt`, `claimValue`, `legalBasis`, `factualDescription`, `reliefSought`, `serviceDate`, `contractReference`, `other`.
   - The frontend translates known keys (`assistant.briefField.*`) and falls back to `label` for `other`.
   - Legacy string arrays are normalized on read (alias table + humanized fallback). `BriefExtractionResult.missingFields` becomes `jsonb`.
2. **Structured evidence.** `evidence: { label, provided }[]`; `provided` is true when the document is among the chat attachments.
3. **Draft panel "Za dopunu" checklist**, derived from placeholders in the current text:
   - grouped by label with an occurrence count;
   - "Prikaži" selects the placeholder in the document textarea;
   - inline input + "Upiši" replaces every occurrence of that placeholder;
   - zero state "Svi podaci su popunjeni".
   - Remaining LLM warnings move into a collapsed "Napomene" section.
   - Approved drafts hide Odbij/Odobri.
4. **Guard.** Approve and DOCX export ask for confirmation while placeholders remain.
5. **Task proposals:**
   - action-phrased Serbian titles ("Pribaviti adresu tuženog", "Pribaviti dokaz: …");
   - readable descriptions without internal ids;
   - two groups (missing data, evidence) with "select all"; missing data preselected;
   - provided evidence excluded;
   - default due date +3 working days, `NORMAL` priority;
   - `serviceDate` is `HIGH`, due the next working day, and the description explains that the filing deadline runs from it;
   - editable due date per row; created rows shown as done.
6. **Prompts.** The brief prompt lists allowed keys and requires Serbian labels. The drafting prompt no longer lists placeholders as warnings.

## Out of scope

- Auto-creating calendar `Deadline` rows from extracted dates (the filing deadline length depends on case type).
- Structured (non-string) draft warnings.
