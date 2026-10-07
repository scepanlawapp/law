import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const SUMMARIZE_CASE_DOCUMENTS_TOOL_ID = "summarize_case_documents";

/** Side effect: reversible (stores a read-only analysis; changes no records). */
export function createSummarizeCaseDocumentsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SUMMARIZE_CASE_DOCUMENTS_TOOL_ID,
    description:
      "Builds a sourced chronology and a summary of the conversation's case documents and attachments (or only the documents in documentRefs): reads each document, extracts dated events with verified quotes, and saves the timeline to the Analysis panel. Takes up to a few minutes. Call it once per request; do not build the timeline yourself.",
    inputSchema: z.object({
      documentRefs: z
        .array(z.string().trim().min(1))
        .max(20)
        .optional()
        .describe(
          "Only these documents (refs from list_documents); omit to use all of the case's documents and attachments",
        ),
      focus: z
        .string()
        .trim()
        .max(500)
        .optional()
        .describe("Optional topic the user wants the chronology to focus on"),
    }),
    execute: async ({ documentRefs, focus }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.summarizeCaseDocuments(requestContext.get("turn"), {
        documentRefs,
        focus,
      });
    },
  });
}
