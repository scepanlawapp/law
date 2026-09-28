import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const LIST_DOCUMENTS_TOOL_ID = "list_documents";

/** Side effect: none. */
export function createListDocumentsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LIST_DOCUMENTS_TOOL_ID,
    description:
      "Lists the documents you can read: files attached in this conversation and documents filed on the conversation's case (predmet). Returns a ref per document for read_document and search_documents. Read-only.",
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.listDocuments(requestContext.get("turn"));
    },
  });
}
