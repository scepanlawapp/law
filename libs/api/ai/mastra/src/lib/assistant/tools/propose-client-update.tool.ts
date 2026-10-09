import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const PROPOSE_CLIENT_UPDATE_TOOL_ID =
  "propose_client_update_from_document";

/** Side effect: confirm (proposal only; a user must approve it). */
export function createProposeClientUpdateTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: PROPOSE_CLIENT_UPDATE_TOOL_ID,
    description:
      "Proposes filling EMPTY fields of the client (JMBG, name, registration or tax number, address, identification document) with the verified facts of one person or company subject from get_document_facts. The document must be filed for exactly one client and the subject must be that client (never the opposing party). Existing values are never changed. Nothing changes until the user approves the confirmation card.",
    inputSchema: z.object({
      documentRef: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .describe("Ref of the filed document (doc:…) the facts come from"),
      subjectKey: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("subjectKey of the subject in get_document_facts"),
    }),
    execute: async ({ documentRef, subjectKey }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "update_client_from_document",
        documentRef,
        subjectKey,
      });
    },
  });
}
