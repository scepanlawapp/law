import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import { dayInput, personInput } from "./office-schemas";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_AGENDA_TOOL_ID = "get_agenda";

/** Side effect: none. */
export function createGetAgendaTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_AGENDA_TOOL_ID,
    description:
      "Returns the agenda (raspored) for a date range of at most 31 days: events, tasks, and deadlines in time order, for the current user, a colleague, or the whole office. Read-only.",
    inputSchema: z.object({
      from: dayInput.describe("First day (YYYY-MM-DD)"),
      to: dayInput.describe("Last day, inclusive (YYYY-MM-DD)"),
      person: personInput.default("me"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getAgenda(
        requestContext.get("turn"),
        input as { from: string; to: string; person?: string },
      );
    },
  });
}
