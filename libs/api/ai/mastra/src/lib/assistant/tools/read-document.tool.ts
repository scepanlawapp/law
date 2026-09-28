import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const READ_DOCUMENT_TOOL_ID = "read_document";

/** Side effect: none. */
export function createReadDocumentTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: READ_DOCUMENT_TOOL_ID,
    description:
      "Reads the extracted text of one document (conversation attachment or case document) in windows of about 12,000 characters. Continue with nextOffset for long documents. Read-only.",
    inputSchema: z.object({
      ref: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .describe("Document ref from list_documents or search_documents"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Character offset to start from (nextOffset or a search hit offset)",
        ),
    }),
    execute: async ({ ref, offset }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.readDocument(requestContext.get("turn"), { ref, offset });
    },
  });
}
