import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const DRAFT_LAWSUIT_TOOL_ID = "draft_lawsuit";

/** Side effect: reversible (a new draft awaiting lawyer approval). */
export function createDraftLawsuitTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: DRAFT_LAWSUIT_TOOL_ID,
    description:
      "Prepares a lawsuit (tužba) draft from the client's messages in this conversation and its attachments: extracts the facts, finds legal sources, and saves a new draft for lawyer review. Takes up to a minute. Call it once per request; do not write the lawsuit text yourself.",
    inputSchema: z.object({
      note: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .describe(
          "Optional clarification from the conversation that the facts should include",
        ),
    }),
    execute: async ({ note }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.draftLawsuit(requestContext.get("turn"), { note });
    },
  });
}
