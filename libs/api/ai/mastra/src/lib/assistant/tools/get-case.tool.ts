import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_CASE_TOOL_ID = "get_case";

/** Side effect: none. */
export function createGetCaseTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_CASE_TOOL_ID,
    description:
      "Reads a case (predmet) of the office. Without a reference it returns the case linked to this conversation. With a reference it searches by case number or name and returns one case or a short list of candidates. Read-only.",
    inputSchema: z.object({
      reference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe(
          "Case number or part of the case name; omit for the linked case",
        ),
    }),
    execute: async ({ reference }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.lookupCase({
        workspaceId: requestContext.get("workspaceId"),
        sessionCaseId: requestContext.get("sessionCaseId"),
        reference,
      });
    },
  });
}
