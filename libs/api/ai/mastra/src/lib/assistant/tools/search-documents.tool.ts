import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const SEARCH_DOCUMENTS_TOOL_ID = "search_documents";

/** Side effect: none. */
export function createSearchDocumentsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SEARCH_DOCUMENTS_TOOL_ID,
    description:
      "Searches the text of this conversation's attachments and the case's documents (or one doc:<id> ref the user named) for a word or phrase (case, script, and diacritic insensitive). Returns snippets with offsets for read_document. If nothing matches, try shorter key words or word stems. Read-only.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(200)
        .describe("Word or exact phrase to find"),
      ref: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Limit the search to one document ref"),
    }),
    execute: async ({ query, ref }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.searchDocuments(requestContext.get("turn"), { query, ref });
    },
  });
}
