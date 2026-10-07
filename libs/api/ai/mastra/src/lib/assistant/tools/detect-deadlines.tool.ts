import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const DETECT_DEADLINES_TOOL_ID = "detect_deadlines";

/** Side effect: confirm (proposes a deadline; a user must approve it). */
export function createDetectDeadlinesTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: DETECT_DEADLINES_TOOL_ID,
    description:
      "Recognizes a served court or administrative act (judgment, ruling, payment order, lawsuit or appeal served for a response, enforcement order, administrative decision), computes the deadline for the response or remedy from the service date by the statutory rules and the Serbian non-working days, and proposes it as a deadline on the linked case for the user to confirm. Returns NEEDS_SERVICE_DATE when the service date is unknown. Never compute such a deadline yourself.",
    inputSchema: z.object({
      documentRef: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Ref of the served document from list_documents (doc:… or att:…), or a doc:… ref the user named",
        ),
      serviceDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Date the document was served on (received by) the client or the office, YYYY-MM-DD, only as the user stated it (resolve relative dates against today); omit when unknown",
        ),
    }),
    execute: async ({ documentRef, serviceDate }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.detectDeadlines(requestContext.get("turn"), {
        documentRef,
        serviceDate,
      });
    },
  });
}
