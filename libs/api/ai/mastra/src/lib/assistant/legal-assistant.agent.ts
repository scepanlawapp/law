import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { LegalAssistantRequestContext } from "./legal-assistant.context";
import { buildLegalAssistantInstructions } from "./legal-assistant.prompt";
import { createCreateDeadlineTool } from "./tools/create-deadline.tool";
import { createCreateTasksFromBriefTool } from "./tools/create-tasks-from-brief.tool";
import { createDraftLawsuitTool } from "./tools/draft-lawsuit.tool";
import { createGetCaseTool } from "./tools/get-case.tool";
import { createGetDraftTool } from "./tools/get-draft.tool";
import { createLinkCaseTool } from "./tools/link-case.tool";
import { createListDraftsTool } from "./tools/list-drafts.tool";
import { createReviseDraftTool } from "./tools/revise-draft.tool";
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
        workspaceState: context.get("workspaceState"),
        intent: context.get("intent"),
        today: context.get("today"),
      });
    },
    model: options.model,
    tools: {
      search_legal_sources: createSearchLegalSourcesTool(options.deps),
      get_case: createGetCaseTool(options.deps),
      draft_lawsuit: createDraftLawsuitTool(options.deps),
      revise_draft: createReviseDraftTool(options.deps),
      get_draft: createGetDraftTool(options.deps),
      list_conversation_drafts: createListDraftsTool(options.deps),
      link_case: createLinkCaseTool(options.deps),
      create_deadline: createCreateDeadlineTool(options.deps),
      create_tasks_from_brief: createCreateTasksFromBriefTool(options.deps),
    },
  });
}
