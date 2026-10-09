import { ClientSummary, WorkEntry } from "@law/api-interfaces";

export type InvoiceLineImportMode = "SEPARATE" | "GROUPED";

export interface InvoiceLineImportResult {
  entries: WorkEntry[];
  mode: InvoiceLineImportMode;
}

export interface InvoiceLineImportDialogContext {
  client: ClientSummary;
  /** Work entries that already back a line of the invoice. */
  excludedEntryIds: string[];
}
