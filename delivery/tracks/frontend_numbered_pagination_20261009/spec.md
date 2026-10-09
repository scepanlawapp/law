# Frontend Numbered Pagination

Replace every frontend page-change button group with installed Spartan numbered pagination, total items/pages, and an items-per-page select. Default page size is 50. Prefer the query-parameter variant where route ownership permits; dialogs must not mutate parent pagination query parameters.

Preserve SR/EN localization, semantic themes, filters, sorting, reset/clamp behavior, and request correctness. Do not change infinite scroll, load-more behavior or sizes, or option lookup requests. Generate the missing Helm pagination family using the installed CLI only.

Acceptance: focused pagination tests pass, web lint/build pass, and available browser verification covers desktop/mobile navigation, size changes, and reset behavior. Record unavailable verification explicitly.
