import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type {
  AssistantActionRequest,
  LegalAssistantToolDeps,
} from "./tool-deps";

type RescheduleRequest = Extract<
  AssistantActionRequest,
  { type: "reschedule_event" }
>;
type CancelRequest = Extract<AssistantActionRequest, { type: "cancel_event" }>;

export const RESCHEDULE_EVENT_TOOL_ID = "reschedule_event";
export const CANCEL_EVENT_TOOL_ID = "cancel_event";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** How the user names one of their upcoming events. */
const lookupSchema = {
  participant: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .optional()
    .describe("Colleague, client, or contact person on the event, by name in the nominative case"),
  date: DATE.optional().describe("Current date of the event as YYYY-MM-DD"),
  startTime: TIME.optional().describe("Current start time as HH:mm (Europe/Belgrade)"),
  title: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .optional()
    .describe("Words from the event title"),
};

/**
 * Side effect: confirm. The user's permission mode decides whether the new time
 * is prefilled in the event form, proposed in a card, or saved directly.
 */
export function createRescheduleEventTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: RESCHEDULE_EVENT_TOOL_ID,
    description:
      "Moves one of the current user's upcoming calendar events to a new date and/or time. Identify the event by participant, current date, time, or title. Depending on the user's permission mode it is saved directly (EXECUTED), opened as a prefilled form (FORM_REQUIRED), or shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID with candidates when several events match.",
    inputSchema: z.object({
      ...lookupSchema,
      newDate: DATE.optional().describe("New date as YYYY-MM-DD; omit to keep the date"),
      newStartTime: TIME.optional().describe("New start time as HH:mm; omit to keep the time"),
      durationMinutes: z
        .number()
        .int()
        .min(5)
        .max(720)
        .optional()
        .describe("New length in minutes; omit to keep the current length"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "reschedule_event",
        ...(input as Omit<RescheduleRequest, "type">),
      });
    },
  });
}

/** Side effect: confirm. Cancelling cannot be undone, so it is always a card. */
export function createCancelEventTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: CANCEL_EVENT_TOOL_ID,
    description:
      "Proposes cancelling one of the current user's upcoming calendar events. Identify the event by participant, date, time, or title. Always shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID with candidates when several events match.",
    inputSchema: z.object(lookupSchema),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "cancel_event",
        ...(input as Omit<CancelRequest, "type">),
      });
    },
  });
}
