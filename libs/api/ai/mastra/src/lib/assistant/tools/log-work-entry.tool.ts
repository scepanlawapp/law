import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import type {
  AssistantActionRequest,
  LegalAssistantToolDeps,
} from "./tool-deps";

type WorkEntryRequest = Extract<
  AssistantActionRequest,
  { type: "log_work_entry" }
>;

export const LOG_WORK_ENTRY_TOOL_ID = "log_work_entry";

/**
 * Side effect: confirm. The user's permission mode decides whether the entry
 * is prefilled in a form, proposed in a card, or saved directly (then only as
 * PROPOSED work the lawyer confirms in the time review).
 */
export function createLogWorkEntryTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LOG_WORK_ENTRY_TOOL_ID,
    description:
      "Records time worked (upis rada) for a client and optionally a case. Depending on the user's permission mode it is saved directly as a proposed entry to confirm in the time review (EXECUTED), opened as a prefilled form (FORM_REQUIRED), or shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID when the client is missing or a name matches several records.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(3)
        .max(200)
        .describe("What was done, in Serbian, e.g. 'Pregled ugovora o zakupu'"),
      minutes: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .describe("Time worked in minutes ('1,5h' is 90)"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Day the work was done as YYYY-MM-DD; omit for today ('juče' is yesterday)"),
      client: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Client by name (nominative case) or client number; omit to use the case's client"),
      caseReference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Case number or name; omit to use the linked case, if any"),
      performer: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Colleague who did the work, by name; omit when it was the current user"),
      description: z.string().trim().max(2000).optional(),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "log_work_entry",
        ...(input as Omit<WorkEntryRequest, "type">),
      });
    },
  });
}
