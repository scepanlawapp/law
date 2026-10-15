import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import { dayInput } from "./office-schemas";
import type {
  AssistantActionRequest,
  AssistantWorkEntryInput,
  LegalAssistantToolDeps,
} from "./tool-deps";

export const GET_DAY_WORK_TOOL_ID = "get_day_work";
export const LOG_WORK_ENTRIES_TOOL_ID = "log_work_entries";

/** Side effect: none. */
export function createGetDayWorkTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_DAY_WORK_TOOL_ID,
    description:
      "Returns the current user's day as the time review sees it: time already logged, entries still to confirm, meetings without logged time (with their length and an event ref), and clients worked on without a time entry. Read-only.",
    inputSchema: z.object({
      date: dayInput.optional().describe("Day as YYYY-MM-DD; omit for today"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getDayWork(requestContext.get("turn"), input as { date?: string });
    },
  });
}

const minutesInput = z
  .number()
  .int()
  .min(1)
  .max(1440)
  .describe("Time worked in minutes ('1,5h' is 90)");

const entryInput = z.union([
  z.object({
    eventRef: z
      .string()
      .regex(/^event:[0-9a-f-]{36}$/)
      .describe("Meeting ref (event:…) from get_day_work"),
    minutes: minutesInput.optional().describe("Omit to use the meeting's length"),
    title: z.string().trim().min(3).max(200).optional(),
  }),
  z.object({
    title: z.string().trim().min(3).max(200).describe("What was done, in Serbian"),
    minutes: minutesInput,
    date: dayInput.optional().describe("Day the work was done; omit for today"),
    client: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .optional()
      .describe("Client by name (nominative case) or client number"),
    caseReference: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
  }),
]);

/**
 * Side effect: confirm. Several work entries in one proposal; saved
 * automatically only as PROPOSED work the lawyer confirms in the time review.
 */
export function createLogWorkEntriesTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LOG_WORK_ENTRIES_TOOL_ID,
    description:
      "Records several time entries at once (up to 10), e.g. the meetings get_day_work reports without logged time, plus work the user described with its minutes. Depending on the user's permission mode they are saved directly as proposed entries to confirm in the time review (EXECUTED) or shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID when any entry cannot be resolved; nothing is proposed then.",
    inputSchema: z.object({
      entries: z.array(entryInput).min(1).max(10),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "log_work_entries",
        entries: (input as { entries: AssistantWorkEntryInput[] }).entries,
      } satisfies AssistantActionRequest);
    },
  });
}
