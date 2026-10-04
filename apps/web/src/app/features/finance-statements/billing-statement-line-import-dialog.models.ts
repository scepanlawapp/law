import { ClientSummary } from "@law/api-interfaces";

export interface BillingStatementLineImportDialogContext {
  client: ClientSummary;
  /** Work entries that already back a line of the statement. */
  excludedEntryIds: string[];
}
