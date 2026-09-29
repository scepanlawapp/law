# Frontend Currency Selects Specification

## Problem

Finance forms and filters accept free-text three-letter currency codes. This permits inconsistent or unsupported values and does not use the existing localized currency names.

## Included

- Define the requested ordered `Currency` enum whose values are localization keys.
- Expose one shared ordered option list that maps ISO currency codes to those translation keys.
- Replace every frontend currency input and currency filter with the installed Helm select.
- Display localized currency names in select triggers and option lists while preserving three-letter codes in API payloads.
- Keep optional filters clearable through an “all” option.

## Excluded

- Backend currency-contract or database changes.
- Reformatting read-only currency values outside entry/filter controls.
- Exchange-rate or currency-conversion behavior.
