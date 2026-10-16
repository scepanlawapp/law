# Frontend Shared Models, Enums and Localization

## What

One place for every frontend enum, label map, option list, sort definition, locale and shared type:

- **Contract enums** in `@law/api-interfaces`: every string-literal union is an enum-like const object with a type of the same name (`CaseStatus.DRAFT`, type `CaseStatus`). Array-backed unions also get an object via `enumOf(...)`.
- **Web shared models** in `apps/web/src/app/shared/models`:
  - `select-option.ts`: `SelectOption`, `LabelMap`, `optionsFrom`, `filterOptionsFrom`, `createSelectItemToString`, `labelOf`.
  - `labels/*.labels.ts`: enum → translation-key maps per domain (`CASE_STATUS_LABELS`, …) and sort field definitions.
  - `sort.ts`: universal sort (`SortFields`, `sortOptions`, `createSortItemToString`, `parseSort`) on the `field:direction` wire format.
  - `locale.ts`: `INTL_LOCALES`, `intlLocale`, `TRANSLATION_FILES`, `COUNTRY_LOCALES`, `OFFICE_TIME_ZONE`; `LocalizationService.locale()`.
- **Pagination**: one default page size (100) in `shared/pagination`; screens and lookups stop passing their own sizes. Dashboard counters keep `pageSize: 1`.
- No hard-coded enum literals or language ternaries in components; every user-visible string is localized (SR/EN).
- Organization rules recorded in the always-on agent instructions.

## Why

Option arrays, label keys, locale ternaries and page sizes were duplicated across screens, which makes changes error-prone and inconsistent.

## Acceptance

- Web and API type-check; web lint passes on changed files; focused web tests pass (pre-existing calendar / statement-create failures excepted).
- No `language() === "EN"` ternaries, inline enum option arrays, or literal page sizes (outside dashboard counters) remain in `apps/web`.
