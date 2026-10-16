import {
  ClientSummary,
  WorkEntry,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { LabelMap } from "../../shared/models";

/** Treatments whose confirmed, unbilled work can be invoiced. */
export const INVOICE_IMPORTABLE_TREATMENTS: readonly WorkEntryTreatment[] = [
  WorkEntryTreatment.RETAINER,
  WorkEntryTreatment.HOURLY,
  WorkEntryTreatment.AT,
  WorkEntryTreatment.UNDECIDED,
];

export const InvoiceLineImportMode = {
  SEPARATE: "SEPARATE",
  GROUPED: "GROUPED",
} as const;
export type InvoiceLineImportMode =
  (typeof InvoiceLineImportMode)[keyof typeof InvoiceLineImportMode];

export const INVOICE_LINE_IMPORT_MODE_LABELS: LabelMap<InvoiceLineImportMode> =
  {
    [InvoiceLineImportMode.SEPARATE]: "finance.importSeparate",
    [InvoiceLineImportMode.GROUPED]: "finance.importGrouped",
  };

export interface InvoiceLineImportResult {
  entries: WorkEntry[];
  mode: InvoiceLineImportMode;
}

export interface InvoiceLineImportDialogContext {
  client: ClientSummary;
  /** Work entries that already back a line of the invoice. */
  excludedEntryIds: string[];
}
