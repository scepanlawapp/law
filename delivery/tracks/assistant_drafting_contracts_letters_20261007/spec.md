# Assistant Drafting: Contracts, Letters, Corporate Acts — Specification

## What

New entries in the `@law/brief-extraction` document-type registry. The owner confirmed this list on 2026-10-07. The office has no house templates, so drafts use standard wording that the lawyer edits in review.

| id | Label | Family | Parties (client default first) | Legal frame |
|---|---|---|---|---|
| `SERVICES_CONTRACT` | Ugovor o pružanju usluga | CONTRACT | naručilac, pružalac usluga | ZOO (ugovor o delu) |
| `NDA` | Ugovor o poverljivosti | CONTRACT | strana koja otkriva informacije, strana koja prima informacije | ZOO, Zakon o zaštiti poslovne tajne |
| `EMPLOYMENT_CONTRACT` | Ugovor o radu | CONTRACT | poslodavac, zaposleni | Zakon o radu (obavezni elementi ugovora o radu) |
| `COPYRIGHT_LICENCE` | Ugovor o licenci / ustupanju autorskih prava | CONTRACT | sticalac prava, autor / nosilac prava | Zakon o autorskom i srodnim pravima, ZOO |
| `DEMAND_LETTER` | Opomena pred utuženje | LETTER | poverilac, dužnik | ZOO (docnja), Zakon o zateznoj kamati |
| `TERMINATION_NOTICE` | Izjava o raskidu ugovora | LETTER | strana koja raskida, druga ugovorna strana | ZOO (raskid ugovora), the contract itself |
| `MEDIA_REPLY_REQUEST` | Zahtev za objavljivanje odgovora / ispravke | LETTER | podnosilac zahteva, medij (glavni urednik) | Zakon o javnom informisanju i medijima |
| `POWER_OF_ATTORNEY` | Punomoćje | CORPORATE | vlastodavac, punomoćnik | ZOO (punomoćje), ZPP for court authority |
| `CORPORATE_DECISION` | Odluka organa društva | CORPORATE | društvo | Zakon o privrednim društvima, the founding act |

Supporting changes:

- **Evidence wording by family.** Litigation keeps dokazi and "Pribaviti dokaz: …". Contracts use prilozi; letters and corporate acts use isprave. The brief prompt, task titles and task descriptions follow the family, and so does the Case-work group heading.
- **Urgent fields** can carry their own task description. Example: the publication date for a media reply, because the request deadline runs from it.
- **DOCX export** uses the document type for the title and the file name (for example `zalba-….docx`) instead of a fixed "Tužba".
- **Agent prompt.** The prompt no longer names the supported types; the tool description lists them. Any other document is still declined. For a contract, the agent asks which side the office represents.
- **Starter cards:**
  - Contract, with a client picker.
  - Opomena pred utuženje, with a case picker.
  - Media reply/correction.
  - Punomoćje, with a client picker.
  - Case card: opomena.

## Why

The office's practice is mostly contracts and media law. With the Phase 1 registry, each of these types is a data entry rather than a pipeline change.

## Out of scope

- Contract review (Phase 3).
- House clause libraries.
- Ugovor o delu / dopunskom radu as separate types (they can be added later as registry entries).
