# Work Entry Capture Simplification — Plan

- [x] Track files and delivery index link
- [x] Schema: `WorkEntry.title` (`VARCHAR(200)`, DB default `''` so a running timer may start blank) + migration `20261005090000_work_entry_title` with first-sentence backfill; demo seed titles plus two untimed entries
- [x] Contracts: `title`, optional `minutes`/`description` in `work-entries.ts`; invoice-line work entries carry `title`
- [x] DTOs: title required (max 200), minutes/description optional (create, update, confirm, from-source)
- [x] Service: optional minutes on create/confirm (a running timer still needs minutes); title in mapping, transliteration
- [x] Sources: auto entries titled from task/event/deadline/activity; confirm without minutes → CONFIRMED
- [x] Financials: untimed entries claimable; unbilling always returns to CONFIRMED
- [x] Month-end run: untimed HOURLY → own pricingRequired line "{case} {title}"; untimed RETAINER covered with 0 minutes (also past the cap)
- [x] AI parse: unchanged API; the dialog puts the parsed summary into the title
- [x] Quick-capture dialog: saved required title (AI fill reads it), optional description and minutes (`requireMinutes` only for a stopped timer); i18n
- [x] Remove the completion prompt (component, service, app mount, task board and task dialog callers, i18n)
- [x] Entry lists, time review, month-end pre-check, unbilled work, import dialog and print specification show title; untimed shown as "Bez trajanja"
- [x] Invoice form: line text from title; untimed → pricingRequired
- [x] Tests (API 10 suites / 213 tests; web features 47/48 suites — the Documents date-dependent failure also fails on `main`), API lint, API + web build (web initial-bundle budget error also on `main`), API smoke test; update `.github/bussiness-logic-done-so-far.md`
