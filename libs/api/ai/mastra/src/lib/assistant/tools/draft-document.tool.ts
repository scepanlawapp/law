import { createTool } from "@mastra/core/tools";
import { DRAFT_DOCUMENT_TYPES } from "@law/api-interfaces";
import { listDocumentTypes } from "@law/brief-extraction";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const DRAFT_DOCUMENT_TOOL_ID = "draft_document";

const TYPE_LIST = listDocumentTypes()
  .map((type) => `${type.id}: ${type.agentDescription}`)
  .join("; ");

/** Side effect: reversible (a new draft awaiting lawyer approval). */
export function createDraftDocumentTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: DRAFT_DOCUMENT_TOOL_ID,
    description: `Prepares a draft legal document from the client's messages in this conversation, its attachments, and any documents named in documentRefs: extracts the facts, finds legal sources, and saves a new draft for lawyer review. Takes up to a minute. Call it once per request; do not write the document text yourself. Document types: ${TYPE_LIST}.`,
    inputSchema: z.object({
      documentType: z
        .enum(DRAFT_DOCUMENT_TYPES)
        .describe("Which document to draft; ask the user when it is unclear"),
      note: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .describe(
          "Optional clarification from the conversation that the facts should include",
        ),
      documentRefs: z
        .array(z.string().trim().min(1))
        .max(5)
        .optional()
        .describe(
          "Refs (doc:…) of filed documents the draft relies on, e.g. the judgment for an appeal or the served lawsuit for a statement of defence. Attachments of this conversation are included automatically.",
        ),
    }),
    execute: async ({ documentType, note, documentRefs }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.draftDocument(requestContext.get("turn"), {
        documentType,
        note,
        documentRefs,
      });
    },
  });
}
