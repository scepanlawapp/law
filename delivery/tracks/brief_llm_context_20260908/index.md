# Brief LLM Context

- **Track ID:** `brief_llm_context_20260908`
- **Type:** Feature
- **Status:** Pending

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Pending. Raw extraction (`brief_agent_extraction_20260907`) is done and `WorkflowJob.output` already holds `userText` + extracted texts, but no LLM turns that context into structured tužba facts. This track adds the OpenRouter structured-output call, prompt-budget context builder, and `BriefExtractionResult` persistence.
