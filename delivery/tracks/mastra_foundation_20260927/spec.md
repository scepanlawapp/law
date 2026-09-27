# Mastra Foundation — Specification

## Why
Before we build agents and tools, we need to know that Mastra runs inside our stack:

- Nest API built with webpack and `tsc`, emitting CommonJS
- ts-jest
- zod 3.25
- Node 22

We also want a low-risk way to run the current triage, brief-extraction, drafting, answering and title steps on Mastra's model layer. That lets us compare output quality and reliability before the pipeline is restructured.

## What
- **Dependencies:** `@mastra/core` and `@mastra/pg`.
- **New Nx library `libs/api/ai/mastra` (`@law/mastra`):**
  - Model configuration as data. A model id like `openai/gpt-4o-mini` maps to the model-router id `openrouter/openai/gpt-4o-mini`, using the existing `OPENROUTER_API_KEY`.
  - `MastraChatModelProvider`, which implements the existing `ChatModelProvider` interface from `@law/llm`:
    - `completeStructured` calls `agent.generate` with structured output, then validates with the caller's zod schema.
    - `streamText` calls `agent.stream` and yields text deltas.
  - A Mastra instance factory with `PostgresStore` in a separate `mastra` Postgres schema, for later phases (workflow and approval snapshots, traces). It is not started by the API in this phase.
- **API wiring:** the new `LLM_BACKEND=legacy|mastra` setting (default `legacy`) in `ChatRuntimeConfig`. `resolveChatModelProvider` returns the Mastra provider when it is set to `mastra`.

## Non-goals
- Agents with tools, multi-turn context, workflows, schema changes, UI changes. These belong to phases 2–5.
- The API does not create or use the `mastra` schema at boot in this phase.

## Acceptance
- `nx build api` succeeds with `@law/mastra` imported.
- Unit tests for `@law/mastra` run under ts-jest and cover the model id mapping, structured completion, streaming and invalid-output rejection with a mocked model.
- Existing `llm`, `triage` and chat tests pass unchanged.
- The default behavior (`LLM_BACKEND` unset) does not change.
