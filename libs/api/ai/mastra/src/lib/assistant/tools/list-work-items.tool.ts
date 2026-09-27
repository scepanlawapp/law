import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  caseReferenceInput,
  clientReferenceInput,
  dayInput,
  personInput,
} from "./office-schemas";
import {
  ASSISTANT_WORK_KINDS,
  ASSISTANT_WORK_STATES,
  type LegalAssistantToolDeps,
  type WorkItemQuery,
} from "./tool-deps";

export const LIST_WORK_ITEMS_TOOL_ID = "list_work_items";

/** Side effect: none. */
export function createListWorkItemsTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LIST_WORK_ITEMS_TOOL_ID,
    description:
      "Lists tasks (zadaci), deadlines (rokovi), and events (događaji, ročišta) by case, client, or person, earliest due first. Without case, client, or person it uses the linked case, or else the current user. Read-only.",
    inputSchema: z.object({
      kind: z.enum(ASSISTANT_WORK_KINDS).default("all"),
      state: z
        .enum(ASSISTANT_WORK_STATES)
        .default("open")
        .describe("open (not finished), done, or all"),
      case: caseReferenceInput.optional(),
      client: clientReferenceInput.optional(),
      person: personInput.optional(),
      from: dayInput.optional().describe("Due on or after (YYYY-MM-DD)"),
      to: dayInput.optional().describe("Due on or before (YYYY-MM-DD)"),
      overdueOnly: z
        .boolean()
        .optional()
        .describe("Only unfinished tasks and deadlines past their due date"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.listWorkItems(requestContext.get("turn"), {
        ...(input as Omit<WorkItemQuery, "linkedCaseId">),
        linkedCaseId: requestContext.get("sessionCaseId"),
      });
    },
  });
}
