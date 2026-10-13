# Implementation Plan

- [x] Fix modal flex sizing so long quick-capture content scrolls with header/footer visible; validate shared modal layout and frontend regressions.

Modal scrolling verification: 77 quick-capture/event regression tests pass; scoped lint and Angular development build pass. Playwright with synthetic read-only API responses confirmed long quick-capture and event bodies scroll while header/footer positions remain fixed at desktop 1440x900 and mobile 390x844. Shared dynamic wrappers are non-scrollable; header/body/footer shells preserve inner-body scrolling.

- [x] Add quick-capture Suggest price UI, cancelable requests, value/currency locking and evidence display; verify focused frontend tests and build.

Quick-capture verification: 69 dialog tests and 13 API-client tests pass. Scoped Angular template/component and API-client lint passes. Angular development build passes. The running browser redirects to login; authenticated desktop/mobile runtime verification was not performed. Cancel unsubscribes browser HTTP and prevents stale updates but does not add a server-side cancellation protocol.

- [x] Create track index, specification, plan, metadata and delivery index registration.
- [x] Add shared contracts and validated saved/unsaved request DTOs with pricingFacts.
- [x] Implement bounded authorized context and dated source/version retrieval.
- [x] Implement one-shot AI interpreter and exact evidence verification.
- [x] Implement deterministic supported formula calculations and alternatives.
- [x] Register read-only endpoint without modifying financial mutation paths.
- [x] Test calculations, tariffs, facts, conflicts, authorization and no writes.
- [x] Run focused tests, lint and type checks; document results and scenarios.
- [x] Update implemented-business documentation and completion metadata.

Verification: 30 pricing tests pass; pricing plus existing capture/work-entry/month-end suites pass (162 tests); Mastra adapter suite passes (7 tests, including disabled logging). Changed-file ESLint has no errors and one pre-existing unused-parameter warning. API noEmit was run; it reports 11 pre-existing unknown-property errors in unchanged case-timeline.workflow.ts and none in the pricing slice. An initial Nx invocation unexpectedly ran all API tests: 995 passed, 1 skipped, 1 unrelated config.validation test failed (production secrets validation now precedes its expected file-storage validation). No live OpenRouter/corpus or database end-to-end verification was performed; Nest HTTP tests use mocked storage/model boundaries and real role/DTO validation.
