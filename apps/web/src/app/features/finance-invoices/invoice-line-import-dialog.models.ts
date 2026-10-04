import { ClientSummary } from "@law/api-interfaces";

export interface InvoiceLineImportDialogContext {
  client: ClientSummary;
  /** Work entries that already back a line of the invoice. */
  excludedEntryIds: string[];
}
