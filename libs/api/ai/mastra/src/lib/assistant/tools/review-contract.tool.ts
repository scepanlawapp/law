import { createTool } from "@mastra/core/tools";
import { CONTRACT_REVIEW_TYPES } from "@law/api-interfaces";
import { listContractChecklists } from "@law/contract-review";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const REVIEW_CONTRACT_TOOL_ID = "review_contract";

const TYPE_LIST = listContractChecklists()
  .map((checklist) => `${checklist.id}: ${checklist.agentDescription}`)
  .join("; ");

/** Side effect: reversible (stores a read-only analysis; changes no records). */
export function createReviewContractTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: REVIEW_CONTRACT_TOOL_ID,
    description: `Reviews a contract document for the office's client: key terms, risky clauses, missing clauses, and conflicts with mandatory Serbian law with legal-source citations. Saves the review to the Analysis panel. Takes up to a minute. Call it once per contract; do not review the contract yourself in chat. Contract types (checklists): ${TYPE_LIST}.`,
    inputSchema: z.object({
      documentRef: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Ref of the contract from list_documents (doc:… or att:…), or a doc:… ref the user named",
        ),
      contractType: z
        .enum(CONTRACT_REVIEW_TYPES)
        .describe("Checklist to use; OTHER_CONTRACT when none fits"),
      clientSide: z
        .string()
        .trim()
        .max(200)
        .optional()
        .describe(
          "The party the office represents, as named in the contract or by the user (e.g. 'naručilac Alfa d.o.o.')",
        ),
      focus: z
        .string()
        .trim()
        .max(500)
        .optional()
        .describe("Optional points the user asked to check in particular"),
    }),
    execute: async (
      { documentRef, contractType, clientSide, focus },
      context,
    ) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.reviewContract(requestContext.get("turn"), {
        documentRef,
        contractType,
        clientSide,
        focus,
      });
    },
  });
}
