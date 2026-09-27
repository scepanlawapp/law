import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const REVISE_DRAFT_TOOL_ID = "revise_draft";

/** Side effect: reversible (a new draft version; the previous one is kept). */
export function createReviseDraftTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: REVISE_DRAFT_TOOL_ID,
    description:
      "Creates a new version of a draft in this conversation according to an instruction (e.g. 'skrati obrazloženje', 'dodaj zahtev za troškove postupka'). The previous version is kept. Defaults to the latest draft.",
    inputSchema: z.object({
      instruction: z
        .string()
        .trim()
        .min(3)
        .max(2000)
        .describe("Precise change request in Serbian, Latin script"),
      draftId: z
        .string()
        .trim()
        .optional()
        .describe(
          "Draft id from the conversation drafts list; omit for the latest",
        ),
    }),
    execute: async ({ instruction, draftId }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.reviseDraft(requestContext.get("turn"), {
        instruction,
        draftId,
      });
    },
  });
}
