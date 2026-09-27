import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import { CLIENT_STATUSES, personInput } from "./office-schemas";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const SEARCH_CLIENTS_TOOL_ID = "search_clients";

/** Side effect: none. */
export function createSearchClientsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SEARCH_CLIENTS_TOOL_ID,
    description:
      "Lists clients (klijenti) of the office by name, client number, email, or phone, by status, or by responsible lawyer. Use get_client for the details of one client. Read-only.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Part of the name, client number, email, or phone"),
      status: z.enum(CLIENT_STATUSES).optional(),
      responsible: personInput.optional(),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.searchClients(requestContext.get("turn"), input);
    },
  });
}
