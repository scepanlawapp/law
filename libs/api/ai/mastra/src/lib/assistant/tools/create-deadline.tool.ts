import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import {
  ASSISTANT_DEADLINE_TYPES,
  type AssistantActionRequest,
  type LegalAssistantToolDeps,
} from "./tool-deps";

type DeadlineRequest = Extract<
  AssistantActionRequest,
  { type: "create_deadline" }
>;

export const CREATE_DEADLINE_TOOL_ID = "create_deadline";

/** Side effect: confirm (proposal only; a user must approve it). */
export function createCreateDeadlineTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: CREATE_DEADLINE_TOOL_ID,
    description:
      "Proposes a new deadline (rok) on the linked case or on a named case. The case's responsible lawyer becomes responsible. Nothing changes until the user approves the confirmation card.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(3)
        .max(320)
        .describe("Short deadline title in Serbian"),
      dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe(
          "Due date as YYYY-MM-DD, resolved from the conversation and today's date",
        ),
      deadlineType: z
        .enum(ASSISTANT_DEADLINE_TYPES)
        .optional()
        .describe("COURT, STATUTORY, CONTRACTUAL, INTERNAL, or OTHER"),
      description: z.string().trim().max(2000).optional(),
      caseReference: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .optional()
        .describe("Case number or name; omit for the linked case"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.proposeAction(requestContext.get("turn"), {
        type: "create_deadline",
        ...(input as Omit<DeadlineRequest, "type">),
      });
    },
  });
}
