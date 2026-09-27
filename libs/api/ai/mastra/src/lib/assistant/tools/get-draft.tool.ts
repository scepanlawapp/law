import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_DRAFT_TOOL_ID = "get_draft";

/** Side effect: none. */
export function createGetDraftTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_DRAFT_TOOL_ID,
    description:
      "Reads a draft of this conversation: text, approval status, warnings, and cited sources. Defaults to the latest draft. Read-only.",
    inputSchema: z.object({
      draftId: z
        .string()
        .trim()
        .optional()
        .describe(
          "Draft id from the conversation drafts list; omit for the latest",
        ),
    }),
    execute: async ({ draftId }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getDraft(requestContext.get("turn"), { draftId });
    },
  });
}
