import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  ASSISTANT_EVENT_TYPES,
  type AssistantActionRequest,
  type LegalAssistantToolDeps,
} from "./tool-deps";

type EventRequest = Extract<AssistantActionRequest, { type: "create_event" }>;

export const CREATE_EVENT_TOOL_ID = "create_event";

/**
 * Side effect: confirm. The user's permission mode decides whether the event is
 * prefilled in a form, proposed in a card, or saved directly.
 */
export function createCreateEventTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: CREATE_EVENT_TOOL_ID,
    description:
      "Schedules a calendar event (sastanak, poziv, ročište) for the current user. Participants are colleagues, clients, or client contact persons by name. Depending on the user's permission mode it is saved directly (EXECUTED), opened as a prefilled form (FORM_REQUIRED), or shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID with candidates when a name matches several records.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(3)
        .max(320)
        .describe("Short event title in Serbian, e.g. 'Sastanak sa Borkom Petrovićem'"),
      eventType: z
        .enum(ASSISTANT_EVENT_TYPES)
        .optional()
        .describe("MEETING (default), CALL, HEARING, or OTHER"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Date as YYYY-MM-DD, resolved from the conversation and today's date"),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .describe("Local start time as HH:mm (Europe/Belgrade); 'u podne' is 12:00"),
      durationMinutes: z
        .number()
        .int()
        .min(5)
        .max(720)
        .optional()
        .describe("Length in minutes; default 60"),
      participants: z
        .array(z.string().trim().min(2).max(120))
        .max(10)
        .optional()
        .describe(
          "Other people (colleagues, clients, contact persons) by name in the nominative case ('sa Borkom' → 'Borko'); never include the current user",
        ),
      caseReference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Case number or name; omit to use the linked case, if any"),
      location: z.string().trim().max(320).optional(),
      description: z.string().trim().max(2000).optional(),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "create_event",
        ...(input as Omit<EventRequest, "type">),
      });
    },
  });
}
