import { ClientSummary } from "@law/api-interfaces";

export interface InvoiceLineImportDialogContext {
  client: ClientSummary;
  excludedSourceKeys: string[];
}
