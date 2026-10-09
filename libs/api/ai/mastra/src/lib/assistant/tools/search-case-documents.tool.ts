import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  CASE_DOCUMENT_SEARCH_DEFAULT_LIMIT,
  CASE_DOCUMENT_SEARCH_MAX_LIMIT,
  type LegalAssistantToolDeps,
} from "./tool-deps";

export const SEARCH_CASE_DOCUMENTS_TOOL_ID = "search_case_documents";

/** Side effect: none. */
export function createSearchCaseDocumentsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SEARCH_CASE_DOCUMENTS_TOOL_ID,
    description:
      "Semantic search over the content of this conversation's attachments and the case's documents (or one document ref): finds the passages that best answer a question or topic, ranked by relevance, even when the exact words differ. Returns numbered passages with the document title and character offsets for read_document. Use it for questions about what documents say; use search_documents for an exact number, name, or quote. Lists documents that are not indexed yet (notIndexed) and documents with AI access off (aiAccessOff). truncated is true when older documents or facts were left out; say so and narrow by ref. Read-only.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(300)
        .describe("Question or topic in natural language"),
      ref: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Limit the search to one document ref"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(CASE_DOCUMENT_SEARCH_MAX_LIMIT)
        .default(CASE_DOCUMENT_SEARCH_DEFAULT_LIMIT)
        .describe("Maximum passages to return"),
    }),
    execute: async ({ query, ref, limit }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.searchCaseDocuments(requestContext.get("turn"), {
        query,
        ref,
        limit,
      });
    },
  });
}
