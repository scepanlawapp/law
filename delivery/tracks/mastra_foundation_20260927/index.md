# Mastra Foundation

Phase 1 of the [Assistant Mastra Migration](../assistant_mastra_migration_20260927/index.md) epic. This phase installs Mastra, confirms it works in the Nest API build and in Jest, and adds the `@law/mastra` library. It also adds a Mastra-backed `ChatModelProvider`, off by default behind `LLM_BACKEND`, so the existing pipeline can run on Mastra models with no change in behavior.

- **Status:** completed
- **Specification:** [spec.md](spec.md)
- **Plan:** [plan.md](plan.md)
- **Metadata:** [metadata.json](metadata.json)
