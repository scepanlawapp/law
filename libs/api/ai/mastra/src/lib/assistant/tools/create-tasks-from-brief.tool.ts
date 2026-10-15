import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const CREATE_TASKS_FROM_BRIEF_TOOL_ID = "create_tasks_from_brief";

/** Side effect: confirm. The user's permission mode decides how it is applied. */
export function createCreateTasksFromBriefTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: CREATE_TASKS_FROM_BRIEF_TOOL_ID,
    description:
      "Proposes tasks for the case from the latest brief of this conversation: one per missing fact and per piece of evidence to collect. The brief must already be applied to a case in the Case-work panel. The user's permission mode decides whether they are created directly (EXECUTED) or proposed in a confirmation card (CONFIRMATION_REQUIRED).",
    inputSchema: z.object({
      briefId: z
        .string()
        .trim()
        .optional()
        .describe("Omit for the latest brief"),
    }),
    execute: async ({ briefId }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "create_tasks_from_brief",
        briefId,
      });
    },
  });
}
