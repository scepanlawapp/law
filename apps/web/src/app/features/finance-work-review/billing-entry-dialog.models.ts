import { BillingSuggestion } from "@law/api-interfaces";

export interface BillingEntryDialogContext {
  candidate?: BillingSuggestion;
  clientId?: string;
  caseId?: string;
  kind?: "TIME" | "FIXED_FEE" | "EXPENSE";
}
