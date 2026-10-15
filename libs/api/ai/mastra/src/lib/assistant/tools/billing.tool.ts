import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LegalAssistantRequestContext } from "../legal-assistant.context";
import { clientReferenceInput } from "./office-schemas";
import type { LegalAssistantToolDeps } from "./tool-deps";

export const GET_CLIENT_BILLING_TOOL_ID = "get_client_billing";
export const LIST_RECEIVABLES_TOOL_ID = "list_receivables";

/** Side effect: none. */
export function createGetClientBillingTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: GET_CLIENT_BILLING_TOOL_ID,
    description:
      "Returns one client's money picture within the current user's finance permissions: open invoices (remaining amount, due date, days overdue, totals per currency), confirmed work not yet invoiced (minutes and recorded value per currency), and retainer usage for a month. A part the user may not see is NOT_ALLOWED. Read-only.",
    inputSchema: z.object({
      client: clientReferenceInput,
      month: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional()
        .describe("Month for retainer usage as YYYY-MM; omit for the current month"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.getClientBilling(
        requestContext.get("turn"),
        input as { client: string; month?: string },
      );
    },
  });
}

/** Side effect: none. */
export function createListReceivablesTool(deps: LegalAssistantToolDeps) {
  return createTool({
    id: LIST_RECEIVABLES_TOOL_ID,
    description:
      "Lists clients with open (unpaid) invoice balances across the office, most overdue first, with totals per currency and the longest overdue days. Only for users with finance access (NOT_ALLOWED otherwise). Read-only.",
    inputSchema: z.object({
      overdueOnly: z
        .boolean()
        .optional()
        .describe("true to list only overdue balances"),
    }),
    execute: async (input, context) => {
      const requestContext =
        context.requestContext as unknown as LegalAssistantRequestContext;
      return deps.listReceivables(
        requestContext.get("turn"),
        input as { overdueOnly?: boolean },
      );
    },
  });
}
