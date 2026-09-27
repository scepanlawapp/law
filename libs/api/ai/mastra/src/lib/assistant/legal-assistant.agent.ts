import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { LegalAssistantRequestContext } from "./legal-assistant.context";
import { buildLegalAssistantInstructions } from "./legal-assistant.prompt";
import { createGetCaseTool } from "./tools/get-case.tool";
import { createSearchLegalSourcesTool } from "./tools/search-legal-sources.tool";
import type { LegalAssistantToolDeps } from "./tools/tool-deps";

export const LEGAL_ASSISTANT_AGENT_ID = "legal-assistant";

/**
 * The main assistant agent. Stateless: the orchestrator passes the rebuilt
 * conversation as messages and per-turn values on the RequestContext.
 */
export function createLegalAssistantAgent(options: {
  model: MastraModelConfig;
  deps: LegalAssistantToolDeps;
}): Agent {
  return new Agent({
    id: LEGAL_ASSISTANT_AGENT_ID,
    name: "Legal assistant",
    instructions: ({ requestContext }) => {
      const context = requestContext as unknown as LegalAssistantRequestContext;
      return buildLegalAssistantInstructions({
        language: context.get("language") ?? "sr",
        caseContext: context.get("caseContext"),
      });
    },
    model: options.model,
    tools: {
      search_legal_sources: createSearchLegalSourcesTool(options.deps),
      get_case: createGetCaseTool(options.deps),
    },
  });
}
