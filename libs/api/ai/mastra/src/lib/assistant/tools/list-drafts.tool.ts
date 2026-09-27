import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const LIST_DRAFTS_TOOL_ID = "list_conversation_drafts";

/** Side effect: none. */
export function createListDraftsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LIST_DRAFTS_TOOL_ID,
    description:
      "Lists the drafts of this conversation (id, version, approval status, title), oldest first. Read-only.",
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.listDrafts(requestContext.get("turn"));
    },
  });
}
