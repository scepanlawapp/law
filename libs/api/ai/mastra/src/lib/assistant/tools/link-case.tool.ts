import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const LINK_CASE_TOOL_ID = "link_case";

/** Side effect: confirm. The user's permission mode decides how it is applied. */
export function createLinkCaseTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LINK_CASE_TOOL_ID,
    description:
      "Proposes linking this conversation to a case (predmet) of the office. The user's permission mode decides whether it is linked directly (EXECUTED) or proposed in a confirmation card (CONFIRMATION_REQUIRED).",
    inputSchema: z.object({
      caseReference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .describe("Case number or part of the case name"),
    }),
    execute: async ({ caseReference }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "link_case",
        caseReference,
      });
    },
  });
}
