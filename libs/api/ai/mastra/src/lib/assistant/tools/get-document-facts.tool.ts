import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_DOCUMENT_FACTS_TOOL_ID = "get_document_facts";

/** Side effect: none. */
export function createGetDocumentFactsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_DOCUMENT_FACTS_TOOL_ID,
    description:
      "Returns the structured facts extracted from ID cards, passports, APR excerpts, and court or administrative decisions among this conversation's documents (or one document ref): personal and company data of the parties (names, JMBG, addresses, registration numbers, decision dates and outcomes), each with the quote it came from. Facts that two documents report differently for the same person or company are listed in conflicts. Lists documents that are not processed yet (notIndexed) and documents with AI access off (aiAccessOff). truncated is true when older documents or facts were left out; say so and narrow by ref. Read-only.",
    inputSchema: z.object({
      ref: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Limit the facts to one document ref"),
    }),
    execute: async ({ ref }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getDocumentFacts(requestContext.get("turn"), { ref });
    },
  });
}
