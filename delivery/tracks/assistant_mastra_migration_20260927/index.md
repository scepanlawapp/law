# Assistant Mastra Migration (epic)

Rebuild the assistant's AI layer on the Mastra TypeScript framework. The end state is one stateless main agent per turn, with multi-turn context rebuilt from our database, tools that call the existing business services, the drafting pipeline as a Mastra workflow, and confirmations for writes. The migration is incremental and sits behind the `ASSISTANT_ENGINE` flag.

- **Status:** in_progress (phase 0, the audit and the plan, is done)
- **Target design:** [AI_ARCHITECTURE.md](../../../AI_ARCHITECTURE.md)
- **Specification:** [spec.md](spec.md)
- **Plan:** [plan.md](plan.md)
- **Metadata:** [metadata.json](metadata.json)
