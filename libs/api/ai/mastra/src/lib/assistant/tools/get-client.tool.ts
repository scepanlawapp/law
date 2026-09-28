import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import { clientReferenceInput } from "./office-schemas";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_CLIENT_TOOL_ID = "get_client";

/** Side effect: none. */
export function createGetClientTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_CLIENT_TOOL_ID,
    description:
      "Reads one client (klijent): type, status, responsible lawyer, contact persons, and open cases. Returns a short list of candidates when the reference is ambiguous. Read-only.",
    inputSchema: z.object({ reference: clientReferenceInput }),
    execute: async ({ reference }, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getClient(requestContext.get("turn"), { reference });
    },
  });
}
