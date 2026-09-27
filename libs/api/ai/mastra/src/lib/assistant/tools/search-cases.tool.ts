import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  clientReferenceInput,
  personInput,
} from "./office-schemas";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const SEARCH_CASES_TOOL_ID = "search_cases";

/** Side effect: none. */
export function createSearchCasesTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: SEARCH_CASES_TOOL_ID,
    description:
      "Lists cases (predmeti) of the office by text, status, priority, client, or responsible lawyer, most recently updated first. Use get_case for the details of one case. Read-only.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Part of the case number, name, or external reference"),
      status: z.enum(CASE_STATUSES).optional(),
      priority: z.enum(CASE_PRIORITIES).optional(),
      client: clientReferenceInput.optional(),
      responsible: personInput.optional(),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.searchCases(requestContext.get("turn"), input);
    },
  });
}
