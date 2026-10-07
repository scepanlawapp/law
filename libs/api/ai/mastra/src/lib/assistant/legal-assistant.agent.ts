import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type { LegalAssistantRequestContext } from "./legal-assistant.context";
import { buildLegalAssistantInstructions } from "./legal-assistant.prompt";
import { createCreateDeadlineTool } from "./tools/create-deadline.tool";
import { createCreateTasksFromBriefTool } from "./tools/create-tasks-from-brief.tool";
import { createDraftDocumentTool } from "./tools/draft-document.tool";
import { createGetAgendaTool } from "./tools/get-agenda.tool";
import { createGetCaseTool } from "./tools/get-case.tool";
import { createGetClientTool } from "./tools/get-client.tool";
import { createGetDraftTool } from "./tools/get-draft.tool";
import { createLinkCaseTool } from "./tools/link-case.tool";
import { createListActivityTool } from "./tools/list-activity.tool";
import { createListDocumentsTool } from "./tools/list-documents.tool";
import { createListDraftsTool } from "./tools/list-drafts.tool";
import { createListWorkItemsTool } from "./tools/list-work-items.tool";
import { createReadDocumentTool } from "./tools/read-document.tool";
import { createReviewContractTool } from "./tools/review-contract.tool";
import { createReviseDraftTool } from "./tools/revise-draft.tool";
import { createSearchCasesTool } from "./tools/search-cases.tool";
import { createSearchClientsTool } from "./tools/search-clients.tool";
import { createSearchDocumentsTool } from "./tools/search-documents.tool";
import { createSearchLegalSourcesTool } from "./tools/search-legal-sources.tool";
import { createSummarizeCaseDocumentsTool } from "./tools/summarize-case-documents.tool";
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
        conversationSummary: context.get("conversationSummary"),
        currentUser: context.get("turn")?.userDisplayName ?? null,
        intent: context.get("intent"),
        today: context.get("today"),
      });
    },
    model: options.model,
    tools: {
      search_legal_sources: createSearchLegalSourcesTool(options.deps),
      get_case: createGetCaseTool(options.deps),
      search_cases: createSearchCasesTool(options.deps),
      search_clients: createSearchClientsTool(options.deps),
      get_client: createGetClientTool(options.deps),
      list_work_items: createListWorkItemsTool(options.deps),
      get_agenda: createGetAgendaTool(options.deps),
      list_activity: createListActivityTool(options.deps),
      list_documents: createListDocumentsTool(options.deps),
      read_document: createReadDocumentTool(options.deps),
      search_documents: createSearchDocumentsTool(options.deps),
      draft_document: createDraftDocumentTool(options.deps),
      revise_draft: createReviseDraftTool(options.deps),
      review_contract: createReviewContractTool(options.deps),
      summarize_case_documents: createSummarizeCaseDocumentsTool(options.deps),
      get_draft: createGetDraftTool(options.deps),
      list_conversation_drafts: createListDraftsTool(options.deps),
      link_case: createLinkCaseTool(options.deps),
      create_deadline: createCreateDeadlineTool(options.deps),
      create_tasks_from_brief: createCreateTasksFromBriefTool(options.deps),
    },
  });
}
