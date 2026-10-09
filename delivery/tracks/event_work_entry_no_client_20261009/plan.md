# Plan

- [x] Make the WorkEntry client relation nullable and add a migration.
- [x] Update shared contracts, DTOs, service validation/mapping, and event write-off creation.
- [x] Update time views and capture/edit UI for clientless event work.
- [x] Verify client-specific billing and reporting exclude clientless work.
- [x] Add focused API/frontend tests, update business documentation, and complete the track.

Validation: 152 focused API tests and 70 focused frontend tests passed. The API build and Angular development build passed. The production build compiled but failed the configured initial bundle budget (2.34 MB against 1.75 MB); the broader frontend test run also exposed an existing MyTime fixture error for `collapsibleSidebar`. Migration `20261009160000_event_work_entry_optional_client` was applied locally.
