import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const LINK_CASE_TOOL_ID = "link_case";

/** Side effect: confirm (proposal only; a user must approve it). */
export function createLinkCaseTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LINK_CASE_TOOL_ID,
    description:
      "Proposes linking this conversation to a case (predmet) of the office. Nothing changes until the user approves the confirmation card.",
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
