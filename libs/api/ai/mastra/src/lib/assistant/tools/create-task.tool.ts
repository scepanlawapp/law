import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  ASSISTANT_TASK_PRIORITIES,
  type AssistantActionRequest,
  type LegalAssistantToolDeps,
} from "./tool-deps";

type TaskRequest = Extract<AssistantActionRequest, { type: "create_task" }>;

export const CREATE_TASK_TOOL_ID = "create_task";

/**
 * Side effect: confirm. The user's permission mode decides whether the task is
 * prefilled in a form, proposed in a card, or saved directly.
 */
export function createCreateTaskTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: CREATE_TASK_TOOL_ID,
    description:
      "Creates a task (zadatak) for the current user or a named colleague, optionally for a client and case. Depending on the user's permission mode it is saved directly (EXECUTED), opened as a prefilled form (FORM_REQUIRED), or shown as a confirmation card (CONFIRMATION_REQUIRED). Returns INVALID with candidates when a name matches several records.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(3)
        .max(320)
        .describe("Short task title in Serbian, e.g. 'Poslati ugovor Borku Petroviću'"),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Due date as YYYY-MM-DD, resolved from the conversation and today's date"),
      priority: z
        .enum(ASSISTANT_TASK_PRIORITIES)
        .optional()
        .describe("NORMAL by default"),
      assignee: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe(
          "Colleague who does the task, by name in the nominative case; omit when it is for the current user",
        ),
      client: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Client by name (nominative case) or client number"),
      caseReference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Case number or name; omit to use the linked case, if any"),
      description: z.string().trim().max(2000).optional(),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "create_task",
        ...(input as Omit<TaskRequest, "type">),
      });
    },
  });
}
