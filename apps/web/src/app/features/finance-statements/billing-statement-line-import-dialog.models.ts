import { ClientSummary } from "@law/api-interfaces";

export interface BillingStatementLineImportDialogContext {
  client: ClientSummary;
  excludedSourceKeys: string[];
}
