import { BillingSuggestion } from "@law/api-interfaces";

export interface BillingEntryDialogContext {
  candidate?: BillingSuggestion;
  clientId?: string;
  caseIds?: string[];
  kind?: "TIME" | "FIXED_FEE" | "EXPENSE";
}
