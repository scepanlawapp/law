# Mastra Foundation — Plan

- [x] Create this track and link it from `delivery/index.md`. Tick phase 1 in the epic plan when done.
- [x] Install `@mastra/core` and `@mastra/pg`. Check the peer dependencies (zod) and Node engine.
- [x] Scaffold `libs/api/ai/mastra` (`project.json`, tsconfigs, jest, eslint, `package.json`) and add the `@law/mastra` path alias.
- [x] Add the model config (`toModelRouterId`, `AssistantModelConfig`).
- [x] Add `MastraChatModelProvider` (structured output + streaming), implementing `ChatModelProvider`.
- [x] Add `createLawMastra` (Mastra instance + `PostgresStore` in schema `mastra`). Export it without wiring it into the API boot. Tracing moves to phase 3, because it needs the separate `@mastra/observability` package.
- [x] Add unit tests with Mastra's mock model under ts-jest.
- [x] Add `LLM_BACKEND` to `ChatRuntimeConfig` and `.env.example`, and switch `resolveChatModelProvider`.
- [x] Verify: `nx test mastra`, `nx test llm`, `nx test triage`, the chat spec in `apps/api`, `nx build api`, and lint on the changed projects.
- [x] Update `AI_ARCHITECTURE.md` (findings) and `.github/bussiness-logic-done-so-far.md` if behavior is affected (opt-in flag only).

## Findings

- **Packages:** `@mastra/core` 1.71 and `@mastra/pg` 1.27. The peer dependency accepts `zod ^3.25 || ^4`, so the repo's zod 3.25.76 works and zod 3 schemas can be passed straight to `structuredOutput`. Node must be `>=22.13`; the local version is 22.22.
- **Runtime:** Mastra ships CommonJS builds. The Nest webpack build keeps `node_modules` external, and Node 22 `require()`s Mastra's ESM-only dependencies natively, so `nx build api` passes with no config changes.
- **Jest:** Jest 30 cannot `require()` ESM, and `@mastra/core` also calls `import()` at run time (for example `await import("p-map")` on every prompt).
  - `--experimental-vm-modules` does not work, because it makes Jest load all `type: module` packages as native ESM and breaks the CommonJS `require` chain.
  - The fix is the root `jest.esm-interop.cjs`. It computes the ESM-only packages in Mastra's dependency tree (using Node-style nested resolution) and adds `@mastra/core` itself. babel then compiles those packages, turning `import()` into `require()`.
  - `libs/api/ai/mastra` and `apps/api` use it. The first run is slower while babel compiles; warm runs are no slower than before.
- **Model routing:**
  - `openrouter/<OPENROUTER_MODEL>` together with an explicit `url` and `apiKey` makes Mastra call `OPENROUTER_BASE_URL` as an OpenAI-compatible endpoint. The provider is not looked up through the models.dev gateway.
  - Always adding the `openrouter/` prefix is correct: `openrouter/openrouter/auto` resolves to the model `openrouter/auto`.
- **`generate()` does not throw on failure.** It returns an `error` field, so the adapter rethrows it, and it re-parses the result with the caller's zod schema so defaults apply as before.

## Verification results

- `nx test mastra`: 7 tests (model id mapping, structured output, schema rejection, system prompt passed as instructions + streaming, factory).
- `nx test api`: 21 suites and 114 tests pass, including the new `chat-model.util.spec.ts` for the backend switch. Before the change: 20 suites and 110 tests.
- `nx run-many -t test -p llm triage brief-extraction drafting title-generation`: pass.
- `nx build api`: pass. `nx run-many -t lint -p mastra api llm`: pass.
- **Live OpenRouter smoke test** (`google/gemini-3.8-flash`, synthetic prompts, run as a scratch script and not committed):
  - Legacy and Mastra gave the same triage decisions (LEGAL/DRAFT and NON_LEGAL) and the same title. Streaming worked on both, and latency was similar (about 12.5s vs 13.1s for the whole run).
  - Mastra brief extraction and drafting produced valid `BriefResult` and `DraftResult`, including nullable fields, `missingFields`, and `[UNOS POTREBAN: …]` placeholders.
- **Not verified:** `createLawMastra` against a live Postgres (creating the `mastra` schema). The API does not start it yet; that is covered when phase 4 wires in workflows.
